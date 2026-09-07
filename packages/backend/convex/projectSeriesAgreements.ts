import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { userMutation, userQuery, type UserQueryCtx } from "./lib/factories";
import { recurringPaymentRuleValidator } from "./lib/recurringPaymentRules";
import {
	agreementApprovalNotActivated,
	createAgreementRevisionQuote,
	discardPendingAgreementRevision,
	latestAgreementRevision,
	recurringAgreementTermsValidator,
	restorableAgreementPricing,
	validatePaymentRule,
} from "./lib/projectSeriesAgreements";
import {
	recurringQuoteFields,
	snapshotQuoteVersion,
	writeRecurringQuoteLines,
} from "./lib/projectSeriesQuotes";
import {
	projectRecurrenceRuleValidator,
	validateRecurrenceRule,
} from "./lib/projectRecurrence";
import { assertMonthlyAgreementTerms } from "./lib/recurringPaymentChanges";

async function requireAgreementAccess(
	ctx: UserQueryCtx,
	level: "view" | "modify",
) {
	await ctx.requireLevel("projects", level);
	await ctx.requireLevel("quotes", level);
	if (
		!(await ctx.hasAllRecords("projects")) ||
		!(await ctx.hasAllRecords("quotes"))
	)
		throw new ConvexError(
			"Organization-wide project and quote access is required",
		);
}

async function context(ctx: UserQueryCtx, quoteId: Id<"quotes">) {
	await requireAgreementAccess(ctx, "modify");
	const quote = await ctx.orgEntity("quotes", quoteId);
	if (!quote.projectId)
		throw new ConvexError("A recurring agreement must belong to a project");
	const project = await ctx.orgEntity("projects", quote.projectId);
	if (!project.recurringSeriesId || !project.recurringNominalDate)
		throw new ConvexError("Quote does not belong to a recurring series");
	const series = await ctx.orgEntity(
		"projectSeries",
		project.recurringSeriesId,
	);
	if (
		quote.clientId !== series.clientId ||
		project.clientId !== series.clientId ||
		project.propertyId !== series.propertyId
	)
		throw new ConvexError(
			"Agreement quote scope does not match the recurring series",
		);
	return { quote, project, series };
}

const revisionSummary = v.object({
	_id: v.id("projectSeriesAgreementRevisions"),
	revisionNumber: v.number(),
	status: v.union(
		v.literal("draft"),
		v.literal("pending"),
		v.literal("approved"),
		v.literal("superseded"),
	),
	quoteId: v.id("quotes"),
	agreementReference: v.optional(v.string()),
	approvedAt: v.optional(v.number()),
	withdrawnAt: v.optional(v.number()),
	deliveryState: v.union(
		v.literal("draft"),
		v.literal("ready_to_send"),
		v.literal("awaiting_approval"),
		v.literal("approved"),
		v.literal("withdrawn"),
		v.literal("declined"),
		v.literal("expired"),
		v.literal("revoked"),
		v.literal("not_activated"),
		v.literal("replaced"),
	),
	scheduleRule: v.optional(projectRecurrenceRuleValidator),
	canDiscard: v.boolean(),
	canWithdraw: v.boolean(),
});

async function summarizeRevision(
	ctx: UserQueryCtx,
	row: Doc<"projectSeriesAgreementRevisions">,
) {
	const document = row.approvalDocumentId
		? await ctx.orgEntity("documents", row.approvalDocumentId)
		: null;
	const quote = await ctx.orgEntity("quotes", row.sourceQuoteId);
	const providerStatus = document?.boldsign?.status;
	const delivered =
		quote.status === "sent" ||
		quote.status === "approved" ||
		Boolean(
			document?.recurringSignatureSendState ||
			(providerStatus && providerStatus !== "Draft"),
		);
	const withdrawn =
		row.status === "superseded" && row.withdrawnAt !== undefined;
	const replaced = row.status === "superseded" && row.withdrawnAt === undefined;
	const notActivated = agreementApprovalNotActivated(row, quote);
	const vendorRequest = Boolean(
		document?.boldsign || document?.recurringSignatureSendState,
	);
	return {
		_id: row._id,
		revisionNumber: row.revisionNumber,
		status: row.status,
		quoteId: row.sourceQuoteId,
		agreementReference: row.terms?.agreementReference,
		approvedAt: row.approvedAt,
		withdrawnAt: row.withdrawnAt,
		deliveryState:
			row.approvedAt !== undefined
				? ("approved" as const)
				: withdrawn
					? ("withdrawn" as const)
					: replaced
						? ("replaced" as const)
						: notActivated
							? ("not_activated" as const)
							: providerStatus === "Declined"
								? ("declined" as const)
								: providerStatus === "Expired"
									? ("expired" as const)
									: providerStatus === "Revoked"
										? ("revoked" as const)
										: delivered
											? ("awaiting_approval" as const)
											: document
												? ("ready_to_send" as const)
												: ("draft" as const),
		scheduleRule: row.terms?.schedule.rule,
		canDiscard:
			!row.monthlyPaymentScheduleVersionId &&
			(row.status === "draft" || row.status === "pending") &&
			!delivered,
		canWithdraw:
			!row.monthlyPaymentScheduleVersionId &&
			row.status === "pending" &&
			(Boolean(
				providerStatus &&
				["Sent", "Viewed", "Signed", "Revoked", "Declined", "Expired"].includes(
					providerStatus,
				),
			) ||
				(!vendorRequest && (quote.status === "sent" || notActivated))),
	};
}

export const getSeriesAgreement = userQuery({
	args: { seriesId: v.id("projectSeries") },
	returns: v.object({
		agreementQuoteId: v.optional(v.id("quotes")),
		active: v.union(v.null(), revisionSummary),
		pending: v.union(v.null(), revisionSummary),
		history: v.array(revisionSummary),
		historyHasMore: v.boolean(),
	}),
	handler: async (ctx, args) => {
		await requireAgreementAccess(ctx, "view");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		const summarize = async (id?: Id<"projectSeriesAgreementRevisions">) => {
			if (!id) return null;
			const row = await ctx.orgEntity("projectSeriesAgreementRevisions", id);
			return summarizeRevision(ctx, row);
		};
		const revisions = await ctx.db
			.query("projectSeriesAgreementRevisions")
			.withIndex("by_series_revision", (q) => q.eq("seriesId", series._id))
			.order("desc")
			.take(51);
		return {
			agreementQuoteId: series.agreementQuoteId,
			active: await summarize(series.activeAgreementRevisionId),
			pending: await summarize(series.pendingAgreementRevisionId),
			history: await Promise.all(
				revisions.slice(0, 50).map((row) => summarizeRevision(ctx, row)),
			),
			historyHasMore: revisions.length > 50,
		};
	},
});

export const getSetup = userQuery({
	args: { quoteId: v.id("quotes") },
	returns: v.object({
		seriesId: v.id("projectSeries"),
		state: v.union(
			v.literal("active"),
			v.literal("paused"),
			v.literal("ended"),
		),
		revision: v.number(),
		seriesSetup: v.object({
			title: v.string(),
			description: v.optional(v.string()),
			rule: projectRecurrenceRuleValidator,
		}),
		agreementQuoteId: v.optional(v.id("quotes")),
		active: v.union(v.null(), revisionSummary),
		pending: v.union(v.null(), revisionSummary),
		savedTerms: v.optional(recurringAgreementTermsValidator),
		recurringAgreementRevisionId: v.optional(
			v.id("projectSeriesAgreementRevisions"),
		),
		recurringInheritedAt: v.optional(v.number()),
		recurringQuoteOverride: v.boolean(),
		canPrepare: v.boolean(),
		canRestoreAgreementPricing: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const { quote, project, series } = await context(ctx, args.quoteId);
		const rootSourceQuoteId =
			quote.recurringAgreementSourceQuoteId ?? quote._id;
		const existingRevision = quote.recurringAgreementRevisionId
			? await ctx.orgEntity(
					"projectSeriesAgreementRevisions",
					quote.recurringAgreementRevisionId,
				)
			: null;
		const canPrepare =
			series.state === "active" &&
			quote.status === "draft" &&
			(!series.agreementQuoteId ||
				series.agreementQuoteId === rootSourceQuoteId) &&
			!existingRevision?.monthlyPaymentScheduleVersionId;
		const canRestoreAgreementPricing =
			(await restorableAgreementPricing(ctx, quote, project, series)) !== null;
		const summarize = async (id?: Id<"projectSeriesAgreementRevisions">) => {
			if (!id) return null;
			const row = await ctx.orgEntity("projectSeriesAgreementRevisions", id);
			return summarizeRevision(ctx, row);
		};
		return {
			seriesId: series._id,
			state: series.state,
			revision: series.revision ?? 0,
			seriesSetup: {
				title: series.title,
				description: series.description,
				rule: series.rule,
			},
			agreementQuoteId: series.agreementQuoteId,
			active: await summarize(series.activeAgreementRevisionId),
			pending: await summarize(series.pendingAgreementRevisionId),
			savedTerms: existingRevision?.terms ?? quote.recurringAgreementTerms,
			recurringAgreementRevisionId: quote.recurringAgreementRevisionId,
			recurringInheritedAt: quote.recurringInheritedAt,
			recurringQuoteOverride: quote.recurringQuoteOverride === true,
			canPrepare,
			canRestoreAgreementPricing,
		};
	},
});

export const discardPending = userMutation({
	args: {
		seriesId: v.id("projectSeries"),
		expectedRevisionId: v.id("projectSeriesAgreementRevisions"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireAgreementAccess(ctx, "modify");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		const revision = await ctx.orgEntity(
			"projectSeriesAgreementRevisions",
			args.expectedRevisionId,
		);
		await discardPendingAgreementRevision(
			ctx,
			series,
			revision,
			ctx.user._id,
			false,
		);
		return null;
	},
});

export const getWithdrawalContext = userQuery({
	args: {
		seriesId: v.id("projectSeries"),
		expectedRevisionId: v.id("projectSeriesAgreementRevisions"),
	},
	returns: v.object({
		quoteId: v.id("quotes"),
		documentId: v.id("documents"),
		boldsignDocumentId: v.optional(v.string()),
		providerRevocationRequired: v.boolean(),
		providerAlreadyTerminal: v.boolean(),
	}),
	handler: async (ctx, args) => {
		await requireAgreementAccess(ctx, "modify");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		const revision = await ctx.orgEntity(
			"projectSeriesAgreementRevisions",
			args.expectedRevisionId,
		);
		if (
			series.pendingAgreementRevisionId !== revision._id ||
			revision.seriesId !== series._id ||
			revision.status !== "pending"
		)
			throw new ConvexError(
				"Recurring agreement revision is no longer pending",
			);
		if (revision.monthlyPaymentScheduleVersionId)
			throw new ConvexError(
				"Cancel the shared monthly payment proposal instead",
			);
		if (!revision.approvalDocumentId)
			throw new ConvexError("This agreement has not been sent for approval");
		const document = await ctx.orgEntity(
			"documents",
			revision.approvalDocumentId,
		);
		const quote = await ctx.orgEntity("quotes", revision.sourceQuoteId);
		if (!document.boldsign && document.recurringSignatureSendState)
			throw new ConvexError(
				"The signature send is still being confirmed. Resolve its provider status before withdrawing this agreement",
			);
		if (
			document.boldsign &&
			!["Sent", "Viewed", "Signed", "Revoked", "Declined", "Expired"].includes(
				document.boldsign.status,
			)
		)
			throw new ConvexError(
				"This signature request can no longer be withdrawn",
			);
		if (
			!document.boldsign &&
			quote.status !== "sent" &&
			!agreementApprovalNotActivated(revision, quote)
		)
			throw new ConvexError("This agreement has not been delivered");
		return {
			quoteId: revision.sourceQuoteId,
			documentId: document._id,
			boldsignDocumentId: document.boldsign?.documentId,
			providerRevocationRequired: Boolean(document.boldsign),
			providerAlreadyTerminal: Boolean(
				document.boldsign &&
				["Revoked", "Declined", "Expired"].includes(document.boldsign.status),
			),
		};
	},
});

export const completeWithdrawal = userMutation({
	args: {
		seriesId: v.id("projectSeries"),
		expectedRevisionId: v.id("projectSeriesAgreementRevisions"),
		expectedDocumentId: v.id("documents"),
		expectedBoldsignDocumentId: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireAgreementAccess(ctx, "modify");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		const revision = await ctx.orgEntity(
			"projectSeriesAgreementRevisions",
			args.expectedRevisionId,
		);
		const document = await ctx.orgEntity("documents", args.expectedDocumentId);
		if (
			revision.approvalDocumentId !== document._id ||
			(args.expectedBoldsignDocumentId
				? document.boldsign?.documentId !== args.expectedBoldsignDocumentId ||
					!["Revoked", "Declined", "Expired"].includes(document.boldsign.status)
				: Boolean(document.boldsign || document.recurringSignatureSendState))
		)
			throw new ConvexError("The signature revocation has not been confirmed");
		await discardPendingAgreementRevision(
			ctx,
			series,
			revision,
			ctx.user._id,
			true,
		);
		return null;
	},
});

export const prepare = userMutation({
	args: {
		quoteId: v.id("quotes"),
		billingMode: v.union(v.literal("per_visit"), v.literal("monthly")),
		paymentRule: recurringPaymentRuleValidator,
		proposedScope: v.optional(
			v.object({
				title: v.string(),
				description: v.optional(v.union(v.string(), v.null())),
			}),
		),
		proposedRule: v.optional(projectRecurrenceRuleValidator),
		expectedSeriesRevision: v.number(),
		discardPendingRevision: v.optional(v.boolean()),
	},
	returns: v.object({
		revisionId: v.id("projectSeriesAgreementRevisions"),
		revisionNumber: v.number(),
		terms: recurringAgreementTermsValidator,
		seriesRevision: v.number(),
	}),
	handler: async (ctx, args) => {
		const {
			quote: initialQuote,
			project,
			series: seriesAtStart,
		} = await context(ctx, args.quoteId);
		if (seriesAtStart.state !== "active")
			throw new ConvexError("Resume this series before preparing an agreement");
		if ((seriesAtStart.revision ?? 0) !== args.expectedSeriesRevision)
			throw new ConvexError("Series changed; review the agreement again");
		if (initialQuote.status !== "draft")
			throw new ConvexError(
				"Prepare the recurring agreement from a draft quote",
			);
		if (initialQuote.recurringAgreementRevisionId) {
			const existing = await ctx.orgEntity(
				"projectSeriesAgreementRevisions",
				initialQuote.recurringAgreementRevisionId,
			);
			if (existing.monthlyPaymentScheduleVersionId)
				throw new ConvexError(
					"This quote belongs to a shared monthly payment proposal and cannot be prepared separately",
				);
		}
		const rootSourceQuoteId =
			initialQuote.recurringAgreementSourceQuoteId ?? initialQuote._id;
		if (
			seriesAtStart.agreementQuoteId &&
			seriesAtStart.agreementQuoteId !== rootSourceQuoteId
		)
			throw new ConvexError(
				"This quote is not a revision of the designated recurring agreement",
			);
		if (seriesAtStart.pendingAgreementRevisionId) {
			const pending = await ctx.orgEntity(
				"projectSeriesAgreementRevisions",
				seriesAtStart.pendingAgreementRevisionId,
			);
			if (pending.monthlyPaymentScheduleVersionId)
				throw new ConvexError(
					"Cancel the shared monthly payment proposal before preparing another agreement revision",
				);
			if (pending.approvalDocumentId) {
				const document = await ctx.db.get(pending.approvalDocumentId);
				const pendingQuote = await ctx.db.get(pending.sourceQuoteId);
				if (
					pendingQuote?.status === "sent" ||
					document?.boldsign ||
					document?.recurringSignatureSendState
				)
					throw new ConvexError(
						"Withdraw the agreement already sent to your client from the series page before setting up a new one",
					);
				if (!args.discardPendingRevision)
					throw new ConvexError({
						code: "PENDING_REVISION_REPLACE",
						message:
							"This series already has an agreement PDF that has not been sent. Replacing it discards that PDF.",
					});
			}
			// Also detaches the pending quote and bumps its approval cycle.
			await discardPendingAgreementRevision(
				ctx,
				seriesAtStart,
				pending,
				ctx.user._id,
				false,
			);
		}
		const quote = await ctx.orgEntity("quotes", args.quoteId);
		const series = await ctx.orgEntity("projectSeries", seriesAtStart._id);
		validatePaymentRule(args.paymentRule);
		const latest = await latestAgreementRevision(ctx, series._id);
		const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
		const snapshot = await snapshotQuoteVersion(ctx, quote);
		let template = await ctx.db
			.query("projectSeriesQuoteTemplates")
			.withIndex("by_series_source", (q) =>
				q.eq("seriesId", series._id).eq("sourceQuoteId", rootSourceQuoteId),
			)
			.unique();
		const versionNumber = (template?.version ?? 0) + 1;
		const quoteVersionId = await ctx.db.insert("projectSeriesQuoteVersions", {
			orgId: ctx.orgId,
			seriesId: series._id,
			sourceQuoteId: rootSourceQuoteId,
			capturedFromQuoteId: quote._id,
			clientId: series.clientId,
			propertyId: series.propertyId,
			createdByUserId: ctx.user._id,
			version: versionNumber,
			...snapshot,
		});
		if (!template) {
			const templateId = await ctx.db.insert("projectSeriesQuoteTemplates", {
				orgId: ctx.orgId,
				seriesId: series._id,
				sourceQuoteId: rootSourceQuoteId,
				sourceNominalDate: project.recurringNominalDate!,
				versionId: quoteVersionId,
				version: versionNumber,
				title: quote.title,
				active: false,
			});
			template = (await ctx.db.get(templateId))!;
		}
		const revisionId = await ctx.db.insert("projectSeriesAgreementRevisions", {
			orgId: ctx.orgId,
			seriesId: series._id,
			revisionNumber,
			sourceQuoteId: quote._id,
			templateId: template._id,
			quoteVersionId,
			status: "draft",
			approvalCycle: quote.approvalCycle ?? 0,
			createdByUserId: ctx.user._id,
			createdAt: Date.now(),
		});
		const client = await ctx.orgEntity("clients", series.clientId);
		const property = series.propertyId
			? await ctx.orgEntity("clientProperties", series.propertyId)
			: null;
		const scope = args.proposedScope
			? {
					title: args.proposedScope.title,
					description: args.proposedScope.description ?? undefined,
				}
			: { title: series.title, description: series.description };
		if (!scope.title.trim())
			throw new ConvexError("Agreement scope title cannot be empty");
		const ruleError =
			args.proposedRule &&
			validateRecurrenceRule(args.proposedRule, series.anchorDateKey);
		if (ruleError) throw new ConvexError(ruleError);
		const terms = {
			schemaVersion: 1 as const,
			revisionId,
			seriesId: series._id,
			revisionNumber,
			agreementReference: quote.quoteNumber ?? `Agreement ${revisionNumber}`,
			client: { id: client._id, name: client.companyName },
			property: property
				? {
						id: property._id,
						name: property.propertyName,
						address:
							property.formattedAddress ??
							[
								property.streetAddress,
								property.city,
								property.state,
								property.zipCode,
							].join(", "),
					}
				: undefined,
			scope,
			schedule: {
				rule: args.proposedRule ?? series.rule,
				anchorDateKey: series.anchorDateKey,
				timezone: series.timezone,
			},
			billingMode: args.billingMode,
			paymentRule: args.paymentRule,
		};
		await assertMonthlyAgreementTerms(ctx, ctx.orgId, terms);
		await ctx.db.patch(revisionId, { terms });
		await ctx.db.patch(quote._id, {
			recurringAgreementTerms: terms,
			recurringAgreementRevisionId: revisionId,
			projectSeriesQuoteTemplateId: template._id,
			projectSeriesQuoteVersionId: quoteVersionId,
			recurringQuoteAppliedVersion: versionNumber,
			contentUpdatedAt: Date.now(),
		});
		const seriesRevision = (series.revision ?? 0) + 1;
		await ctx.db.patch(series._id, {
			agreementQuoteId: rootSourceQuoteId,
			pendingAgreementRevisionId: revisionId,
			revision: seriesRevision,
		});
		return { revisionId, revisionNumber, terms, seriesRevision };
	},
});

export const createRevisionDraft = userMutation({
	args: { seriesId: v.id("projectSeries") },
	returns: v.object({ quoteId: v.id("quotes") }),
	handler: async (ctx, args) => {
		await requireAgreementAccess(ctx, "modify");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		if (series.state !== "active" || !series.activeAgreementRevisionId)
			throw new ConvexError("This series has no active agreement to revise");
		if (series.pendingAgreementRevisionId)
			throw new ConvexError(
				"Finish or replace the pending agreement revision first",
			);
		const active = await ctx.orgEntity(
			"projectSeriesAgreementRevisions",
			series.activeAgreementRevisionId,
		);
		return {
			quoteId: await createAgreementRevisionQuote(ctx, active, ctx.user._id),
		};
	},
});

export const restoreVisit = userMutation({
	args: { quoteId: v.id("quotes") },
	returns: v.object({
		revisionId: v.id("projectSeriesAgreementRevisions"),
		approvedAt: v.number(),
	}),
	handler: async (ctx, args) => {
		const { quote, project, series } = await context(ctx, args.quoteId);
		const restorable = await restorableAgreementPricing(
			ctx,
			quote,
			project,
			series,
		);
		if (!restorable)
			throw new ConvexError(
				"This visit has no approved agreement pricing available to restore",
			);
		const { revision, ledger } = restorable;
		const template = await ctx.orgEntity(
			"projectSeriesQuoteTemplates",
			revision.templateId,
		);
		const version = await ctx.orgEntity(
			"projectSeriesQuoteVersions",
			revision.quoteVersionId,
		);
		const lines = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
			.take(101);
		if (lines.length > 100)
			throw new ConvexError("Visit quote line item limit exceeded");
		for (const line of lines) await ctx.db.delete(line._id);
		await ctx.db.patch(quote._id, {
			...recurringQuoteFields(
				version,
				project,
				template,
				quote.quoteNumber ?? "",
			),
			firstSentAt: quote.firstSentAt,
			status: "approved",
			approvedAt: revision.approvedAt,
			recurringQuoteOverride: false,
			recurringAgreementTerms: revision.terms,
			recurringAgreementRevisionId: revision._id,
			recurringAgreementEvidenceId: revision.decisionEvidenceId,
			recurringInheritedAt: revision.approvedAt,
		});
		await writeRecurringQuoteLines(ctx, quote._id, version);
		if (ledger)
			await ctx.db.patch(ledger._id, {
				versionId: version._id,
				appliedVersion: version.version,
				protected: true,
			});
		return { revisionId: revision._id, approvedAt: revision.approvedAt! };
	},
});
