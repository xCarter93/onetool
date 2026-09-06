import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { applyApprovedAgreementToExistingProjects, recurringQuoteFields, snapshotQuoteVersion, writeRecurringQuoteLines } from "./projectSeriesQuotes";
import { nextQuoteNumber } from "./orgCounters";
import { addCalendarDays, dateKeyFromTimestamp, listRecurrenceDates, validateRecurrenceRule } from "./projectRecurrence";
import { validateRecurringPaymentRule } from "./recurringPaymentRules";
import type { RecurringPaymentRule } from "./recurringPaymentRules";
import { approveMonthlyPaymentRevision, assertMonthlyAgreementTerms } from "./recurringPaymentChanges";
import { emitStatusChangeEvent } from "../eventBus";

export { recurringAgreementTermsValidator, type RecurringAgreementTerms, type AgreementPaymentRule } from "./recurringAgreementTerms";
import type { RecurringAgreementTerms } from "./recurringAgreementTerms";
export const validatePaymentRule = validateRecurringPaymentRule;

export async function createAgreementRevisionDraft(ctx: MutationCtx, activeRevision: Doc<"projectSeriesAgreementRevisions">, createdByUserId: Id<"users">): Promise<{ quoteId: Id<"quotes">; revisionId?: undefined }>;
export async function createAgreementRevisionDraft(ctx: MutationCtx, activeRevision: Doc<"projectSeriesAgreementRevisions">, createdByUserId: Id<"users">, paymentRule: RecurringPaymentRule, monthlyPaymentScheduleVersionId?: Id<"clientMonthlyPaymentScheduleVersions">): Promise<{ quoteId: Id<"quotes">; revisionId: Id<"projectSeriesAgreementRevisions"> }>;
export async function createAgreementRevisionDraft(ctx: MutationCtx, activeRevision: Doc<"projectSeriesAgreementRevisions">, createdByUserId: Id<"users">, paymentRule?: RecurringPaymentRule, monthlyPaymentScheduleVersionId?: Id<"clientMonthlyPaymentScheduleVersions">) {
	if (activeRevision.status !== "approved" || !activeRevision.terms) throw new ConvexError("Only an approved agreement can be revised");
	const [series, template, version] = await Promise.all([ctx.db.get(activeRevision.seriesId), ctx.db.get(activeRevision.templateId), ctx.db.get(activeRevision.quoteVersionId)]);
	if (!series || !template || !version || series.orgId !== activeRevision.orgId || series.activeAgreementRevisionId !== activeRevision._id)
		throw new ConvexError("Active recurring agreement setup is missing");
	const project = await ctx.db.get(series.originatingProjectId);
	if (!project || project.orgId !== series.orgId || project.clientId !== series.clientId || project.propertyId !== series.propertyId)
		throw new ConvexError("Recurring agreement origin project is unavailable");
	const quoteId = await ctx.db.insert("quotes", { ...recurringQuoteFields(version, project, template, await nextQuoteNumber(ctx, series.orgId)), createdByUserId, recurringAgreementSourceQuoteId: series.agreementQuoteId });
	await writeRecurringQuoteLines(ctx, quoteId, version);
	if (!paymentRule) return { quoteId };
	validateRecurringPaymentRule(paymentRule);
	if (series.pendingAgreementRevisionId) throw new ConvexError("Finish the pending agreement revision before changing future payments");
	const latest = await latestAgreementRevision(ctx, series._id);
	const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
	const quote = (await ctx.db.get(quoteId))!;
	const snapshot = await snapshotQuoteVersion(ctx, quote);
	const versionNumber = template.version + 1;
	const quoteVersionId = await ctx.db.insert("projectSeriesQuoteVersions", {
		orgId: series.orgId, seriesId: series._id, sourceQuoteId: series.agreementQuoteId ?? version.sourceQuoteId,
		capturedFromQuoteId: quoteId, clientId: series.clientId, propertyId: series.propertyId,
		createdByUserId, version: versionNumber, ...snapshot,
	});
	const revisionId = await ctx.db.insert("projectSeriesAgreementRevisions", {
		orgId: series.orgId, seriesId: series._id, revisionNumber, sourceQuoteId: quoteId, templateId: template._id,
		quoteVersionId, status: "draft", approvalCycle: quote.approvalCycle ?? 0, createdByUserId, createdAt: Date.now(),
		monthlyPaymentScheduleVersionId,
	});
	const terms: RecurringAgreementTerms = {
		...activeRevision.terms,
		revisionId,
		revisionNumber,
		agreementReference: quote.quoteNumber ?? `Agreement ${revisionNumber}`,
		paymentRule,
		monthlyPaymentScheduleVersionId,
		paymentChangeActivation: monthlyPaymentScheduleVersionId ? "next_full_month_after_all_approvals" : undefined,
	};
	await ctx.db.patch(revisionId, { terms });
	await ctx.db.patch(quoteId, {
		recurringAgreementTerms: terms, recurringAgreementRevisionId: revisionId,
		projectSeriesQuoteTemplateId: template._id, projectSeriesQuoteVersionId: quoteVersionId,
		recurringQuoteAppliedVersion: versionNumber, contentUpdatedAt: Date.now(),
	});
	await ctx.db.patch(series._id, { pendingAgreementRevisionId: revisionId, revision: (series.revision ?? 0) + 1 });
	return { quoteId, revisionId };
}

async function startedOrBilled(ctx: Pick<QueryCtx, "db">, project: Doc<"projects">) {
	if (project.completedAt !== undefined || project.status === "in-progress" || project.status === "completed") return true;
	for (const status of ["in-progress", "completed"] as const)
		if (await ctx.db.query("tasks").withIndex("by_project_status", (q) => q.eq("projectId", project._id).eq("status", status)).first()) return true;
	return Boolean(
		await ctx.db.query("invoices").withIndex("by_project", (q) => q.eq("projectId", project._id)).first() ||
		await ctx.db.query("invoiceGroups").withIndex("by_source_project", (q) => q.eq("sourceProjectId", project._id)).first()
	);
}

async function applyApprovedSeriesTerms(ctx: MutationCtx, series: Doc<"projectSeries">, terms: RecurringAgreementTerms, revision: number) {
	const ruleError = validateRecurrenceRule(terms.schedule.rule, terms.schedule.anchorDateKey);
	if (ruleError) throw new ConvexError(ruleError);
	const today = dateKeyFromTimestamp(Date.now(), series.timezone);
	const start = Date.parse(`${today}T00:00:00.000Z`);
	const visits = await ctx.db.query("projects").withIndex("by_series_start", (q) => q.eq("recurringSeriesId", series._id).gte("startDate", start)).take(201);
	if (visits.length > 200) throw new ConvexError("Agreement change affects more than 200 visits");
	const cadenceChanged = JSON.stringify(series.rule) !== JSON.stringify(terms.schedule.rule);
	const selected = new Set(cadenceChanged ? listRecurrenceDates({ rule: terms.schedule.rule, anchor: series.anchorDateKey, from: today, through: addCalendarDays(today, 90), limit: 100, includeNext: true }) : []);
	for (const visit of visits) {
		if (await startedOrBilled(ctx, visit)) continue;
		const overrides = visit.recurringFieldOverrides ?? [];
		const updates: Partial<Doc<"projects">> = { recurringAppliedRevision: revision };
		if (!overrides.includes("title")) updates.title = terms.scope.title;
		if (!overrides.includes("description")) updates.description = terms.scope.description;
		if (cadenceChanged) {
			const date = visit.recurringNominalDate ?? "";
			const restoring = visit.recurringSkipReason === "schedule-change" && selected.has(date);
			const removing = visit.status === "planned" && !visit.recurringState && !selected.has(date);
			if (restoring || removing) {
				const quote = await ctx.db.query("quotes").withIndex("by_project", (q) => q.eq("projectId", visit._id)).first();
				if (!quote && !overrides.length && visit._id !== series.originatingProjectId) {
					updates.status = restoring ? "planned" : "cancelled";
					updates.recurringState = restoring ? undefined : "skipped";
					updates.recurringSkipReason = restoring ? undefined : "schedule-change";
				}
			}
		}
		await ctx.db.patch(visit._id, updates);
	}
	await ctx.db.patch(series._id, { title: terms.scope.title, description: terms.scope.description, rule: terms.schedule.rule, nextGenerationAt: Date.now(), revision });
	if (cadenceChanged) await ctx.scheduler.runAfter(0, internal.projectSeries.generate, { orgId: series.orgId, seriesId: series._id });
}

function comparableQuoteVersion(value: Awaited<ReturnType<typeof snapshotQuoteVersion>> | Doc<"projectSeriesQuoteVersions">) {
	return {
		title: value.title, clientMessage: value.clientMessage, terms: value.terms,
		discountEnabled: value.discountEnabled, discountAmount: value.discountAmount, discountType: value.discountType,
		taxEnabled: value.taxEnabled, taxRate: value.taxRate, pdfSettings: value.pdfSettings,
		lineItems: [...value.lineItems].sort((a, b) => a.sortOrder - b.sortOrder).map((line) => ({ description: line.description, quantity: line.quantity, unit: line.unit, rate: line.rate, amount: line.amount, cost: line.cost, skuId: line.skuId, sortOrder: line.sortOrder })),
	};
}

export async function assertAgreementSourceCurrent(ctx: Pick<QueryCtx, "db">, quote: Doc<"quotes">, revision: Doc<"projectSeriesAgreementRevisions">) {
	const version = await ctx.db.get(revision.quoteVersionId);
	if (!version || version.capturedFromQuoteId !== quote._id || !revision.terms || quote.recurringAgreementTerms?.revisionId !== revision._id)
		throw new ConvexError("Prepare the updated recurring agreement before generating it");
	const current = await snapshotQuoteVersion(ctx, quote);
	if (JSON.stringify(comparableQuoteVersion(current)) !== JSON.stringify(comparableQuoteVersion(version)))
		throw new ConvexError("Prepare the updated recurring agreement before generating it");
}

export async function activateAgreementApproval(
	ctx: MutationCtx,
	quoteId: Id<"quotes">,
	evidenceId: Id<"quoteDecisionEvidence">
) {
	const quote = await ctx.db.get(quoteId);
	const evidence = await ctx.db.get(evidenceId);
	if (!quote || !evidence || evidence.quoteId !== quoteId || evidence.orgId !== quote.orgId || evidence.action !== "approved") return null;
	const revisionId = quote.recurringAgreementRevisionId;
	if (!revisionId) return null;
	const revision = await ctx.db.get(revisionId);
	if (!revision || revision.sourceQuoteId !== quoteId || revision.orgId !== quote.orgId) return null;
	await assertAgreementSourceCurrent(ctx, quote, revision);
	if (revision.status === "approved") return revision._id;
	const document = await ctx.db.get(evidence.documentId);
	const unsafeVendorDocument = evidence.channel === "boldsign" && (document?.recurringAgreementLocked !== true || document.recurringAgreementEditedAt !== undefined);
	if (revision.status !== "pending" || !document || unsafeVendorDocument ||
		evidence.contentBinding !== "rendered_document" || evidence.snapshotSource !== "server" ||
		evidence.documentId !== revision.approvalDocumentId || evidence.contentSnapshot?.approvalCycle !== revision.approvalCycle ||
		evidence.contentSnapshot?.recurringAgreementTerms?.revisionId !== revision._id)
		throw new ConvexError("This approval is not bound to the pending recurring agreement version");
	const series = await ctx.db.get(revision.seriesId);
	if (!series || series.pendingAgreementRevisionId !== revision._id || series.agreementQuoteId !== (quote.recurringAgreementSourceQuoteId ?? quoteId)) throw new ConvexError("Recurring agreement revision is no longer pending");
	const now = evidence.decidedAt;
	const template = await ctx.db.get(revision.templateId);
	if (!template || template.seriesId !== series._id || template.sourceQuoteId !== series.agreementQuoteId) throw new ConvexError("Recurring agreement quote setup is missing");
	const quoteVersion = await ctx.db.get(revision.quoteVersionId);
	if (!quoteVersion) throw new ConvexError("Recurring agreement quote version is missing");
	await assertMonthlyAgreementTerms(ctx, revision.orgId, revision.terms!);
	await ctx.db.patch(quote._id, { recurringAgreementEvidenceId: evidence._id });
	if (await approveMonthlyPaymentRevision(ctx, revision, evidence)) return revision._id;
	await ctx.db.patch(revision._id, { status: "approved", decisionEvidenceId: evidence._id, approvedAt: now });
	await applyApprovedAgreementRevision(ctx, { ...revision, status: "approved", decisionEvidenceId: evidence._id, approvedAt: now });
	return revision._id;
}

export async function applyApprovedAgreementRevision(ctx: MutationCtx, revision: Doc<"projectSeriesAgreementRevisions">) {
	if (revision.status !== "approved" || !revision.terms || !revision.decisionEvidenceId || revision.approvedAt === undefined)
		throw new ConvexError("Approved recurring agreement provenance is incomplete");
	const [series, template, quoteVersion, quote] = await Promise.all([
		ctx.db.get(revision.seriesId), ctx.db.get(revision.templateId), ctx.db.get(revision.quoteVersionId), ctx.db.get(revision.sourceQuoteId),
	]);
	if (!series || !template || !quoteVersion || !quote || series.orgId !== revision.orgId ||
		series.pendingAgreementRevisionId !== revision._id || template.seriesId !== series._id ||
		template.sourceQuoteId !== series.agreementQuoteId)
		throw new ConvexError("Recurring agreement revision is no longer pending");
	await ctx.db.patch(template._id, { versionId: revision.quoteVersionId, version: quoteVersion.version, title: quote.title, active: true });
	if (series.activeAgreementRevisionId && series.activeAgreementRevisionId !== revision._id) {
		const prior = await ctx.db.get(series.activeAgreementRevisionId);
		if (prior?.status === "approved") await ctx.db.patch(prior._id, { status: "superseded" });
	}
	const seriesRevision = (series.revision ?? 0) + 1;
	await applyApprovedSeriesTerms(ctx, series, revision.terms, seriesRevision);
	await ctx.db.patch(series._id, { activeAgreementRevisionId: revision._id, pendingAgreementRevisionId: undefined, revision: seriesRevision, agreementReviewRequired: false });
	await applyApprovedAgreementToExistingProjects(ctx, series, revision, series.createdByUserId);
}

export async function bindAgreementApprovalDocument(ctx: MutationCtx, quoteId: Id<"quotes">, documentId: Id<"documents">) {
	const quote = await ctx.db.get(quoteId);
	if (!quote?.recurringAgreementRevisionId) return;
	const revision = await ctx.db.get(quote.recurringAgreementRevisionId);
	if (!revision || revision.sourceQuoteId !== quoteId || (revision.status !== "draft" && revision.status !== "pending")) return;
	await assertAgreementSourceCurrent(ctx, quote, revision);
	const document = await ctx.db.get(documentId);
	if (!document || document.orgId !== quote.orgId || document.documentType !== "quote" || document.documentId !== quoteId || document.quoteSnapshotSource !== "server" || (!document.quoteContentSnapshotId && !document.quoteContentSnapshot))
		throw new ConvexError("Recurring agreements require a controlled server-rendered document");
	await ctx.db.patch(revision._id, { approvalDocumentId: documentId, status: "pending" });
}

export async function latestAgreementRevision(ctx: Pick<QueryCtx, "db">, seriesId: Id<"projectSeries">) {
	return ctx.db.query("projectSeriesAgreementRevisions").withIndex("by_series_revision", (q) => q.eq("seriesId", seriesId)).order("desc").first();
}

export async function discardPendingAgreementRevision(
	ctx: MutationCtx,
	series: Doc<"projectSeries">,
	revision: Doc<"projectSeriesAgreementRevisions">,
	withdrawnByUserId: Id<"users">,
	providerRevoked: boolean
) {
	if (series.pendingAgreementRevisionId !== revision._id || revision.seriesId !== series._id || (revision.status !== "draft" && revision.status !== "pending"))
		throw new ConvexError("Recurring agreement revision is no longer pending");
	if (revision.monthlyPaymentScheduleVersionId)
		throw new ConvexError("Cancel the shared monthly payment proposal instead");
	const quote = await ctx.db.get(revision.sourceQuoteId);
	if (!quote || quote.orgId !== series.orgId || quote.recurringAgreementRevisionId !== revision._id)
		throw new ConvexError("Pending recurring agreement quote is unavailable");
	const document = revision.approvalDocumentId ? await ctx.db.get(revision.approvalDocumentId) : null;
	const delivered = quote.status === "sent" || Boolean(document?.boldsign || document?.recurringSignatureSendState);
	if (delivered && (!providerRevoked || (document?.boldsign && !["Revoked", "Declined", "Expired"].includes(document.boldsign.status))))
		throw new ConvexError("Revoke the signature request before withdrawing this agreement");
	const now = Date.now();
	const resetDelivery = quote.status === "sent" || quote.status === "declined" || quote.status === "expired";
	await ctx.db.patch(revision._id, { status: "superseded", withdrawnAt: now, withdrawnByUserId });
	await ctx.db.patch(quote._id, {
		recurringAgreementTerms: undefined,
		recurringAgreementRevisionId: undefined,
		status: resetDelivery ? "draft" : quote.status,
		sentAt: resetDelivery ? undefined : quote.sentAt,
		declinedAt: resetDelivery ? undefined : quote.declinedAt,
		approvalCycle: (quote.approvalCycle ?? 0) + 1,
		contentUpdatedAt: now,
	});
	if (resetDelivery) {
		await emitStatusChangeEvent(ctx, quote.orgId, "quote", quote._id, quote.status, "draft", "projectSeriesAgreements.withdraw");
	}
	await ctx.db.patch(series._id, {
		pendingAgreementRevisionId: undefined,
		agreementQuoteId: series.activeAgreementRevisionId ? series.agreementQuoteId : undefined,
		revision: (series.revision ?? 0) + 1,
	});
}
