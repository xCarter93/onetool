export type QuoteForSigning = { _id: string; contentUpdatedAt?: number };

export type CachedQuoteDocument = {
	documentType: "quote" | "invoice";
	documentId: string;
	generatedAt: number;
	quoteSnapshotSource?: "server" | "workspace";
	quoteContentSnapshotId?: string;
	quoteContentSnapshot?: unknown;
};

/**
 * Offline signing needs a cached document proven current against the quote's
 * content (mirrors the backend's `quoteDocumentIsCurrent` belongs+freshness
 * check), AND bound to a server content snapshot — a legacy or workspace-
 * rendered PDF can't stand in for the live totals with no connection to refresh it.
 */
export function canSignOffline(
	quote: QuoteForSigning,
	document: CachedQuoteDocument | null | undefined,
): boolean {
	if (!document) return false;
	if (document.documentType !== "quote" || document.documentId !== quote._id) return false;
	const hasSnapshot = Boolean(document.quoteContentSnapshotId || document.quoteContentSnapshot);
	if (document.quoteSnapshotSource !== "server" || !hasSnapshot) return false;
	return document.generatedAt >= (quote.contentUpdatedAt ?? 0);
}
