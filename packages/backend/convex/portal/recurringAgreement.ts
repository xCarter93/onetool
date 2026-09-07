import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

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
	return {
		revision,
		source,
		metadata: {
			revisionId: revision._id,
			reference: revision.terms.agreementReference,
			sourceQuoteId: source._id,
			seriesId: revision.seriesId,
			inherited:
				Boolean(quote.recurringInheritedAt) && !quote.recurringQuoteOverride,
			visitOverride: quote.recurringQuoteOverride === true,
			serviceDate: project?.startDate,
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
