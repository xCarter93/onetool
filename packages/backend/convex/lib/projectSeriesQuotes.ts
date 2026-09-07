import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { emitRecordCreatedEvent, emitRecordUpdatedEvent } from "../eventBus";
import { calculateLineItemAmount, computeQuoteTotals } from "./money";
import { nextQuoteNumber } from "./orgCounters";
import {
	hasBegunTask,
	projectHasInvoice,
	upcomingSeriesProjects,
} from "./projectSeriesTasks";

export const MAX_QUOTE_TEMPLATES = 20;
export const MAX_QUOTE_LINES = 100;
export const MAX_MANUAL_QUOTE_LINE_WRITES = 2_000;
export const MAX_MANUAL_QUOTE_LINE_READS = 4_000;
export const MAX_GENERATED_QUOTE_LINE_WRITES = 500;
export const MAX_GENERATED_QUOTES = 100;

export type QuoteCopyCounts = {
	createCount: number;
	updateCount: number;
	preservedCount: number;
};

type QuoteSnapshot = Pick<
	Doc<"projectSeriesQuoteVersions">,
	| "title"
	| "clientMessage"
	| "terms"
	| "discountEnabled"
	| "discountAmount"
	| "discountType"
	| "taxEnabled"
	| "taxRate"
	| "pdfSettings"
	| "lineItems"
>;

type InheritedApproval = {
	revisionId: Id<"projectSeriesAgreementRevisions">;
	evidenceId: Id<"quoteDecisionEvidence">;
	approvedAt: number;
	terms: NonNullable<Doc<"projectSeriesAgreementRevisions">["terms"]>;
};

async function projectStarted(ctx: QueryCtx, project: Doc<"projects">) {
	if (project.completedAt !== undefined || project.status !== "planned")
		return true;
	return hasBegunTask(ctx, project._id);
}

export async function loadSeriesQuoteTemplates(
	ctx: QueryCtx,
	seriesId: Id<"projectSeries">,
) {
	const rows = await ctx.db
		.query("projectSeriesQuoteTemplates")
		.withIndex("by_series", (q) => q.eq("seriesId", seriesId))
		.take(MAX_QUOTE_TEMPLATES + 1);
	if (rows.length > MAX_QUOTE_TEMPLATES)
		throw new ConvexError("Recurring quote template limit exceeded");
	return rows;
}

export async function assertGeneratedQuoteCapacity(
	ctx: QueryCtx,
	templates: Doc<"projectSeriesQuoteTemplates">[],
	replacingTemplateId: Id<"projectSeriesQuoteTemplates"> | undefined,
	replacementLines: number,
) {
	let total = replacementLines;
	for (const template of templates) {
		if (!template.active || template._id === replacingTemplateId) continue;
		const version = await ctx.db.get(template.versionId);
		if (!version) throw new ConvexError("Recurring quote version is missing");
		total += version.lineItems.length;
	}
	if (total > MAX_GENERATED_QUOTE_LINE_WRITES)
		throw new ConvexError(
			`Saved recurring quotes can contain at most ${MAX_GENERATED_QUOTE_LINE_WRITES} line items per generated project`,
		);
}

export async function snapshotQuoteVersion(
	ctx: Pick<QueryCtx, "db">,
	quote: Doc<"quotes">,
): Promise<QuoteSnapshot> {
	const rows = await ctx.db
		.query("quoteLineItems")
		.withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
		.take(MAX_QUOTE_LINES + 1);
	if (rows.length > MAX_QUOTE_LINES)
		throw new ConvexError(
			`A recurring quote can contain at most ${MAX_QUOTE_LINES} line items`,
		);
	const lineItems = rows
		.sort((a, b) => a.sortOrder - b.sortOrder)
		.map((line) => ({
			description: line.description,
			quantity: line.quantity,
			unit: line.unit,
			rate: line.rate,
			amount: calculateLineItemAmount(line.quantity, line.rate),
			cost: line.cost,
			skuId: line.skuId,
			sortOrder: line.sortOrder,
		}));
	for (const line of lineItems) {
		if (!line.skuId) continue;
		const sku = await ctx.db.get(line.skuId);
		if (!sku || sku.orgId !== quote.orgId)
			throw new ConvexError("Quote contains an unavailable SKU");
	}
	return {
		title: quote.title,
		clientMessage: quote.clientMessage,
		terms: quote.terms,
		discountEnabled: quote.discountEnabled,
		discountAmount: quote.discountAmount,
		discountType: quote.discountType,
		taxEnabled: quote.taxEnabled,
		taxRate: quote.taxRate,
		pdfSettings: quote.pdfSettings,
		lineItems,
	};
}

function comparableLines(lineItems: QuoteSnapshot["lineItems"]) {
	return [...lineItems]
		.sort((a, b) => a.sortOrder - b.sortOrder)
		.map((line) => ({
			description: line.description,
			quantity: line.quantity,
			unit: line.unit,
			rate: line.rate,
			amount: line.amount,
			cost: line.cost,
			skuId: line.skuId,
			sortOrder: line.sortOrder,
		}));
}

function comparableSnapshot(snapshot: QuoteSnapshot) {
	return {
		title: snapshot.title,
		clientMessage: snapshot.clientMessage,
		terms: snapshot.terms,
		discountEnabled: snapshot.discountEnabled,
		discountAmount: snapshot.discountAmount,
		discountType: snapshot.discountType,
		taxEnabled: snapshot.taxEnabled,
		taxRate: snapshot.taxRate,
		pdfSettings: snapshot.pdfSettings
			? {
					showQuantities: snapshot.pdfSettings.showQuantities,
					showUnitPrices: snapshot.pdfSettings.showUnitPrices,
					showLineItemTotals: snapshot.pdfSettings.showLineItemTotals,
					showTotals: snapshot.pdfSettings.showTotals,
				}
			: undefined,
		lineItems: comparableLines(snapshot.lineItems),
	};
}

function snapshotTotals(snapshot: QuoteSnapshot) {
	return computeQuoteTotals({
		lineAmounts: snapshot.lineItems.map((line) => line.amount),
		discountEnabled: snapshot.discountEnabled,
		discountAmount: snapshot.discountAmount,
		discountType: snapshot.discountType,
		taxEnabled: snapshot.taxEnabled,
		taxRate: snapshot.taxRate,
	});
}

function quoteMatchesSnapshot(
	quote: Doc<"quotes">,
	lineItems: Doc<"quoteLineItems">[],
	snapshot: QuoteSnapshot,
) {
	const totals = snapshotTotals(snapshot);
	return (
		JSON.stringify(comparableSnapshot({ ...quote, lineItems })) ===
			JSON.stringify(comparableSnapshot(snapshot)) &&
		quote.subtotal === totals.subtotal &&
		quote.taxAmount === totals.taxAmount &&
		quote.total === totals.total &&
		quote.validUntil === undefined &&
		quote.latestDocumentId === undefined &&
		quote.requiresCountersignature === undefined &&
		quote.countersignerId === undefined &&
		quote.signingOrder === undefined
	);
}

async function candidates(
	ctx: QueryCtx,
	series: Doc<"projectSeries">,
	sourceProject: Doc<"projects">,
) {
	if (!sourceProject.recurringNominalDate) return [];
	const { rows } = await upcomingSeriesProjects(ctx, series, "Quote");
	return rows.filter(
		(project) =>
			project.recurringNominalDate &&
			project.recurringNominalDate > sourceProject.recurringNominalDate!,
	);
}

async function ledgerFor(
	ctx: QueryCtx,
	templateId: Id<"projectSeriesQuoteTemplates">,
	projectId: Id<"projects">,
) {
	return ctx.db
		.query("projectSeriesQuoteCopies")
		.withIndex("by_template_project", (q) =>
			q.eq("templateId", templateId).eq("projectId", projectId),
		)
		.unique();
}

type AgreementScope = {
	revisionId: Id<"projectSeriesAgreementRevisions">;
	quoteVersionId: Id<"projectSeriesQuoteVersions">;
};

async function replaceable(
	ctx: QueryCtx,
	project: Doc<"projects">,
	ledger: Doc<"projectSeriesQuoteCopies"> | null,
	series: Doc<"projectSeries">,
	template: Doc<"projectSeriesQuoteTemplates"> | null,
	agreement?: AgreementScope,
) {
	if (
		project.clientId !== series.clientId ||
		project.propertyId !== series.propertyId ||
		project.recurringState !== undefined ||
		(await projectStarted(ctx, project))
	)
		return false;
	if (!ledger) return !(await projectHasInvoice(ctx, project._id));
	if (ledger.state !== "materialized" || !ledger.quoteId || !template)
		return false;
	const quote = await ctx.db.get(ledger.quoteId);
	if (
		!quote ||
		quote.orgId !== series.orgId ||
		quote.clientId !== project.clientId ||
		quote.projectId !== project._id ||
		quote.projectSeriesQuoteTemplateId !== template._id
	)
		return false;
	if (
		quote.recurringQuoteOverride ||
		(await projectHasInvoice(ctx, project._id, quote._id))
	)
		return false;
	if (!agreement) return !ledger.protected && quote.status === "draft";
	// Inheritance itself ledger-protects a copy, so agreement mode keys on provenance instead of `protected`.
	const inheritedUnderEarlierRevision =
		quote.recurringInheritedAt !== undefined &&
		quote.recurringAgreementRevisionId !== agreement.revisionId;
	const draftOnApprovedVersion =
		ledger.versionId === agreement.quoteVersionId && quote.status === "draft";
	return inheritedUnderEarlierRevision || draftOnApprovedVersion;
}

type QuoteCopyPlan = {
	counts: QuoteCopyCounts;
	targets: Array<{
		project: Doc<"projects">;
		ledger: Doc<"projectSeriesQuoteCopies"> | null;
		quote: Doc<"quotes"> | null;
		oldLines: Doc<"quoteLineItems">[];
		unchanged: boolean;
	}>;
};

export async function planQuoteCopy(
	ctx: QueryCtx,
	template: Doc<"projectSeriesQuoteTemplates"> | null,
	series: Doc<"projectSeries">,
	sourceProject: Doc<"projects">,
	snapshot: QuoteSnapshot,
	agreement?: AgreementScope,
): Promise<QuoteCopyPlan> {
	const plan: QuoteCopyPlan = {
		counts: { createCount: 0, updateCount: 0, preservedCount: 0 },
		targets: [],
	};
	let lineWrites = 0;
	let lineReads = 0;
	for (const project of await candidates(ctx, series, sourceProject)) {
		const ledger = template
			? await ledgerFor(ctx, template._id, project._id)
			: null;
		if (
			!(await replaceable(ctx, project, ledger, series, template, agreement))
		) {
			plan.counts.preservedCount++;
			continue;
		}
		const quote = ledger?.quoteId ? await ctx.db.get(ledger.quoteId) : null;
		const oldLines = quote
			? await ctx.db
					.query("quoteLineItems")
					.withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
					.take(MAX_QUOTE_LINES + 1)
			: [];
		if (oldLines.length > MAX_QUOTE_LINES)
			throw new ConvexError("Existing quote line item limit exceeded");
		lineReads += oldLines.length;
		if (lineReads > MAX_MANUAL_QUOTE_LINE_READS)
			throw new ConvexError(
				"Quote copy preview is too large; reduce the future project window",
			);
		const unchanged = Boolean(
			quote && quoteMatchesSnapshot(quote, oldLines, snapshot),
		);
		if (!unchanged) lineWrites += oldLines.length + snapshot.lineItems.length;
		if (lineWrites > MAX_MANUAL_QUOTE_LINE_WRITES)
			throw new ConvexError(
				`Copying would write more than ${MAX_MANUAL_QUOTE_LINE_WRITES} quote line items; reduce the future project window`,
			);
		plan.targets.push({ project, ledger, quote, oldLines, unchanged });
		if (quote) plan.counts.updateCount++;
		else plan.counts.createCount++;
	}
	return plan;
}

export function recurringQuoteFields(
	version: Doc<"projectSeriesQuoteVersions">,
	project: Doc<"projects">,
	template: Doc<"projectSeriesQuoteTemplates">,
	quoteNumber: string,
) {
	return {
		orgId: version.orgId,
		clientId: project.clientId,
		projectId: project._id,
		title: version.title,
		quoteNumber,
		status: "draft" as const,
		...snapshotTotals(version),
		discountEnabled: version.discountEnabled,
		discountAmount: version.discountAmount,
		discountType: version.discountType,
		taxEnabled: version.taxEnabled,
		taxRate: version.taxRate,
		clientMessage: version.clientMessage,
		terms: version.terms,
		pdfSettings: version.pdfSettings,
		validUntil: undefined,
		sentAt: undefined,
		firstSentAt: undefined,
		approvedAt: undefined,
		declinedAt: undefined,
		latestDocumentId: undefined,
		requiresCountersignature: undefined,
		countersignerId: undefined,
		signingOrder: undefined,
		contentUpdatedAt: Date.now(),
		projectSeriesQuoteTemplateId: template._id,
		projectSeriesQuoteVersionId: version._id,
		recurringQuoteAppliedVersion: version.version,
	};
}

function inheritedApprovalFields(agreement: InheritedApproval) {
	return {
		status: "approved" as const,
		approvedAt: agreement.approvedAt,
		recurringInheritedAt: agreement.approvedAt,
		recurringAgreementTerms: agreement.terms,
		recurringAgreementRevisionId: agreement.revisionId,
		recurringAgreementEvidenceId: agreement.evidenceId,
	};
}

export async function writeRecurringQuoteLines(
	ctx: MutationCtx,
	quoteId: Id<"quotes">,
	version: Doc<"projectSeriesQuoteVersions">,
) {
	for (const line of version.lineItems)
		await ctx.db.insert("quoteLineItems", {
			quoteId,
			orgId: version.orgId,
			...line,
		});
}

export async function applyQuoteTemplate(
	ctx: MutationCtx,
	template: Doc<"projectSeriesQuoteTemplates">,
	version: Doc<"projectSeriesQuoteVersions">,
	series: Doc<"projectSeries">,
	plan: QuoteCopyPlan,
	createdByUserId: Id<"users">,
	agreement?: InheritedApproval,
) {
	const inherited = agreement ? inheritedApprovalFields(agreement) : {};
	for (const { project, ledger, quote, oldLines, unchanged } of plan.targets) {
		if (quote && ledger) {
			const provenance = {
				projectSeriesQuoteVersionId: version._id,
				recurringQuoteAppliedVersion: version.version,
			};
			if (unchanged) {
				await ctx.db.patch(quote._id, { ...provenance, ...inherited });
				await ctx.db.patch(ledger._id, {
					versionId: version._id,
					appliedVersion: version.version,
				});
				continue;
			}
			// firstSentAt is the immutable send-meter key; a replaced copy keeps it.
			const fields = {
				...recurringQuoteFields(
					version,
					project,
					template,
					quote.quoteNumber ?? (await nextQuoteNumber(ctx, series.orgId)),
				),
				firstSentAt: quote.firstSentAt,
			};
			// Inherited approval is provenance, not a change automations should react to.
			const changedFields: string[] = (
				Object.keys(fields) as Array<keyof typeof fields>
			).filter(
				(field) =>
					![
						"contentUpdatedAt",
						"projectSeriesQuoteVersionId",
						"recurringQuoteAppliedVersion",
					].includes(field) &&
					JSON.stringify(fields[field]) !== JSON.stringify(quote[field]),
			);
			if (
				JSON.stringify(comparableLines(oldLines)) !==
				JSON.stringify(comparableLines(version.lineItems))
			)
				changedFields.push("lineItems");
			for (const line of oldLines) await ctx.db.delete(line._id);
			await ctx.db.patch(quote._id, { ...fields, ...inherited });
			await writeRecurringQuoteLines(ctx, quote._id, version);
			await ctx.db.patch(ledger._id, {
				versionId: version._id,
				appliedVersion: version.version,
			});
			await emitRecordUpdatedEvent(
				ctx,
				series.orgId,
				"quote",
				quote._id,
				changedFields,
				"projectSeriesQuotes.copy",
			);
		} else {
			const quoteId = await ctx.db.insert("quotes", {
				...recurringQuoteFields(
					version,
					project,
					template,
					await nextQuoteNumber(ctx, series.orgId),
				),
				...inherited,
				createdByUserId,
			});
			await writeRecurringQuoteLines(ctx, quoteId, version);
			await ctx.db.insert("projectSeriesQuoteCopies", {
				orgId: series.orgId,
				seriesId: series._id,
				templateId: template._id,
				versionId: version._id,
				projectId: project._id,
				quoteId,
				state: "materialized",
				protected: false,
				appliedVersion: version.version,
			});
			await emitRecordCreatedEvent(
				ctx,
				series.orgId,
				"quote",
				quoteId,
				"projectSeriesQuotes.copy",
			);
		}
	}
	return plan.counts;
}

export async function applyActiveQuoteTemplatesToProject(
	ctx: MutationCtx,
	series: Doc<"projectSeries">,
	project: Doc<"projects">,
	templates: Doc<"projectSeriesQuoteTemplates">[],
) {
	let linesCreated = 0;
	const activeAgreement = series.activeAgreementRevisionId
		? await ctx.db.get(series.activeAgreementRevisionId)
		: null;
	for (const template of templates) {
		if (
			!template.active ||
			!project.recurringNominalDate ||
			project.recurringNominalDate <= template.sourceNominalDate
		)
			continue;
		const version = await ctx.db.get(template.versionId);
		if (!version) throw new ConvexError("Recurring quote version is missing");
		if (
			version.clientId !== series.clientId ||
			version.propertyId !== series.propertyId ||
			project.clientId !== version.clientId ||
			project.propertyId !== version.propertyId
		)
			throw new ConvexError(
				"Saved recurring quote scope does not match the generated project",
			);
		if (
			linesCreated + version.lineItems.length >
			MAX_GENERATED_QUOTE_LINE_WRITES
		)
			throw new ConvexError(
				"Recurring generation quote line-item limit exceeded",
			);
		const inherited =
			!series.agreementReviewRequired &&
			activeAgreement?.templateId === template._id &&
			activeAgreement.terms &&
			activeAgreement.decisionEvidenceId &&
			activeAgreement.approvedAt !== undefined
				? inheritedApprovalFields({
						revisionId: activeAgreement._id,
						evidenceId: activeAgreement.decisionEvidenceId,
						approvedAt: activeAgreement.approvedAt,
						terms: activeAgreement.terms,
					})
				: {};
		const quoteId = await ctx.db.insert("quotes", {
			...recurringQuoteFields(
				version,
				project,
				template,
				await nextQuoteNumber(ctx, series.orgId),
			),
			...inherited,
			createdByUserId: series.createdByUserId,
		});
		await writeRecurringQuoteLines(ctx, quoteId, version);
		await ctx.db.insert("projectSeriesQuoteCopies", {
			orgId: series.orgId,
			seriesId: series._id,
			templateId: template._id,
			versionId: version._id,
			projectId: project._id,
			quoteId,
			state: "materialized",
			protected: false,
			appliedVersion: version.version,
		});
		await emitRecordCreatedEvent(
			ctx,
			series.orgId,
			"quote",
			quoteId,
			"projectSeries.generate",
		);
		linesCreated += version.lineItems.length;
	}
	return linesCreated;
}

export async function applyApprovedAgreementToExistingProjects(
	ctx: MutationCtx,
	series: Doc<"projectSeries">,
	revision: Doc<"projectSeriesAgreementRevisions">,
	createdByUserId: Id<"users">,
) {
	if (
		!revision.terms ||
		!revision.decisionEvidenceId ||
		revision.approvedAt === undefined
	)
		throw new ConvexError("Approved agreement provenance is incomplete");
	const template = await ctx.db.get(revision.templateId);
	const version = await ctx.db.get(revision.quoteVersionId);
	const sourceQuote = await ctx.db.get(revision.sourceQuoteId);
	if (!template || !version || !sourceQuote?.projectId)
		throw new ConvexError("Recurring agreement source is missing");
	const sourceProject = await ctx.db.get(sourceQuote.projectId);
	if (!sourceProject)
		throw new ConvexError("Recurring agreement source project is missing");
	const plan = await planQuoteCopy(
		ctx,
		template,
		series,
		sourceProject,
		version,
		{ revisionId: revision._id, quoteVersionId: revision.quoteVersionId },
	);
	return applyQuoteTemplate(
		ctx,
		template,
		version,
		series,
		plan,
		createdByUserId,
		{
			revisionId: revision._id,
			evidenceId: revision.decisionEvidenceId,
			approvedAt: revision.approvedAt,
			terms: revision.terms,
		},
	);
}
