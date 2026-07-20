/**
 * Shared presentation logic for a document's BoldSign state, so the quote
 * detail Signatures tab and the quote list status card can't drift apart on
 * what a draft is called or which timestamp it shows.
 */

export interface SignatureDisplaySource {
	generatedAt: number;
	boldsign: {
		status: string;
		sentAt?: number;
		viewedAt?: number;
		signedAt?: number;
		completedAt?: number;
		declinedAt?: number;
		revokedAt?: number;
		expiredAt?: number;
		draftSavedAt?: number;
	};
}

export interface SignatureDisplay {
	isDraft: boolean;
	/** Most recent meaningful event time; see the fallback order below. */
	lastUpdate: number;
	formattedDate: string;
	/** Badge/summary text — a draft says so rather than just "Draft". */
	statusLabel: string;
	/** Prefix for the timestamp, e.g. "Saved: Jul 20, 09:14". */
	timestampLabel: string;
	/** Recipients haven't been emailed yet while the doc is a draft. */
	recipientLabel: string;
}

export function getSignatureDisplay(
	doc: SignatureDisplaySource
): SignatureDisplay {
	const { boldsign } = doc;
	const isDraft = boldsign.status === "Draft";

	// A draft has no signature events, so without draftSavedAt this falls back
	// to the PDF's generatedAt — which can be weeks older than the draft.
	const lastUpdate =
		boldsign.completedAt ||
		boldsign.declinedAt ||
		boldsign.revokedAt ||
		boldsign.expiredAt ||
		boldsign.signedAt ||
		boldsign.viewedAt ||
		boldsign.sentAt ||
		boldsign.draftSavedAt ||
		doc.generatedAt;

	return {
		isDraft,
		lastUpdate,
		formattedDate: new Date(lastUpdate).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		}),
		statusLabel: isDraft ? "Draft, not sent" : boldsign.status,
		timestampLabel: isDraft ? "Saved" : "Last updated",
		recipientLabel: isDraft ? "Will be sent to:" : "Sent to:",
	};
}
