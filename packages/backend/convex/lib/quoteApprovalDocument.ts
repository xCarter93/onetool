import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
	loadCurrentQuoteContentSnapshot,
	loadQuoteDocumentSnapshot,
	quoteContentSnapshotsEqual,
	type QuoteContentSnapshot,
} from "./quoteContentSnapshot";

type QuoteApprovalDocumentResult = {
	document: Doc<"documents">;
	shouldPin: boolean;
};

const PORTAL_DOCUMENT_CANDIDATE_LIMIT = 10;

function stale(latestDocumentId: Doc<"quotes">["latestDocumentId"]): never {
	throw new ConvexError({
		code: "QUOTE_VERSION_STALE",
		latestDocumentId: latestDocumentId ?? null,
	});
}

function belongsToQuote(
	document: Doc<"documents">,
	quote: Doc<"quotes">,
): boolean {
	return (
		document.orgId === quote.orgId &&
		document.documentType === "quote" &&
		document.documentId === quote._id
	);
}

// Recurring agreements only trust server renders that carry a bound snapshot.
export async function quoteDocumentIsCurrent(
	ctx: Pick<QueryCtx, "db">,
	document: Doc<"documents">,
	quote: Doc<"quotes">,
	currentContent: QuoteContentSnapshot,
): Promise<boolean> {
	if (!belongsToQuote(document, quote) || document.generatedAt < (quote.contentUpdatedAt ?? 0)) return false;
	const documentContent = await loadQuoteDocumentSnapshot(ctx, document);
	if (quote.recurringAgreementTerms && (document.quoteSnapshotSource !== "server" || !documentContent)) return false;
	return !documentContent || quoteContentSnapshotsEqual(documentContent, currentContent);
}

export async function selectPresentedQuoteDocument(
	ctx: QueryCtx,
	quote: Doc<"quotes">,
): Promise<Doc<"documents"> | null> {
	const pinned = quote.latestDocumentId
		? await ctx.db.get(quote.latestDocumentId)
		: null;
	const validPinned = pinned && belongsToQuote(pinned, quote) ? pinned : null;
	if (quote.status !== "sent" && validPinned) return validPinned;

	const currentContent = await loadCurrentQuoteContentSnapshot(ctx, quote._id);
	if (!currentContent) return null;
	const isCurrent = (document: Doc<"documents">) =>
		quoteDocumentIsCurrent(ctx, document, quote, currentContent);
	if (validPinned && (await isCurrent(validPinned))) return validPinned;

	const candidates = await ctx.db
		.query("documents")
		.withIndex("by_document_version", (q) =>
			q.eq("documentType", "quote").eq("documentId", quote._id),
		)
		.order("desc")
		.take(PORTAL_DOCUMENT_CANDIDATE_LIMIT);
	for (const candidate of candidates) {
		if (await isCurrent(candidate)) return candidate;
	}
	return null;
}

export async function resolveQuoteApprovalDocument(
	ctx: QueryCtx | MutationCtx,
	quote: Doc<"quotes">,
	expectedDocumentId: Doc<"documents">["_id"],
): Promise<QuoteApprovalDocumentResult> {
	const document = await ctx.db.get(expectedDocumentId);
	const currentContent = await loadCurrentQuoteContentSnapshot(ctx, quote._id);
	if (!document || !currentContent || !(await quoteDocumentIsCurrent(ctx, document, quote, currentContent)))
		return stale(quote.latestDocumentId);

	if (quote.latestDocumentId == null) {
		return { document, shouldPin: true };
	}
	if (quote.latestDocumentId === expectedDocumentId) {
		return { document, shouldPin: false };
	}

	// A stale pin (revert→edit→resend) yields to the current requested document.
	const pinned = await ctx.db.get(quote.latestDocumentId);
	if (!pinned || !belongsToQuote(pinned, quote) || (await quoteDocumentIsCurrent(ctx, pinned, quote, currentContent)))
		return stale(quote.latestDocumentId);
	return { document, shouldPin: true };
}
