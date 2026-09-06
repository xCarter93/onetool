import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { userMutation, userQuery, type UserQueryCtx } from "./lib/factories";
import { recurringPaymentRuleValidator } from "./lib/recurringPaymentRules";
import { createAgreementRevisionDraft, latestAgreementRevision, recurringAgreementTermsValidator, validatePaymentRule } from "./lib/projectSeriesAgreements";
import { recurringQuoteFields, snapshotQuoteVersion, writeRecurringQuoteLines } from "./lib/projectSeriesQuotes";
import { projectRecurrenceRuleValidator } from "./lib/projectRecurrence";
import { assertMonthlyAgreementTerms } from "./lib/recurringPaymentChanges";

async function context(ctx: UserQueryCtx, quoteId: Id<"quotes">) {
	await ctx.requireLevel("projects", "modify");
	await ctx.requireLevel("quotes", "modify");
	if (!(await ctx.hasAllRecords("projects")) || !(await ctx.hasAllRecords("quotes"))) throw new ConvexError("Organization-wide project and quote access is required");
	const quote = await ctx.orgEntity("quotes", quoteId);
	if (!quote.projectId) throw new ConvexError("A recurring agreement must belong to a project");
	const project = await ctx.orgEntity("projects", quote.projectId);
	if (!project.recurringSeriesId || !project.recurringNominalDate) throw new ConvexError("Quote does not belong to a recurring series");
	const series = await ctx.orgEntity("projectSeries", project.recurringSeriesId);
	if (quote.clientId !== series.clientId || project.clientId !== series.clientId || project.propertyId !== series.propertyId) throw new ConvexError("Agreement quote scope does not match the recurring series");
	return { quote, project, series };
}

const revisionSummary = v.object({
	_id: v.id("projectSeriesAgreementRevisions"), revisionNumber: v.number(), status: v.union(v.literal("draft"), v.literal("pending"), v.literal("approved"), v.literal("superseded")),
	quoteId: v.id("quotes"), agreementReference: v.optional(v.string()), approvedAt: v.optional(v.number()),
});

export const getSeriesAgreement = userQuery({
	args: { seriesId: v.id("projectSeries") },
	returns: v.object({ agreementQuoteId: v.optional(v.id("quotes")), active: v.union(v.null(), revisionSummary), pending: v.union(v.null(), revisionSummary) }),
	handler: async (ctx, args) => {
		await ctx.requireLevel("projects", "view");
		await ctx.requireLevel("quotes", "view");
		if (!(await ctx.hasAllRecords("projects")) || !(await ctx.hasAllRecords("quotes"))) throw new ConvexError("Organization-wide project and quote access is required");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		const summarize = async (id?: Id<"projectSeriesAgreementRevisions">) => {
			if (!id) return null;
			const row = await ctx.orgEntity("projectSeriesAgreementRevisions", id);
			return { _id: row._id, revisionNumber: row.revisionNumber, status: row.status, quoteId: row.sourceQuoteId, agreementReference: row.terms?.agreementReference, approvedAt: row.approvedAt };
		};
		return { agreementQuoteId: series.agreementQuoteId, active: await summarize(series.activeAgreementRevisionId), pending: await summarize(series.pendingAgreementRevisionId) };
	},
});

export const getSetup = userQuery({
	args: { quoteId: v.id("quotes") },
	returns: v.object({ seriesId: v.id("projectSeries"), state: v.union(v.literal("active"), v.literal("paused"), v.literal("ended")), revision: v.number(), seriesSetup: v.object({ title: v.string(), description: v.optional(v.string()), rule: projectRecurrenceRuleValidator }), agreementQuoteId: v.optional(v.id("quotes")), active: v.union(v.null(), revisionSummary), pending: v.union(v.null(), revisionSummary), recurringAgreementRevisionId: v.optional(v.id("projectSeriesAgreementRevisions")), recurringInheritedAt: v.optional(v.number()), recurringQuoteOverride: v.boolean(), canPrepare: v.boolean(), canRestoreAgreementPricing: v.boolean() }),
	handler: async (ctx, args) => {
		const { quote, series } = await context(ctx, args.quoteId);
		const rootSourceQuoteId = quote.recurringAgreementSourceQuoteId ?? quote._id;
		const existingRevision = quote.recurringAgreementRevisionId ? await ctx.orgEntity("projectSeriesAgreementRevisions", quote.recurringAgreementRevisionId) : null;
		const canPrepare = series.state === "active" && quote.status === "draft" && (!series.agreementQuoteId || series.agreementQuoteId === rootSourceQuoteId) && !existingRevision?.monthlyPaymentScheduleVersionId;
		const ledger = await ctx.db.query("projectSeriesQuoteCopies").withIndex("by_quote", (q) => q.eq("quoteId", quote._id)).unique();
		const activeRevision = series.activeAgreementRevisionId ? await ctx.orgEntity("projectSeriesAgreementRevisions", series.activeAgreementRevisionId) : null;
		const staleLinkedDraft = quote.status === "draft" && !quote.recurringAgreementSourceQuoteId && ledger !== null && ledger.templateId === activeRevision?.templateId && ledger.versionId !== activeRevision?.quoteVersionId;
		const invoiced = Boolean(await ctx.db.query("invoices").withIndex("by_quote", (q) => q.eq("quoteId", quote._id)).first() || (quote.projectId && await ctx.db.query("invoices").withIndex("by_project", (q) => q.eq("projectId", quote.projectId)).first()));
		const canRestoreAgreementPricing = !series.agreementReviewRequired && !invoiced && Boolean(activeRevision?.status === "approved" && (quote.recurringQuoteOverride || staleLinkedDraft));
		const summarize = async (id?: Id<"projectSeriesAgreementRevisions">) => {
			if (!id) return null;
			const row = await ctx.orgEntity("projectSeriesAgreementRevisions", id);
			return { _id: row._id, revisionNumber: row.revisionNumber, status: row.status, quoteId: row.sourceQuoteId, agreementReference: row.terms?.agreementReference, approvedAt: row.approvedAt };
		};
		return { seriesId: series._id, state: series.state, revision: series.revision ?? 0, seriesSetup: { title: series.title, description: series.description, rule: series.rule }, agreementQuoteId: series.agreementQuoteId, active: await summarize(series.activeAgreementRevisionId), pending: await summarize(series.pendingAgreementRevisionId), recurringAgreementRevisionId: quote.recurringAgreementRevisionId, recurringInheritedAt: quote.recurringInheritedAt, recurringQuoteOverride: quote.recurringQuoteOverride === true, canPrepare, canRestoreAgreementPricing };
	},
});

export const prepare = userMutation({
	args: { quoteId: v.id("quotes"), billingMode: v.union(v.literal("per_visit"), v.literal("monthly")), paymentRule: recurringPaymentRuleValidator, proposedScope: v.optional(v.object({ title: v.string(), description: v.optional(v.union(v.string(), v.null())) })), proposedRule: v.optional(projectRecurrenceRuleValidator), expectedSeriesRevision: v.number() },
	returns: v.object({ revisionId: v.id("projectSeriesAgreementRevisions"), revisionNumber: v.number(), terms: recurringAgreementTermsValidator, seriesRevision: v.number() }),
	handler: async (ctx, args) => {
		const { quote, project, series } = await context(ctx, args.quoteId);
		if (series.state !== "active") throw new ConvexError("Resume this series before preparing an agreement");
		if ((series.revision ?? 0) !== args.expectedSeriesRevision) throw new ConvexError("Series changed; review the agreement again");
		if (quote.status !== "draft") throw new ConvexError("Prepare the recurring agreement from a draft quote");
		if (quote.recurringAgreementRevisionId) {
			const existing = await ctx.orgEntity("projectSeriesAgreementRevisions", quote.recurringAgreementRevisionId);
			if (existing.monthlyPaymentScheduleVersionId) throw new ConvexError("This quote belongs to a shared monthly payment proposal and cannot be prepared separately");
		}
		const rootSourceQuoteId = quote.recurringAgreementSourceQuoteId ?? quote._id;
		if (series.agreementQuoteId && series.agreementQuoteId !== rootSourceQuoteId) throw new ConvexError("This quote is not a revision of the designated recurring agreement");
		if (series.pendingAgreementRevisionId) {
			const pending = await ctx.orgEntity("projectSeriesAgreementRevisions", series.pendingAgreementRevisionId);
			if (pending.monthlyPaymentScheduleVersionId) throw new ConvexError("Cancel the shared monthly payment proposal before preparing another agreement revision");
			await ctx.db.patch(pending._id, { status: "superseded" });
		}
		validatePaymentRule(args.paymentRule);
		const latest = await latestAgreementRevision(ctx, series._id);
		const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
		const snapshot = await snapshotQuoteVersion(ctx, quote);
		let template = await ctx.db.query("projectSeriesQuoteTemplates").withIndex("by_series_source", (q) => q.eq("seriesId", series._id).eq("sourceQuoteId", rootSourceQuoteId)).unique();
		const versionNumber = (template?.version ?? 0) + 1;
		const quoteVersionId = await ctx.db.insert("projectSeriesQuoteVersions", { orgId: ctx.orgId, seriesId: series._id, sourceQuoteId: rootSourceQuoteId, capturedFromQuoteId: quote._id, clientId: series.clientId, propertyId: series.propertyId, createdByUserId: ctx.user._id, version: versionNumber, ...snapshot });
		if (!template) {
			const templateId = await ctx.db.insert("projectSeriesQuoteTemplates", { orgId: ctx.orgId, seriesId: series._id, sourceQuoteId: rootSourceQuoteId, sourceNominalDate: project.recurringNominalDate!, versionId: quoteVersionId, version: versionNumber, title: quote.title, active: false });
			template = (await ctx.db.get(templateId))!;
		}
		const revisionId = await ctx.db.insert("projectSeriesAgreementRevisions", { orgId: ctx.orgId, seriesId: series._id, revisionNumber, sourceQuoteId: quote._id, templateId: template._id, quoteVersionId, status: "draft", approvalCycle: quote.approvalCycle ?? 0, createdByUserId: ctx.user._id, createdAt: Date.now() });
		const client = await ctx.orgEntity("clients", series.clientId);
		const property = series.propertyId ? await ctx.orgEntity("clientProperties", series.propertyId) : null;
		const scope = args.proposedScope ? { title: args.proposedScope.title, description: args.proposedScope.description ?? undefined } : { title: series.title, description: series.description };
		if (!scope.title.trim()) throw new ConvexError("Agreement scope title cannot be empty");
		const terms = { schemaVersion: 1 as const, revisionId, seriesId: series._id, revisionNumber, agreementReference: quote.quoteNumber ?? `Agreement ${revisionNumber}`, client: { id: client._id, name: client.companyName }, property: property ? { id: property._id, name: property.propertyName, address: property.formattedAddress ?? [property.streetAddress, property.city, property.state, property.zipCode].join(", ") } : undefined, scope, schedule: { rule: args.proposedRule ?? series.rule, anchorDateKey: series.anchorDateKey, timezone: series.timezone }, billingMode: args.billingMode, paymentRule: args.paymentRule };
		await assertMonthlyAgreementTerms(ctx, ctx.orgId, terms);
		await ctx.db.patch(revisionId, { terms });
		await ctx.db.patch(quote._id, { recurringAgreementTerms: terms, recurringAgreementRevisionId: revisionId, projectSeriesQuoteTemplateId: template._id, projectSeriesQuoteVersionId: quoteVersionId, recurringQuoteAppliedVersion: versionNumber, contentUpdatedAt: Date.now() });
		const seriesRevision = (series.revision ?? 0) + 1;
		await ctx.db.patch(series._id, { agreementQuoteId: rootSourceQuoteId, pendingAgreementRevisionId: revisionId, revision: seriesRevision });
		return { revisionId, revisionNumber, terms, seriesRevision };
	},
});

export const createRevisionDraft = userMutation({
	args: { seriesId: v.id("projectSeries") }, returns: v.object({ quoteId: v.id("quotes") }),
	handler: async (ctx, args) => {
		await ctx.requireLevel("projects", "modify");
		await ctx.requireLevel("quotes", "modify");
		if (!(await ctx.hasAllRecords("projects")) || !(await ctx.hasAllRecords("quotes"))) throw new ConvexError("Organization-wide project and quote access is required");
		const series = await ctx.orgEntity("projectSeries", args.seriesId);
		if (series.state !== "active" || !series.activeAgreementRevisionId) throw new ConvexError("This series has no active agreement to revise");
		if (series.pendingAgreementRevisionId) throw new ConvexError("Finish or replace the pending agreement revision first");
		const active = await ctx.orgEntity("projectSeriesAgreementRevisions", series.activeAgreementRevisionId);
		return createAgreementRevisionDraft(ctx, active, ctx.user._id);
	},
});

export const restoreVisit = userMutation({
	args: { quoteId: v.id("quotes") },
	returns: v.object({ revisionId: v.id("projectSeriesAgreementRevisions"), approvedAt: v.number() }),
	handler: async (ctx, args) => {
		const { quote, project, series } = await context(ctx, args.quoteId);
		if (series.agreementReviewRequired) throw new ConvexError("Review the changed signed agreement before restoring its pricing");
		if (!series.activeAgreementRevisionId) throw new ConvexError("This series has no approved agreement pricing to restore");
		if (
			await ctx.db.query("invoices").withIndex("by_quote", (q) => q.eq("quoteId", quote._id)).first() ||
			await ctx.db.query("invoices").withIndex("by_project", (q) => q.eq("projectId", project._id)).first() ||
			await ctx.db.query("invoiceGroups").withIndex("by_source_quote", (q) => q.eq("sourceQuoteId", quote._id)).first() ||
			await ctx.db.query("invoiceGroups").withIndex("by_source_project", (q) => q.eq("sourceProjectId", project._id)).first()
		) throw new ConvexError("Invoiced visit pricing cannot be restored");
		const revision = await ctx.orgEntity("projectSeriesAgreementRevisions", series.activeAgreementRevisionId);
		if (revision.status !== "approved" || !revision.terms || !revision.decisionEvidenceId || revision.approvedAt === undefined) throw new ConvexError("Approved agreement provenance is incomplete");
		const template = await ctx.orgEntity("projectSeriesQuoteTemplates", revision.templateId);
		const version = await ctx.orgEntity("projectSeriesQuoteVersions", revision.quoteVersionId);
		const ledger = await ctx.db.query("projectSeriesQuoteCopies").withIndex("by_quote", (q) => q.eq("quoteId", quote._id)).unique();
		const staleLinkedDraft = quote.status === "draft" && !quote.recurringAgreementSourceQuoteId && ledger !== null && ledger.templateId === revision.templateId && ledger.versionId !== revision.quoteVersionId;
		if (!quote.recurringQuoteOverride && !staleLinkedDraft) throw new ConvexError("This quote does not have agreement pricing available to restore");
		const lines = await ctx.db.query("quoteLineItems").withIndex("by_quote", (q) => q.eq("quoteId", quote._id)).take(101);
		if (lines.length > 100) throw new ConvexError("Visit quote line item limit exceeded");
		for (const line of lines) await ctx.db.delete(line._id);
		await ctx.db.patch(quote._id, {
			...recurringQuoteFields(version, project, template, quote.quoteNumber ?? ""),
			status: "approved",
			approvedAt: revision.approvedAt,
			recurringQuoteOverride: false,
			recurringAgreementTerms: revision.terms,
			recurringAgreementRevisionId: revision._id,
			recurringAgreementEvidenceId: revision.decisionEvidenceId,
			recurringInheritedAt: revision.approvedAt,
		});
		await writeRecurringQuoteLines(ctx, quote._id, version);
		if (ledger) await ctx.db.patch(ledger._id, { versionId: version._id, appliedVersion: version.version, protected: true });
		return { revisionId: revision._id, approvedAt: revision.approvedAt };
	},
});
