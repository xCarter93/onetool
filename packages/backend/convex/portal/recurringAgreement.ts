import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function portalAgreementContext(ctx: QueryCtx, quote: Doc<"quotes">) {
	if (!quote.recurringAgreementRevisionId) return null;
	const revision = await ctx.db.get(quote.recurringAgreementRevisionId);
	if (!revision || revision.orgId !== quote.orgId || revision.terms?.client.id !== quote.clientId) return null;
	const source = await ctx.db.get(revision.sourceQuoteId);
	if (!source || source.orgId !== quote.orgId || source.clientId !== quote.clientId) return null;
	const project = quote.projectId ? await ctx.db.get(quote.projectId) : null;
	if (project && (project.orgId !== quote.orgId || project.clientId !== quote.clientId || project.recurringSeriesId !== revision.seriesId)) return null;
	const document = revision.approvalDocumentId ? await ctx.db.get(revision.approvalDocumentId) : null;
	const evidence = revision.decisionEvidenceId ? await ctx.db.get(revision.decisionEvidenceId) : null;
	const approvedDocument = (revision.status === "approved" || revision.status === "superseded") && evidence?.orgId === quote.orgId && evidence.clientId === quote.clientId && evidence.quoteId === source._id && evidence.documentId === document?._id && evidence.action === "approved" &&
		document?.orgId === quote.orgId && document.documentType === "quote" && document.documentId === source._id
		? document : null;
	return {
		metadata: {
			revisionId: revision._id,
			reference: revision.terms.agreementReference,
			sourceQuoteId: source._id,
			seriesId: revision.seriesId,
			inherited: Boolean(quote.recurringInheritedAt) && !quote.recurringQuoteOverride,
			visitOverride: quote.recurringQuoteOverride === true,
			serviceDate: project?.startDate,
		},
		approvedDocument,
	};
}
