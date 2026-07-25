/**
 * markdown-lite: a tiny, dependency-free markdown block/inline parser for the
 * mobile assistant chat. Pure function, no React — the renderer lives in
 * components/assistant/markdown-lite-view.tsx.
 *
 * Supported: headings (#/##/###), paragraphs, flat bullet/numbered lists
 * (no nesting), fenced code blocks (```lang), and inline bold/italic/
 * inline-code/links. Anything else passes through as plain paragraph text.
 */

export type InlineNode =
	| { type: "text"; text: string }
	| { type: "bold"; text: string }
	| { type: "italic"; text: string }
	| { type: "code"; text: string }
	| { type: "link"; text: string; href: string };

export type Block =
	| { type: "heading"; level: 1 | 2 | 3; inline: InlineNode[] }
	| { type: "paragraph"; inline: InlineNode[] }
	| { type: "list"; ordered: boolean; items: InlineNode[][] }
	| { type: "code"; language?: string; code: string };

const INLINE_RE =
	/`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;

/** Single-pass inline tokenizer — captured spans are not re-parsed (no nesting). */
export function parseInline(text: string): InlineNode[] {
	const nodes: InlineNode[] = [];
	let lastIndex = 0;
	// Reset lastIndex since INLINE_RE is a shared module-level regex with /g.
	INLINE_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = INLINE_RE.exec(text))) {
		if (m.index > lastIndex) {
			nodes.push({ type: "text", text: text.slice(lastIndex, m.index) });
		}
		if (m[1] !== undefined) nodes.push({ type: "code", text: m[1] });
		else if (m[2] !== undefined) nodes.push({ type: "link", text: m[2], href: m[3] });
		else if (m[4] !== undefined) nodes.push({ type: "bold", text: m[4] });
		else if (m[5] !== undefined) nodes.push({ type: "bold", text: m[5] });
		else if (m[6] !== undefined) nodes.push({ type: "italic", text: m[6] });
		else if (m[7] !== undefined) nodes.push({ type: "italic", text: m[7] });
		lastIndex = INLINE_RE.lastIndex;
	}
	if (lastIndex < text.length) {
		nodes.push({ type: "text", text: text.slice(lastIndex) });
	}
	if (nodes.length === 0) nodes.push({ type: "text", text: "" });
	return nodes;
}

const FENCE_RE = /^```(\S*)\s*$/;
const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const BULLET_RE = /^\s*[-*]\s+(.*)$/;
const NUMBERED_RE = /^\s*\d+[.)]\s+(.*)$/;

export function parseMarkdownLite(input: string): Block[] {
	const lines = input.replace(/\r\n/g, "\n").split("\n");
	const blocks: Block[] = [];
	let paragraphBuf: string[] = [];

	const flushParagraph = () => {
		if (paragraphBuf.length === 0) return;
		const text = paragraphBuf.join(" ").trim();
		paragraphBuf = [];
		if (text) blocks.push({ type: "paragraph", inline: parseInline(text) });
	};

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];

		const fenceMatch = FENCE_RE.exec(line.trim());
		if (fenceMatch) {
			flushParagraph();
			const language = fenceMatch[1] || undefined;
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && lines[i].trim() !== "```") {
				codeLines.push(lines[i]);
				i++;
			}
			if (i < lines.length) i++; // consume closing fence, if any
			blocks.push({ type: "code", language, code: codeLines.join("\n") });
			continue;
		}

		const headingMatch = HEADING_RE.exec(line);
		if (headingMatch) {
			flushParagraph();
			blocks.push({
				type: "heading",
				level: headingMatch[1].length as 1 | 2 | 3,
				inline: parseInline(headingMatch[2].trim()),
			});
			i++;
			continue;
		}

		if (BULLET_RE.test(line) || NUMBERED_RE.test(line)) {
			flushParagraph();
			const ordered = !BULLET_RE.test(line);
			const items: InlineNode[][] = [];
			while (i < lines.length) {
				const l = lines[i];
				const bullet = BULLET_RE.exec(l);
				const numbered = NUMBERED_RE.exec(l);
				if (ordered && numbered) {
					items.push(parseInline(numbered[1].trim()));
					i++;
				} else if (!ordered && bullet) {
					items.push(parseInline(bullet[1].trim()));
					i++;
				} else {
					break;
				}
			}
			blocks.push({ type: "list", ordered, items });
			continue;
		}

		if (line.trim() === "") {
			flushParagraph();
			i++;
			continue;
		}

		paragraphBuf.push(line.trim());
		i++;
	}
	flushParagraph();
	return blocks;
}
