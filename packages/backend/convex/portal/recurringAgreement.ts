import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// The revision a customer is replacing: the newest earlier one that was actually
// agreed. Withdrawn revisions are also marked superseded, so withdrawnAt rules them out.
async function portalPriorRevision(
	ctx: QueryCtx,
	quote: Doc<"quotes">,
	revision: Doc<"projectSeriesAgreementRevisions">,
) {
	if (revision.revisionNumber <= 1) return null;
	const earlier = await ctx.db
		.query("projectSeriesAgreementRevisions")
		.withIndex("by_series_revision", (q) =>
			q.eq("seriesId", revision.seriesId).lt("revisionNumber", revision.revisionNumber),
		)
		.order("desc")
		.collect();
	const prior = earlier.find(
		(candidate) =>
			candidate.terms !== undefined &&
			candidate.withdrawnAt === undefined &&
			(candidate.status === "approved" || candidate.status === "superseded"),
	);
	if (
		!prior?.terms ||
		prior.orgId !== quote.orgId ||
		prior.terms.client.id !== quote.clientId
	)
		return null;
	const priorSource = await ctx.db.get(prior.sourceQuoteId);
	if (
		!priorSource ||
		priorSource.orgId !== quote.orgId ||
		priorSource.clientId !== quote.clientId
	)
		return null;
	return {
		revisionNumber: prior.revisionNumber,
		perVisitTotal: priorSource.total,
		schedule: prior.terms.schedule,
		billingMode: prior.terms.billingMode,
		paymentRule: prior.terms.paymentRule,
	};
}

export async function portalAgreementContext(
	ctx: QueryCtx,
	quote: Doc<"quotes">,
) {
	if (!quote.recurringAgreementRevisionId) return null;
	const revision = await ctx.db.get(quote.recurringAgreementRevisionId);
	if (
		!revision ||
		revision.orgId !== quote.orgId ||
		revision.terms?.client.id !== quote.clientId
	)
		return null;
	const source = await ctx.db.get(revision.sourceQuoteId);
	if (
		!source ||
		source.orgId !== quote.orgId ||
		source.clientId !== quote.clientId
	)
		return null;
	const project = quote.projectId ? await ctx.db.get(quote.projectId) : null;
	if (
		project &&
		(project.orgId !== quote.orgId ||
			project.clientId !== quote.clientId ||
			project.recurringSeriesId !== revision.seriesId)
	)
		return null;
	const isAgreement = source._id === quote._id;
	return {
		revision,
		source,
		metadata: {
			revisionId: revision._id,
			reference: revision.terms.agreementReference,
			revisionNumber: revision.revisionNumber,
			sourceQuoteId: source._id,
			sourceVisible: source.status !== "draft",
			seriesId: revision.seriesId,
			isAgreement,
			inherited:
				Boolean(quote.recurringInheritedAt) && !quote.recurringQuoteOverride,
			visitOverride: quote.recurringQuoteOverride === true,
			serviceDate: project?.startDate,
			agreementPerVisitTotal: source.total,
			previousRevision: isAgreement
				? await portalPriorRevision(ctx, quote, revision)
				: null,
		},
	};
}

// The source agreement's signed PDF, released only through its own approval evidence.
export async function portalApprovedAgreementDocument(
	ctx: QueryCtx,
	quote: Doc<"quotes">,
	agreement: NonNullable<Awaited<ReturnType<typeof portalAgreementContext>>>,
) {
	const { revision, source } = agreement;
	if (revision.status !== "approved" && revision.status !== "superseded")
		return null;
	const document = revision.approvalDocumentId
		? await ctx.db.get(revision.approvalDocumentId)
		: null;
	const evidence = revision.decisionEvidenceId
		? await ctx.db.get(revision.decisionEvidenceId)
		: null;
	if (
		!document ||
		!evidence ||
		document.orgId !== quote.orgId ||
		document.documentType !== "quote" ||
		document.documentId !== source._id ||
		evidence.orgId !== quote.orgId ||
		evidence.clientId !== quote.clientId ||
		evidence.quoteId !== source._id ||
		evidence.documentId !== document._id ||
		evidence.action !== "approved"
	)
		return null;
	return document;
}
