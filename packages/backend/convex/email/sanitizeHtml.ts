/**
 * Allowlist HTML sanitizer for rich-text composer output.
 *
 * Runs in the default Convex runtime (no DOM, no Node), so this is a
 * hand-rolled tokenizer rather than DOMPurify/jsdom. Pure functions — no ctx.
 *
 * Policy:
 *  - Allowed elements: p, br, strong, b, em, i, u, a, ul, ol, li, blockquote.
 *  - Allowed attributes: `href` on `a` (http/https/mailto/tel only). Everything
 *    else (style, class, on*, id, data-*, srcset, …) is dropped.
 *  - Disallowed-but-harmless elements are unwrapped (children kept as text).
 *  - Dangerous containers (script, style, iframe, svg, …) are dropped WITH
 *    their contents.
 *  - Malformed markup is escaped, unbalanced tags are repaired via a stack.
 *
 * The output is a well-formed fragment; sanitizing twice is a no-op, so
 * buildEmailHtml re-sanitizes as defense in depth.
 */

/** Elements kept in the output. */
const ALLOWED_TAGS = new Set([
	"p",
	"br",
	"strong",
	"b",
	"em",
	"i",
	"u",
	"a",
	"ul",
	"ol",
	"li",
	"blockquote",
]);

/** Allowed elements with no closing tag. */
const VOID_TAGS = new Set(["br"]);

/**
 * Elements whose *contents* are dropped along with the tag. Everything else
 * that isn't allowed is merely unwrapped, so `<div>hi</div>` keeps "hi".
 */
const DROP_WITH_CONTENT = new Set([
	"script",
	"style",
	"iframe",
	"frame",
	"frameset",
	"object",
	"embed",
	"applet",
	"svg",
	"math",
	"template",
	"noscript",
	"noembed",
	"title",
	"textarea",
	"xmp",
	"head",
	"canvas",
	"audio",
	"video",
	"map",
	"form",
	"select",
	"option",
]);

/** Elements separated by a blank line when flattened to plain text. */
const PARAGRAPH_TAGS = new Set([
	"p",
	"div",
	"blockquote",
	"ul",
	"ol",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"pre",
	"table",
	"section",
	"article",
	"header",
	"footer",
]);

/** Elements separated by a single line break when flattened to plain text. */
const LINE_TAGS = new Set(["li", "tr", "td", "th", "br"]);

const URL_SCHEME_ALLOWLIST = /^(?:https?|mailto|tel):/i;

/** Inline styles applied to composer output so it matches the email shell. */
export const EMAIL_BODY_STYLES: Readonly<Record<string, string>> = {
	p: "margin: 8px 0;",
	ul: "margin: 8px 0 8px 0; padding-left: 22px;",
	ol: "margin: 8px 0 8px 0; padding-left: 22px;",
	li: "margin: 4px 0; font-size: 15px; line-height: 1.7; color: #334155;",
	blockquote:
		"margin: 12px 0; padding: 2px 0 2px 14px; border-left: 3px solid #e2e8f0; color: #475569;",
	a: "color: #2563eb; text-decoration: underline;",
};

/** Matches a start/end tag, tolerating quoted attribute values containing `>`. */
const TAG_RE = /^<(\/?)([a-zA-Z][a-zA-Z0-9:_.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/;

const ATTR_RE =
	/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>=`]+)))?/g;

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	"#39": "'",
};

/**
 * Escape text content. Existing well-formed entities are preserved so that
 * already-escaped composer output isn't double-escaped.
 */
function escapeText(text: string): string {
	return text
		.replace(
			/&(?![a-zA-Z][a-zA-Z0-9]*;|#[0-9]+;|#[xX][0-9a-fA-F]+;)/g,
			"&amp;"
		)
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function escapeAttrValue(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** Decode the entity subset a composer can realistically emit. */
export function decodeEntities(text: string): string {
	return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e) => {
		const entity = String(e);
		if (entity[0] === "#") {
			const isHex = entity[1] === "x" || entity[1] === "X";
			const code = parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
			if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
			try {
				return String.fromCodePoint(code);
			} catch {
				return "";
			}
		}
		const named = NAMED_ENTITIES[entity.toLowerCase()];
		return named !== undefined ? named : m;
	});
}

/**
 * Resolve an `href`, returning null when the scheme isn't allowlisted.
 * Entities and control characters are stripped first so tricks like
 * `java&#115;cript:` or `java\tscript:` can't slip past.
 */
function sanitizeHref(raw: string): string | null {
	const decoded = decodeEntities(raw).replace(/[\u0000-\u0020\u007f]/g, "");
	if (decoded.length === 0) return null;
	if (!URL_SCHEME_ALLOWLIST.test(decoded)) return null;
	return decoded;
}

function parseAttributes(raw: string): Map<string, string> {
	const attrs = new Map<string, string>();
	ATTR_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = ATTR_RE.exec(raw)) !== null) {
		const name = m[1].toLowerCase();
		const value = m[2] ?? m[3] ?? m[4] ?? "";
		if (!attrs.has(name)) attrs.set(name, value);
	}
	return attrs;
}

/** Index just past the matching end tag for `name`, or html.length if absent. */
function skipElementContents(html: string, from: number, name: string): number {
	const closeRe = new RegExp(`</${name}(?:\\s[^>]*)?>`, "i");
	const rest = html.slice(from);
	const match = closeRe.exec(rest);
	return match ? from + match.index + match[0].length : html.length;
}

export interface SanitizeHtmlOptions {
	/** tag name -> inline `style` value injected on output (e.g. EMAIL_BODY_STYLES). */
	styles?: Readonly<Record<string, string>>;
}

/**
 * Sanitize composer HTML down to the allowlist above. Never throws; anything
 * unrecognized is escaped or dropped.
 */
export function sanitizeHtml(
	html: string,
	options: SanitizeHtmlOptions = {}
): string {
	if (!html) return "";
	const styles = options.styles ?? {};
	const out: string[] = [];
	const stack: string[] = [];
	let i = 0;

	const openTag = (name: string, extraAttrs: string): void => {
		const style = styles[name];
		const styleAttr = style ? ` style="${escapeAttrValue(style)}"` : "";
		out.push(`<${name}${extraAttrs}${styleAttr}>`);
	};

	while (i < html.length) {
		const lt = html.indexOf("<", i);
		if (lt === -1) {
			out.push(escapeText(html.slice(i)));
			break;
		}
		if (lt > i) out.push(escapeText(html.slice(i, lt)));

		// Comments, doctypes, CDATA and processing instructions: dropped whole.
		if (html.startsWith("<!--", lt)) {
			const end = html.indexOf("-->", lt + 4);
			i = end === -1 ? html.length : end + 3;
			continue;
		}
		if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
			const end = html.indexOf(">", lt);
			i = end === -1 ? html.length : end + 1;
			continue;
		}

		const match = TAG_RE.exec(html.slice(lt));
		if (!match) {
			// Stray or unterminated `<` — neutralize it as text.
			out.push("&lt;");
			i = lt + 1;
			continue;
		}

		const [full, slash, rawName, rawAttrs] = match;
		const name = rawName.toLowerCase();
		const isClose = slash === "/";
		const selfClosing = /\/\s*$/.test(rawAttrs);
		i = lt + full.length;

		if (DROP_WITH_CONTENT.has(name)) {
			if (!isClose && !selfClosing) i = skipElementContents(html, i, name);
			continue;
		}

		if (!ALLOWED_TAGS.has(name)) continue; // unwrap: keep children, drop tag

		if (isClose) {
			if (VOID_TAGS.has(name)) continue;
			const idx = stack.lastIndexOf(name);
			if (idx === -1) continue; // stray close tag
			for (let d = stack.length - 1; d >= idx; d--) out.push(`</${stack[d]}>`);
			stack.length = idx;
			continue;
		}

		if (VOID_TAGS.has(name)) {
			out.push(`<${name} />`);
			continue;
		}

		let extraAttrs = "";
		if (name === "a") {
			const href = sanitizeHref(parseAttributes(rawAttrs).get("href") ?? "");
			// target/rel are forced, not copied: links must open in a new tab
			// without leaking the referrer wherever the stored HTML is rendered.
			if (href) {
				extraAttrs = ` href="${escapeAttrValue(href)}" target="_blank" rel="noopener noreferrer nofollow"`;
			}
		}

		openTag(name, extraAttrs);
		if (selfClosing) {
			out.push(`</${name}>`);
		} else {
			stack.push(name);
		}
	}

	for (let d = stack.length - 1; d >= 0; d--) out.push(`</${stack[d]}>`);
	return out.join("");
}

/**
 * Flatten HTML to plain text for previews / the text-part fallback. Block
 * elements and `<br>` become line breaks; runs of blank lines collapse.
 */
export function htmlToPlainText(html: string): string {
	if (!html) return "";
	const out: string[] = [];
	// Break strength owed before the next chunk of text: 0 none, 1 line, 2 blank
	// line. Buffering (rather than emitting eagerly) keeps `</li><li>` at one
	// break instead of two.
	let pendingBreak = 0;
	let i = 0;

	const pushText = (raw: string): void => {
		const text = decodeEntities(raw);
		if (text.trim().length === 0 && (pendingBreak > 0 || out.length === 0)) {
			return;
		}
		if (pendingBreak > 0) {
			out.push("\n".repeat(pendingBreak));
			pendingBreak = 0;
		}
		out.push(text);
	};

	while (i < html.length) {
		const lt = html.indexOf("<", i);
		if (lt === -1) {
			pushText(html.slice(i));
			break;
		}
		if (lt > i) pushText(html.slice(i, lt));

		if (html.startsWith("<!--", lt)) {
			const end = html.indexOf("-->", lt + 4);
			i = end === -1 ? html.length : end + 3;
			continue;
		}
		if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
			const end = html.indexOf(">", lt);
			i = end === -1 ? html.length : end + 1;
			continue;
		}

		const match = TAG_RE.exec(html.slice(lt));
		if (!match) {
			pushText("<");
			i = lt + 1;
			continue;
		}

		const [full, slash, rawName, rawAttrs] = match;
		const name = rawName.toLowerCase();
		const isClose = slash === "/";
		i = lt + full.length;

		if (DROP_WITH_CONTENT.has(name)) {
			if (!isClose && !/\/\s*$/.test(rawAttrs)) {
				i = skipElementContents(html, i, name);
			}
			continue;
		}

		if (name === "br") {
			pendingBreak = Math.min(pendingBreak + 1, 2);
		} else if (LINE_TAGS.has(name)) {
			pendingBreak = Math.max(pendingBreak, 1);
		} else if (PARAGRAPH_TAGS.has(name)) {
			pendingBreak = Math.max(pendingBreak, 2);
		}
	}

	return out
		.join("")
		.replace(/\r\n?/g, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
