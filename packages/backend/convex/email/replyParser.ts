/**
 * Server-side reply/quote stripper. Runs once on ingest over the text/plain body
 * (or de-tagged HTML) to derive the "visible" new content — the quoted original
 * and trailing signature removed. Client-agnostic (Gmail / Outlook / Apple /
 * generic), unlike the old render-time Gmail-DOM regex it replaces. Best-effort;
 * the full raw body is always retained separately for re-parse.
 */

// Lines that begin a quoted original / forwarded block. First hit ends the message.
const QUOTE_STARTERS: RegExp[] = [
	/^\s*>/, // a quoted line
	/^\s*-{2,}\s*Original Message\s*-{2,}/i, // Outlook "----- Original Message -----"
	/^\s*_{10,}\s*$/, // Outlook underscore divider above the quoted header block
	/^\s*From:\s.*(<[^>]+>|@).*$/i, // Outlook quoted-header block ("From: Name <addr>")
];

// Reply attribution ("On <date> <name> wrote:" and localized forms). Gmail wraps
// it across lines when the address is long, so the anchor and the verb are matched
// separately over a small look-ahead window. The anchor line must carry a digit
// (a date/time) to avoid cutting on prose that merely starts with "On".
const ATTRIBUTION_ANCHOR = /^\s*(On|Le|El|Am)\b/i;
const ATTRIBUTION_VERB = /\b(wrote|a\s+écrit|schrieb|escribió)\s*:/i;

// Gmail renders a bold signature name as "*Name*" on its own line in text/plain;
// treat it as a signature start when contact info follows.
const SIG_NAME = /^\s*\*[^*]+\*\s*$/;
const CONTACT_LINE = /^\s*(phone|tel|mobile|cell|fax|e-?mail)\b/i;

// Standard signature delimiter ("-- " on its own line).
const SIGNATURE_DELIMITER = /^\s*--\s*$/;

/**
 * Strip HTML to text: drop <style>/<script>, convert breaks to newlines, remove
 * tags, decode a few common entities, collapse whitespace. Used only as a
 * fallback when an inbound email has no text/plain part.
 */
export function htmlToText(html: string): string {
	return html
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
		.replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#0?39;|&apos;/gi, "'")
		.replace(/&amp;/gi, "&") // decode last to avoid double-unescaping
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/**
 * Extract the visible (new) portion of a reply from its plain-text body.
 * Everything from the first quote/forward marker or signature delimiter onward
 * is dropped.
 */
export function extractVisibleText(body: string): string {
	if (!body) return "";
	const lines = body.replace(/\r\n/g, "\n").split("\n");
	const kept: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (SIGNATURE_DELIMITER.test(line)) break;
		// Attribution line, which Gmail may wrap across up to ~3 lines.
		if (ATTRIBUTION_ANCHOR.test(line) && /\d/.test(line)) {
			const window = lines.slice(i, i + 3).join(" ");
			if (ATTRIBUTION_VERB.test(window)) break;
		}
		// Signature block: a bold-only name line with contact info just after it.
		if (
			SIG_NAME.test(line) &&
			lines.slice(i + 1, i + 4).some((l) => CONTACT_LINE.test(l))
		) {
			break;
		}
		if (QUOTE_STARTERS.some((re) => re.test(line))) break;
		kept.push(line);
	}
	return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Derive visibleText from an inbound message: prefer the text/plain part, fall
 * back to de-tagged HTML. Returns "" if neither yields content.
 */
export function deriveVisibleText(args: {
	text?: string | null;
	html?: string | null;
}): string {
	const source =
		args.text && args.text.trim().length > 0
			? args.text
			: args.html
				? htmlToText(args.html)
				: "";
	return extractVisibleText(source);
}
