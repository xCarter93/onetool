/**
 * Server-side reply/quote stripper. Runs once on ingest over the text/plain body
 * (or de-tagged HTML) to derive the "visible" new content — the quoted original
 * and trailing signature removed. Client-agnostic (Gmail / Outlook / Apple /
 * generic), unlike the old render-time Gmail-DOM regex it replaces. Best-effort;
 * the full raw body is always retained separately for re-parse.
 */

// Lines that begin a quoted original / forwarded block. First hit ends the message.
// Predicates, not one regex each: the "From:" rule is two independent linear
// scans because expressing it as `From:\s.*(<[^>]+>|@).*$` backtracks
// catastrophically on a line of many "<" characters (600 ms at 20 KB).
const QUOTE_STARTERS: Array<(line: string) => boolean> = [
	(l) => /^\s*>/.test(l), // a quoted line
	(l) => /^\s*-{2,}\s*Original Message\s*-{2,}/i.test(l), // Outlook "----- Original Message -----"
	(l) => /^\s*_{10,}\s*$/.test(l), // Outlook underscore divider above the quoted header block
	// Outlook quoted-header block ("From: Name <addr>")
	(l) => /^\s*From:\s/i.test(l) && /<[^<>]+>|@/.test(l),
];

// RFC 5322 caps a line at 998 octets, so a longer one is never a real quote or
// signature marker. Unanchored marker scans are skipped past this bound (only
// the left-anchored checks run), so body length can't drive parser cost.
const MAX_MARKER_LINE = 998;

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
 * Remove `<tag ...> … </tag>` blocks by index scan rather than regex.
 *
 * The obvious `/<style[^>]*>[\s\S]*?<\/style>/gi` is quadratic on a run of
 * *valid* opens with no close — `"<style>".repeat(n)` matches the open at all n
 * positions and the lazy body scans to end-of-string each time (2.1 s at the
 * 256 KB inbound cap). Tempering the body class does not help; the cost is
 * n starts x O(n) scan. Each iteration here advances past the close it found,
 * so the whole walk is linear. An unclosed open leaves the remainder intact.
 */
export function stripTagBlocks(input: string, tag: string): string {
	const open = `<${tag}`;
	const close = `</${tag}>`;
	// ASCII-only, length-preserving fold. `input.toLowerCase()` is NOT
	// length-preserving (U+0130 lowercases to 2 code units), which would desync
	// haystack indices from the `input.slice` below and leak block interiors into
	// the output. The match targets (<style/<script) are ASCII, so folding A-Z is
	// sufficient and keeps every index aligned with `input`.
	const haystack = input.replace(/[A-Z]/g, (c) => c.toLowerCase());
	let out = "";
	let cursor = 0;
	for (;;) {
		const start = haystack.indexOf(open, cursor);
		if (start === -1) break;
		const openEnd = haystack.indexOf(">", start);
		if (openEnd === -1) break;
		const closeStart = haystack.indexOf(close, openEnd + 1);
		if (closeStart === -1) break;
		out += input.slice(cursor, start);
		cursor = closeStart + close.length;
	}
	return out + input.slice(cursor);
}

/**
 * Strip HTML to text: drop <style>/<script>, convert breaks to newlines, remove
 * tags, decode a few common entities, collapse whitespace. Used only as a
 * fallback when an inbound email has no text/plain part.
 */
export function htmlToText(html: string): string {
	// `[^<>]` rather than `[^>]` in the tag pattern: the latter is quadratic on
	// a run of unclosed "<" (15 s at 100 KB) because each failed match rescans.
	return stripTagBlocks(stripTagBlocks(html, "style"), "script")
		.replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^<>]*>/g, "")
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
		if (line.length > MAX_MARKER_LINE) {
			// Skip only the unanchored scans; the left-anchored checks are O(prefix)
			// and an over-length quoted line (e.g. unwrapped htmlToText output) must
			// still end the visible portion.
			if (SIGNATURE_DELIMITER.test(line) || /^\s*>/.test(line)) break;
			kept.push(line);
			continue;
		}
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
		if (QUOTE_STARTERS.some((isStarter) => isStarter(line))) break;
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
