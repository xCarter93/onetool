import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { emitRecordCreatedEvent, emitRecordUpdatedEvent } from "../eventBus";
import { calculateLineItemAmount, computeQuoteTotals } from "./money";
import { nextQuoteNumber } from "./orgCounters";
import { dateKeyFromTimestamp } from "./projectRecurrence";

export const MAX_QUOTE_TEMPLATES = 20;
export const MAX_QUOTE_LINES = 100;
export const MAX_QUOTE_TARGETS = 200;
export const MAX_MANUAL_QUOTE_LINE_WRITES = 2_000;
export const MAX_GENERATED_QUOTE_LINE_WRITES = 500;
export const MAX_GENERATED_QUOTES = 100;

export type QuoteCopyCounts = { createCount: number; updateCount: number; preservedCount: number };

async function invoiceExists(ctx: QueryCtx, projectId: Id<"projects">, quoteId?: Id<"quotes">) {
	if (await ctx.db.query("invoices").withIndex("by_project", (q) => q.eq("projectId", projectId)).first()) return true;
	if (await ctx.db.query("invoiceGroups").withIndex("by_source_project", (q) => q.eq("sourceProjectId", projectId)).first()) return true;
	if (!quoteId) return false;
	if (await ctx.db.query("invoices").withIndex("by_quote", (q) => q.eq("quoteId", quoteId)).first()) return true;
	return Boolean(await ctx.db.query("invoiceGroups").withIndex("by_source_quote", (q) => q.eq("sourceQuoteId", quoteId)).first());
}

async function projectStarted(ctx: QueryCtx, project: Doc<"projects">) {
	if (project.completedAt !== undefined || project.status !== "planned") return true;
	return Boolean(
		(await ctx.db.query("tasks").withIndex("by_project_status", (q) => q.eq("projectId", project._id).eq("status", "in-progress")).first()) ||
		(await ctx.db.query("tasks").withIndex("by_project_status", (q) => q.eq("projectId", project._id).eq("status", "completed")).first())
	);
}

export async function loadSeriesQuoteTemplates(ctx: QueryCtx, seriesId: Id<"projectSeries">) {
	const rows = await ctx.db.query("projectSeriesQuoteTemplates").withIndex("by_series", (q) => q.eq("seriesId", seriesId)).take(MAX_QUOTE_TEMPLATES + 1);
	if (rows.length > MAX_QUOTE_TEMPLATES) throw new ConvexError("Recurring quote template limit exceeded");
	return rows;
}

export async function assertGeneratedQuoteCapacity(ctx: QueryCtx, seriesId: Id<"projectSeries">, replacingTemplateId: Id<"projectSeriesQuoteTemplates"> | undefined, replacementLines: number) {
	let total = replacementLines;
	for (const template of await loadSeriesQuoteTemplates(ctx, seriesId)) {
		if (!template.active || template._id === replacingTemplateId) continue;
		const version = await ctx.db.get(template.versionId);
		if (!version) throw new ConvexError("Recurring quote version is missing");
		total += version.lineItems.length;
	}
	if (total > MAX_GENERATED_QUOTE_LINE_WRITES)
		throw new ConvexError(`Saved recurring quotes can contain at most ${MAX_GENERATED_QUOTE_LINE_WRITES} line items per generated project`);
}

export async function snapshotQuoteVersion(ctx: Pick<QueryCtx, "db">, quote: Doc<"quotes">) {
	const rows = await ctx.db.query("quoteLineItems").withIndex("by_quote", (q) => q.eq("quoteId", quote._id)).take(MAX_QUOTE_LINES + 1);
	if (rows.length > MAX_QUOTE_LINES) throw new ConvexError(`A recurring quote can contain at most ${MAX_QUOTE_LINES} line items`);
	const lineItems = rows.sort((a, b) => a.sortOrder - b.sortOrder).map((line) => ({
		description: line.description, quantity: line.quantity, unit: line.unit,
		rate: line.rate, amount: calculateLineItemAmount(line.quantity, line.rate),
		cost: line.cost, skuId: line.skuId, sortOrder: line.sortOrder,
	}));
	for (const line of lineItems) {
		if (!line.skuId) continue;
		const sku = await ctx.db.get(line.skuId);
		if (!sku || sku.orgId !== quote.orgId) throw new ConvexError("Quote contains an unavailable SKU");
	}
	return {
		title: quote.title, clientMessage: quote.clientMessage, terms: quote.terms,
		discountEnabled: quote.discountEnabled, discountAmount: quote.discountAmount,
		discountType: quote.discountType, taxEnabled: quote.taxEnabled, taxRate: quote.taxRate,
		pdfSettings: quote.pdfSettings, lineItems,
	};
}

type FullQuoteSnapshot = Awaited<ReturnType<typeof snapshotQuoteVersion>>;
type QuoteSnapshot = Omit<Partial<FullQuoteSnapshot>, "lineItems"> & {
	lineItems: Array<{
		description: string; quantity: number; unit: string; rate: number; amount: number;
		cost?: number; skuId?: Id<"skus">; sortOrder: number;
	}>;
};

function comparableSnapshot(snapshot: QuoteSnapshot) {
	return {
		title: snapshot.title, clientMessage: snapshot.clientMessage, terms: snapshot.terms,
		discountEnabled: snapshot.discountEnabled, discountAmount: snapshot.discountAmount,
		discountType: snapshot.discountType, taxEnabled: snapshot.taxEnabled, taxRate: snapshot.taxRate,
		pdfSettings: snapshot.pdfSettings ? {
			showQuantities: snapshot.pdfSettings.showQuantities,
			showUnitPrices: snapshot.pdfSettings.showUnitPrices,
			showLineItemTotals: snapshot.pdfSettings.showLineItemTotals,
			showTotals: snapshot.pdfSettings.showTotals,
		} : undefined,
		lineItems: [...snapshot.lineItems].sort((a, b) => a.sortOrder - b.sortOrder).map((line) => ({
			description: line.description, quantity: line.quantity, unit: line.unit, rate: line.rate,
			amount: line.amount, cost: line.cost, skuId: line.skuId, sortOrder: line.sortOrder,
		})),
	};
}

function quoteMatchesSnapshot(quote: Doc<"quotes">, lineItems: Doc<"quoteLineItems">[], snapshot: QuoteSnapshot) {
	const current = { ...quote, lineItems };
	const totals = computeQuoteTotals({ lineAmounts: snapshot.lineItems.map((line) => line.amount), discountEnabled: snapshot.discountEnabled, discountAmount: snapshot.discountAmount, discountType: snapshot.discountType, taxEnabled: snapshot.taxEnabled, taxRate: snapshot.taxRate });
	return JSON.stringify(comparableSnapshot(current)) === JSON.stringify(comparableSnapshot(snapshot)) &&
		quote.subtotal === totals.subtotal && quote.taxAmount === totals.taxAmount && quote.total === totals.total &&
		quote.validUntil === undefined && quote.latestDocumentId === undefined && quote.requiresCountersignature === undefined &&
		quote.countersignerId === undefined && quote.signingOrder === undefined;
}

async function candidates(ctx: QueryCtx, series: Doc<"projectSeries">, sourceProject: Doc<"projects">) {
	if (!sourceProject.recurringNominalDate) return [];
	const today = dateKeyFromTimestamp(Date.now(), series.timezone);
	const start = Date.parse(`${today}T00:00:00.000Z`);
	const rows = await ctx.db.query("projects").withIndex("by_series_start", (q) => q.eq("recurringSeriesId", series._id).gte("startDate", start)).take(MAX_QUOTE_TARGETS + 1);
	if (rows.length > MAX_QUOTE_TARGETS) throw new ConvexError(`Quote setup can affect at most ${MAX_QUOTE_TARGETS} projects at once`);
	return rows.filter((project) => project.recurringNominalDate && project.recurringNominalDate > sourceProject.recurringNominalDate!);
}

async function ledgerFor(ctx: QueryCtx, templateId: Id<"projectSeriesQuoteTemplates">, projectId: Id<"projects">) {
	return ctx.db.query("projectSeriesQuoteCopies").withIndex("by_template_project", (q) => q.eq("templateId", templateId).eq("projectId", projectId)).unique();
}

async function replaceable(ctx: QueryCtx, project: Doc<"projects">, ledger: Doc<"projectSeriesQuoteCopies"> | null, series: Doc<"projectSeries">, template?: Doc<"projectSeriesQuoteTemplates">, agreementRevisionId?: Id<"projectSeriesAgreementRevisions">, agreementQuoteVersionId?: Id<"projectSeriesQuoteVersions">) {
	if (project.clientId !== series.clientId || project.propertyId !== series.propertyId || project.recurringState !== undefined || await projectStarted(ctx, project)) return false;
	if (!ledger) return !(await invoiceExists(ctx, project._id));
	if (ledger.state !== "materialized" || !ledger.quoteId) return false;
	const quote = await ctx.db.get(ledger.quoteId);
	const replaceApprovedInheritance = Boolean(agreementRevisionId && series.activeAgreementRevisionId && quote?.recurringInheritedAt !== undefined && quote.recurringAgreementRevisionId === series.activeAgreementRevisionId);
	const exactPendingDraft = Boolean(agreementRevisionId && ledger.versionId === agreementQuoteVersionId && quote?.status === "draft");
	return Boolean(quote && template && quote.orgId === series.orgId && quote.clientId === project.clientId && quote.projectId === project._id && quote.projectSeriesQuoteTemplateId === template._id &&
		(agreementRevisionId ? (replaceApprovedInheritance || exactPendingDraft) : (!ledger.protected && quote.status === "draft")) && !quote.recurringQuoteOverride && !(await invoiceExists(ctx, project._id, quote._id)));
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
	agreementRevisionId?: Id<"projectSeriesAgreementRevisions">,
	agreementQuoteVersionId?: Id<"projectSeriesQuoteVersions">
): Promise<QuoteCopyPlan> {
	const plan: QuoteCopyPlan = { counts: { createCount: 0, updateCount: 0, preservedCount: 0 }, targets: [] };
	let lineWrites = 0;
	let lineReads = 0;
	for (const project of await candidates(ctx, series, sourceProject)) {
		const ledger = template ? await ledgerFor(ctx, template._id, project._id) : null;
		if (!(await replaceable(ctx, project, ledger, series, template ?? undefined, agreementRevisionId, agreementQuoteVersionId))) {
			plan.counts.preservedCount++;
			continue;
		}
		const quote = ledger?.quoteId ? await ctx.db.get(ledger.quoteId) : null;
		const oldLines = quote ? await ctx.db.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", quote._id)).take(MAX_QUOTE_LINES + 1) : [];
		if (oldLines.length > MAX_QUOTE_LINES) throw new ConvexError("Existing quote line item limit exceeded");
		lineReads += oldLines.length;
		if (lineReads > 4_000) throw new ConvexError("Quote copy preview is too large; reduce the future project window");
		const unchanged = Boolean(quote && quoteMatchesSnapshot(quote, oldLines, snapshot));
		if (!unchanged) lineWrites += oldLines.length + snapshot.lineItems.length;
		if (lineWrites > MAX_MANUAL_QUOTE_LINE_WRITES)
			throw new ConvexError(`Copying would write more than ${MAX_MANUAL_QUOTE_LINE_WRITES} quote line items; reduce the future project window`);
		plan.targets.push({ project, ledger, quote, oldLines, unchanged });
		if (quote) plan.counts.updateCount++;
		else plan.counts.createCount++;
	}
	return plan;
}

export function recurringQuoteFields(version: Doc<"projectSeriesQuoteVersions">, project: Doc<"projects">, template: Doc<"projectSeriesQuoteTemplates">, quoteNumber: string) {
	const totals = computeQuoteTotals({ lineAmounts: version.lineItems.map((line) => line.amount), discountEnabled: version.discountEnabled, discountAmount: version.discountAmount, discountType: version.discountType, taxEnabled: version.taxEnabled, taxRate: version.taxRate });
	return {
		orgId: version.orgId, clientId: project.clientId, projectId: project._id,
		title: version.title, quoteNumber, status: "draft" as const, ...totals,
		discountEnabled: version.discountEnabled, discountAmount: version.discountAmount,
		discountType: version.discountType, taxEnabled: version.taxEnabled, taxRate: version.taxRate,
		clientMessage: version.clientMessage, terms: version.terms, pdfSettings: version.pdfSettings,
		validUntil: undefined, sentAt: undefined, firstSentAt: undefined, approvedAt: undefined,
		declinedAt: undefined, latestDocumentId: undefined, requiresCountersignature: undefined,
		countersignerId: undefined, signingOrder: undefined,
		contentUpdatedAt: Date.now(), projectSeriesQuoteTemplateId: template._id,
		projectSeriesQuoteVersionId: version._id, recurringQuoteAppliedVersion: version.version,
	};
}

export async function writeRecurringQuoteLines(ctx: MutationCtx, quoteId: Id<"quotes">, version: Doc<"projectSeriesQuoteVersions">) {
	for (const line of version.lineItems) await ctx.db.insert("quoteLineItems", { quoteId, orgId: version.orgId, ...line });
}

export async function applyQuoteTemplate(
	ctx: MutationCtx,
	template: Doc<"projectSeriesQuoteTemplates">,
	version: Doc<"projectSeriesQuoteVersions">,
	series: Doc<"projectSeries">,
	plan: QuoteCopyPlan,
	createdByUserId: Id<"users">,
	agreement?: { revisionId: Id<"projectSeriesAgreementRevisions">; evidenceId: Id<"quoteDecisionEvidence">; approvedAt: number; terms: Doc<"projectSeriesAgreementRevisions">["terms"] }
) {
	for (const { project, ledger, quote, oldLines, unchanged } of plan.targets) {
		if (quote && ledger) {
			if (unchanged) {
				await ctx.db.patch(quote._id, { projectSeriesQuoteVersionId: version._id, recurringQuoteAppliedVersion: version.version });
				await ctx.db.patch(ledger._id, { versionId: version._id, appliedVersion: version.version });
				continue;
			}
			const fields = { ...recurringQuoteFields(version, project, template, quote.quoteNumber ?? await nextQuoteNumber(ctx, series.orgId)), ...(agreement?.terms ? { status: "approved" as const, approvedAt: agreement.approvedAt, recurringAgreementTerms: agreement.terms, recurringAgreementRevisionId: agreement.revisionId, recurringAgreementEvidenceId: agreement.evidenceId, recurringInheritedAt: agreement.approvedAt } : {}) };
			const changedFields: string[] = (Object.keys(fields) as Array<keyof typeof fields>).filter(
				(field) => !["contentUpdatedAt", "projectSeriesQuoteVersionId", "recurringQuoteAppliedVersion"].includes(field) &&
					JSON.stringify(fields[field]) !== JSON.stringify(quote[field])
			);
			if (JSON.stringify(comparableSnapshot({ lineItems: oldLines }).lineItems) !==
				JSON.stringify(comparableSnapshot(version).lineItems)) changedFields.push("lineItems");
			for (const line of oldLines) await ctx.db.delete(line._id);
			await ctx.db.patch(quote._id, fields);
			await writeRecurringQuoteLines(ctx, quote._id, version);
			await ctx.db.patch(ledger._id, { versionId: version._id, appliedVersion: version.version });
			await emitRecordUpdatedEvent(ctx, series.orgId, "quote", quote._id, changedFields, "projectSeriesQuotes.copy");
		} else {
			const quoteId = await ctx.db.insert("quotes", { ...recurringQuoteFields(version, project, template, await nextQuoteNumber(ctx, series.orgId)), ...(agreement?.terms ? { status: "approved" as const, approvedAt: agreement.approvedAt, recurringAgreementTerms: agreement.terms, recurringAgreementRevisionId: agreement.revisionId, recurringAgreementEvidenceId: agreement.evidenceId, recurringInheritedAt: agreement.approvedAt } : {}), createdByUserId });
			await writeRecurringQuoteLines(ctx, quoteId, version);
			await ctx.db.insert("projectSeriesQuoteCopies", { orgId: series.orgId, seriesId: series._id, templateId: template._id, versionId: version._id, projectId: project._id, quoteId, state: "materialized", protected: false, appliedVersion: version.version });
			await emitRecordCreatedEvent(ctx, series.orgId, "quote", quoteId, "projectSeriesQuotes.copy");
		}
	}
	return plan.counts;
}

export async function applyActiveQuoteTemplatesToProject(ctx: MutationCtx, series: Doc<"projectSeries">, project: Doc<"projects">, templates: Doc<"projectSeriesQuoteTemplates">[]) {
	let linesCreated = 0;
	const activeAgreement = series.activeAgreementRevisionId ? await ctx.db.get(series.activeAgreementRevisionId) : null;
	for (const template of templates) {
		if (!template.active || !project.recurringNominalDate || project.recurringNominalDate <= template.sourceNominalDate) continue;
		const version = await ctx.db.get(template.versionId);
		if (!version) throw new ConvexError("Recurring quote version is missing");
		if (version.clientId !== series.clientId || version.propertyId !== series.propertyId || project.clientId !== version.clientId || project.propertyId !== version.propertyId)
			throw new ConvexError("Saved recurring quote scope does not match the generated project");
		if (linesCreated + version.lineItems.length > MAX_GENERATED_QUOTE_LINE_WRITES) throw new ConvexError("Recurring generation quote line-item limit exceeded");
		const inherited = !series.agreementReviewRequired && activeAgreement?.templateId === template._id && activeAgreement.terms && activeAgreement.decisionEvidenceId && activeAgreement.approvedAt !== undefined;
		const quoteId = await ctx.db.insert("quotes", {
			...recurringQuoteFields(version, project, template, await nextQuoteNumber(ctx, series.orgId)),
			...(inherited ? { status: "approved" as const, approvedAt: activeAgreement.approvedAt, recurringAgreementTerms: activeAgreement.terms, recurringAgreementRevisionId: activeAgreement._id, recurringAgreementEvidenceId: activeAgreement.decisionEvidenceId, recurringInheritedAt: activeAgreement.approvedAt } : {}),
			createdByUserId: series.createdByUserId,
		});
		await writeRecurringQuoteLines(ctx, quoteId, version);
		await ctx.db.insert("projectSeriesQuoteCopies", { orgId: series.orgId, seriesId: series._id, templateId: template._id, versionId: version._id, projectId: project._id, quoteId, state: "materialized", protected: false, appliedVersion: version.version });
		await emitRecordCreatedEvent(ctx, series.orgId, "quote", quoteId, "projectSeries.generate");
		linesCreated += version.lineItems.length;
	}
	return linesCreated;
}

export async function applyApprovedAgreementToExistingProjects(
	ctx: MutationCtx,
	series: Doc<"projectSeries">,
	revision: Doc<"projectSeriesAgreementRevisions">,
	createdByUserId: Id<"users">
) {
	if (!revision.terms || !revision.decisionEvidenceId || revision.approvedAt === undefined) throw new ConvexError("Approved agreement provenance is incomplete");
	const template = await ctx.db.get(revision.templateId);
	const version = await ctx.db.get(revision.quoteVersionId);
	const sourceQuote = await ctx.db.get(revision.sourceQuoteId);
	if (!template || !version || !sourceQuote?.projectId) throw new ConvexError("Recurring agreement source is missing");
	const sourceProject = await ctx.db.get(sourceQuote.projectId);
	if (!sourceProject) throw new ConvexError("Recurring agreement source project is missing");
	const plan = await planQuoteCopy(ctx, template, series, sourceProject, version, revision._id, revision.quoteVersionId);
	await applyQuoteTemplate(ctx, template, version, series, plan, createdByUserId, { revisionId: revision._id, evidenceId: revision.decisionEvidenceId, approvedAt: revision.approvedAt, terms: revision.terms });
	for (const target of plan.targets) {
		const ledger = await ledgerFor(ctx, template._id, target.project._id);
		if (!ledger?.quoteId) continue;
		const covered = await ctx.db.get(ledger.quoteId);
		if (!covered || covered.recurringQuoteOverride) continue;
		await ctx.db.patch(covered._id, {
			status: "approved",
			approvedAt: revision.approvedAt,
			recurringAgreementTerms: revision.terms,
			recurringAgreementRevisionId: revision._id,
			recurringAgreementEvidenceId: revision.decisionEvidenceId,
			recurringInheritedAt: revision.approvedAt,
		});
	}
	return plan.counts;
}
