import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { loadCurrentQuoteContentSnapshot, loadQuoteDocumentSnapshot, quoteContentSnapshotsEqual } from "./quoteContentSnapshot";

type Decision = {
	quote: Doc<"quotes">;
	document: Doc<"documents">;
	action: "approved" | "declined";
	decidedAt: number;
} & (
	| { channel: "portal" | "in_person"; quoteApprovalId: Id<"quoteApprovals"> }
	| { channel: "boldsign"; boldsignDocumentId: string }
);

export async function recordQuoteDecision(ctx: MutationCtx, args: Decision) {
	const { quote, document } = args;
	if (document.orgId !== quote.orgId || document.documentType !== "quote" || document.documentId !== quote._id)
		throw new ConvexError("Approval document does not belong to this quote");
	const vendor = args.channel === "boldsign";
	const decisionKey = vendor
		? `boldsign:${args.boldsignDocumentId}:${args.action}`
		: `audit:${args.quoteApprovalId}`;
	if (vendor && document.boldsignDocumentId !== args.boldsignDocumentId)
		throw new ConvexError("Approval request does not match this document");
	if (!vendor) {
		const audit = await ctx.db.get(args.quoteApprovalId);
		if (!audit || audit.orgId !== quote.orgId || audit.quoteId !== quote._id || audit.documentId !== document._id || audit.action !== args.action ||
			(audit.channel === "in_person" ? "in_person" : "portal") !== args.channel)
			throw new ConvexError("Approval audit does not match this decision");
	}
	const existing = await ctx.db.query("quoteDecisionEvidence")
		.withIndex("by_org_decision_key", (q) => q.eq("orgId", quote.orgId).eq("decisionKey", decisionKey)).unique();
	if (existing) {
		if (existing.quoteId !== quote._id || existing.documentId !== document._id)
			throw new ConvexError("Approval decision identity is already in use");
		return { evidenceId: existing._id, created: false };
	}
	const documentSnapshot = await loadQuoteDocumentSnapshot(ctx, document);
	const current = vendor ? null : await loadCurrentQuoteContentSnapshot(ctx, quote._id);
	if (!vendor && documentSnapshot && (!current || !quoteContentSnapshotsEqual(documentSnapshot, current)))
		throw new ConvexError({ code: "QUOTE_VERSION_STALE", latestDocumentId: quote.latestDocumentId ?? null });
	// A legacy vendor PDF cannot be reconstructed from the quote at callback time.
	const contentSnapshot = documentSnapshot ?? current ?? undefined;
	const evidenceId = await ctx.db.insert("quoteDecisionEvidence", {
		orgId: quote.orgId,
		quoteId: quote._id,
		clientId: contentSnapshot?.clientId ?? quote.clientId,
		documentId: document._id,
		documentVersion: document.version,
		decisionKey,
		action: args.action,
		channel: args.channel,
		quoteApprovalId: vendor ? undefined : args.quoteApprovalId,
		boldsignDocumentId: vendor ? args.boldsignDocumentId : undefined,
		snapshotSource: documentSnapshot ? document.quoteSnapshotSource : undefined,
		contentBinding: documentSnapshot ? "rendered_document" : current ? "decision_time" : "unavailable",
		contentSnapshot,
		decidedAt: args.decidedAt,
		recordedAt: Date.now(),
	});
	return { evidenceId, created: true };
}

export async function assertQuoteDocumentMutable(
	ctx: Pick<QueryCtx, "db">,
	document: Doc<"documents">,
	operation: "update" | "remove"
) {
	if (document.documentType !== "quote") return;
	const evidence = await ctx.db.query("quoteDecisionEvidence")
		.withIndex("by_document", (q) => q.eq("documentId", document._id)).first();
	const approval = await ctx.db.query("quoteApprovals")
		.withIndex("by_document", (q) => q.eq("documentId", document._id)).first();
	if (evidence || document.boldsign || approval || (operation === "update" && (document.quoteContentSnapshotId || document.quoteContentSnapshot)))
		throw new ConvexError("Keep this quote document for its content and approval history. Generate a new version instead.");
}
