import { describe, expect, it } from "vitest";
import { parseMarkdownLite } from "@/lib/markdown-lite";

describe("parseMarkdownLite", () => {
	it("passes plain text through as a single paragraph", () => {
		const blocks = parseMarkdownLite("Just a plain sentence with no markup.");
		expect(blocks).toEqual([
			{
				type: "paragraph",
				inline: [{ type: "text", text: "Just a plain sentence with no markup." }],
			},
		]);
	});

	it("parses headings at all three levels", () => {
		const blocks = parseMarkdownLite("# Title\n\n## Subtitle\n\n### Small");
		expect(blocks).toEqual([
			{ type: "heading", level: 1, inline: [{ type: "text", text: "Title" }] },
			{ type: "heading", level: 2, inline: [{ type: "text", text: "Subtitle" }] },
			{ type: "heading", level: 3, inline: [{ type: "text", text: "Small" }] },
		]);
	});

	it("parses a flat bullet list without nesting", () => {
		const blocks = parseMarkdownLite("- First\n- Second\n- Third");
		expect(blocks).toEqual([
			{
				type: "list",
				ordered: false,
				items: [
					[{ type: "text", text: "First" }],
					[{ type: "text", text: "Second" }],
					[{ type: "text", text: "Third" }],
				],
			},
		]);
	});

	it("parses a flat numbered list without nesting", () => {
		const blocks = parseMarkdownLite("1. One\n2. Two\n3. Three");
		expect(blocks).toEqual([
			{
				type: "list",
				ordered: true,
				items: [
					[{ type: "text", text: "One" }],
					[{ type: "text", text: "Two" }],
					[{ type: "text", text: "Three" }],
				],
			},
		]);
	});

	it("does not merge indented sub-bullets into a nested structure", () => {
		const blocks = parseMarkdownLite("- Top\n  - Indented\n- Bottom");
		expect(blocks).toEqual([
			{
				type: "list",
				ordered: false,
				items: [
					[{ type: "text", text: "Top" }],
					[{ type: "text", text: "Indented" }],
					[{ type: "text", text: "Bottom" }],
				],
			},
		]);
	});

	it("parses fenced code blocks with a language tag", () => {
		const blocks = parseMarkdownLite('```ts\nconst x = 1;\nconsole.log(x);\n```');
		expect(blocks).toEqual([
			{ type: "code", language: "ts", code: "const x = 1;\nconsole.log(x);" },
		]);
	});

	it("parses fenced code blocks with no language tag", () => {
		const blocks = parseMarkdownLite("```\nplain block\n```");
		expect(blocks).toEqual([{ type: "code", language: undefined, code: "plain block" }]);
	});

	it("handles an unterminated fence gracefully", () => {
		const blocks = parseMarkdownLite("```js\nlet x;");
		expect(blocks).toEqual([{ type: "code", language: "js", code: "let x;" }]);
	});

	it("parses combined inline bold, italic, code, and link in one paragraph", () => {
		const blocks = parseMarkdownLite(
			"This is **bold**, this is *italic*, this is `code`, and this is [a link](https://example.com)."
		);
		expect(blocks).toEqual([
			{
				type: "paragraph",
				inline: [
					{ type: "text", text: "This is " },
					{ type: "bold", text: "bold" },
					{ type: "text", text: ", this is " },
					{ type: "italic", text: "italic" },
					{ type: "text", text: ", this is " },
					{ type: "code", text: "code" },
					{ type: "text", text: ", and this is " },
					{ type: "link", text: "a link", href: "https://example.com" },
					{ type: "text", text: "." },
				],
			},
		]);
	});

	it("supports underscore-delimited bold and italic", () => {
		const blocks = parseMarkdownLite("__strong__ and _emph_");
		expect(blocks).toEqual([
			{
				type: "paragraph",
				inline: [
					{ type: "bold", text: "strong" },
					{ type: "text", text: " and " },
					{ type: "italic", text: "emph" },
				],
			},
		]);
	});

	it("separates multiple paragraphs on blank lines", () => {
		const blocks = parseMarkdownLite("First paragraph.\n\nSecond paragraph.");
		expect(blocks).toEqual([
			{ type: "paragraph", inline: [{ type: "text", text: "First paragraph." }] },
			{ type: "paragraph", inline: [{ type: "text", text: "Second paragraph." }] },
		]);
	});

	it("joins wrapped lines within a single paragraph with a space", () => {
		const blocks = parseMarkdownLite("Line one\nLine two continues");
		expect(blocks).toEqual([
			{
				type: "paragraph",
				inline: [{ type: "text", text: "Line one Line two continues" }],
			},
		]);
	});

	it("returns an empty array for empty input", () => {
		expect(parseMarkdownLite("")).toEqual([]);
	});
});
