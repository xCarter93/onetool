export type QuoteForSigning = {
	_id: string;
	contentUpdatedAt?: number;
	recurringAgreementTerms?: unknown;
};

export type CachedQuoteDocument = {
	documentType: "quote" | "invoice";
	documentId: string;
	generatedAt: number;
	quoteSnapshotSource?: "server" | "workspace";
	quoteContentSnapshotId?: string;
	quoteContentSnapshot?: unknown;
};

/** The document was rendered after the quote's last content change. */
export function isDocumentFresh(
	quote: QuoteForSigning,
	document: CachedQuoteDocument | null | undefined,
): document is CachedQuoteDocument {
	return (
		!!document &&
		document.documentType === "quote" &&
		document.documentId === quote._id &&
		document.generatedAt >= (quote.contentUpdatedAt ?? 0)
	);
}

/**
 * Offline signing needs a fresh cached document bound to a content snapshot,
 * mirroring the backend's `quoteDocumentIsCurrent`. Both server and workspace
 * snapshots are server-verified; recurring agreements accept only server renders.
 */
export function canSignOffline(
	quote: QuoteForSigning,
	document: CachedQuoteDocument | null | undefined,
): boolean {
	if (!isDocumentFresh(quote, document)) return false;
	if (!document.quoteContentSnapshotId && !document.quoteContentSnapshot) return false;
	if (quote.recurringAgreementTerms && document.quoteSnapshotSource !== "server") return false;
	return true;
}
