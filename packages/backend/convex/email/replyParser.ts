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
	/^\s*On\b.*\bwrote:\s*$/i, // Gmail / Apple "On <date> <name> wrote:"
	/^\s*-{2,}\s*Original Message\s*-{2,}/i, // Outlook "----- Original Message -----"
	/^\s*_{10,}\s*$/, // Outlook underscore divider above the quoted header block
	/^\s*From:\s.*(<[^>]+>|@).*$/i, // Outlook quoted-header block ("From: Name <addr>")
	/^\s*Le\b.*\ba\s+écrit\s*:\s*$/i, // fr "Le <date>, <name> a écrit :"
	/^\s*Am\b.*\bschrieb\b.*:\s*$/i, // de "Am <date> schrieb <name>:"
	/^\s*El\b.*\bescribió:\s*$/i, // es "El <date>, <name> escribió:"
];

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
	for (const line of lines) {
		if (SIGNATURE_DELIMITER.test(line)) break;
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
