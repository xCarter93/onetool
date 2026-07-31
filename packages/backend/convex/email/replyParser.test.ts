import { describe, it, expect } from "vitest";
import {
	extractVisibleText,
	deriveVisibleText,
	htmlToText,
	stripTagBlocks,
} from "./replyParser";

describe("extractVisibleText", () => {
	it("keeps only the new content above a Gmail 'On … wrote:' quote", () => {
		const body = [
			"Thanks, that works for me.",
			"",
			"On Wed, Jul 8, 2026 at 1:15 PM Patrick Carter <p@x.com> wrote:",
			"> Here is the original message",
			"> second quoted line",
		].join("\n");
		expect(extractVisibleText(body)).toBe("Thanks, that works for me.");
	});

	it("strips a Gmail attribution that wraps across lines (long address)", () => {
		// Reproduces the real leak: Gmail splits "On … <\n<addr>> wrote:".
		const body = [
			"Thanks!",
			"",
			"On Wed, Jul 8, 2026 at 3:13 PM Patrick Carter <",
			"org-3f7ee08e@inbound.onetool.biz> wrote:",
			"",
			"> quoted original",
		].join("\n");
		expect(extractVisibleText(body)).toBe("Thanks!");
	});

	it("strips a Gmail bold-name signature block (no '-- ' delimiter)", () => {
		const body = [
			"Reply Reply Reply",
			"",
			"Thank you for your service.",
			"",
			"*Patrick Carter*",
			"Phone: (617) 217-1785",
			"Email: xCarter93@gmail.com",
		].join("\n");
		expect(extractVisibleText(body)).toBe(
			"Reply Reply Reply\n\nThank you for your service."
		);
	});

	it("strips a leading '>' quoted block", () => {
		const body = ["Sounds good.", "", "> quoted original"].join("\n");
		expect(extractVisibleText(body)).toBe("Sounds good.");
	});

	it("strips an Outlook 'From:/Sent:' header block", () => {
		const body = [
			"Approved — go ahead.",
			"",
			"From: Patrick Carter <p@x.com>",
			"Sent: Wednesday, July 8, 2026 1:15 PM",
			"To: Someone",
			"Subject: Test",
			"",
			"Original body here",
		].join("\n");
		expect(extractVisibleText(body)).toBe("Approved — go ahead.");
	});

	it("strips an '----- Original Message -----' divider", () => {
		const body = [
			"See below.",
			"",
			"----- Original Message -----",
			"old content",
		].join("\n");
		expect(extractVisibleText(body)).toBe("See below.");
	});

	it("stops at a '-- ' signature delimiter", () => {
		const body = ["Here is my reply.", "", "-- ", "John Doe", "Acme Co"].join(
			"\n"
		);
		expect(extractVisibleText(body)).toBe("Here is my reply.");
	});

	it("keeps a multi-line reply intact when there is no quote", () => {
		const body = "Line one\n\nLine two";
		expect(extractVisibleText(body)).toBe("Line one\n\nLine two");
	});

	it("returns empty string for empty input", () => {
		expect(extractVisibleText("")).toBe("");
	});
});

describe("htmlToText", () => {
	it("strips tags and converts block/br to newlines", () => {
		const html = "<p>Hello</p><div>World</div>Again";
		expect(htmlToText(html)).toBe("Hello\nWorld\nAgain");
	});

	it("decodes &amp; last so double-escaped entities stay literal", () => {
		// "&amp;lt;" must render as the literal text "&lt;", not an active "<".
		expect(htmlToText("a &amp;lt; b")).toBe("a &lt; b");
	});

	it("drops <style>/<script> blocks", () => {
		const html = "<style>.x{color:red}</style><p>Body</p><script>x()</script>";
		expect(htmlToText(html)).toBe("Body");
	});
});

describe("deriveVisibleText", () => {
	it("prefers the text/plain part and strips its quote", () => {
		const result = deriveVisibleText({
			text: "New reply.\n\nOn Wed, Jul 8 at 1:15 PM x wrote:\n> old",
			html: "<div>ignored</div>",
		});
		expect(result).toBe("New reply.");
	});

	it("falls back to de-tagged HTML when there is no text part", () => {
		const result = deriveVisibleText({
			text: "",
			html: "<p>Only HTML here</p>",
		});
		expect(result).toBe("Only HTML here");
	});

	it("returns empty string when neither part has content", () => {
		expect(deriveVisibleText({ text: null, html: null })).toBe("");
	});
});

// SEC-12: inbound bodies are attacker-controlled and parsed before any recipient
// or org resolution. Each payload below pinned a worker for seconds against the
// previous patterns (measured: 600 ms at 20 KB, 15 s at 100 KB); the budget here
// is deliberately loose so it fails only on a genuine super-linear regression.
describe("ReDoS resistance", () => {
	const BUDGET_MS = 500;

	function elapsed(fn: () => void): number {
		const start = performance.now();
		fn();
		return performance.now() - start;
	}

	it("does not backtrack on a From: line of unclosed angle brackets", () => {
		const body = "hello\n" + "From: " + "<".repeat(50_000);
		expect(elapsed(() => extractVisibleText(body))).toBeLessThan(BUDGET_MS);
	});

	it("does not backtrack stripping tags from unclosed angle brackets", () => {
		const html = "<".repeat(200_000);
		expect(elapsed(() => htmlToText(html))).toBeLessThan(BUDGET_MS);
	});

	it("does not backtrack on a run of unclosed <style tags", () => {
		const html = "<style".repeat(30_000);
		expect(elapsed(() => htmlToText(html))).toBeLessThan(BUDGET_MS);
	});

	// The payload that matters: *valid* opens with no close. The variant above
	// omits ">", so the open never matches and the body scan never engages —
	// it passed against the quadratic implementation.
	it("does not backtrack on valid <style> opens that are never closed", () => {
		const html = "<style>".repeat(40_000);
		expect(elapsed(() => htmlToText(html))).toBeLessThan(BUDGET_MS);
	});

	it("does not backtrack on valid <script> opens that are never closed", () => {
		const html = "<script>".repeat(40_000);
		expect(elapsed(() => htmlToText(html))).toBeLessThan(BUDGET_MS);
	});

	it("still removes style and script blocks, including across newlines", () => {
		const html =
			"<p>keep</p><style>\n.a { color: red }\n</style>" +
			"<SCRIPT type='text/javascript'>alert(1)</SCRIPT><p>also keep</p>";
		const text = htmlToText(html);
		expect(text).toContain("keep");
		expect(text).toContain("also keep");
		expect(text).not.toContain("color: red");
		expect(text).not.toContain("alert(1)");
	});

	// Unclosed open: the block is left alone and its text falls through the tag
	// stripper. Matches what the previous regex did (it could not match either).
	it("leaves the remainder intact when a block open is never closed", () => {
		expect(htmlToText("<p>before</p><style>.a{}")).toBe("before\n.a{}");
	});

	it("still strips a normal quoted From: header block", () => {
		const body = [
			"Sounds good.",
			"",
			"From: Patrick Carter <p@x.com>",
			"Sent: Wednesday",
			"quoted original",
		].join("\n");
		expect(extractVisibleText(body)).toBe("Sounds good.");
	});

	it("keeps an over-long line rather than treating it as a marker", () => {
		const long = "x".repeat(2000);
		expect(extractVisibleText(`first\n${long}\nlast`)).toBe(
			`first\n${long}\nlast`
		);
	});
});

describe("stripTagBlocks", () => {
	it("removes the block cleanly despite length-changing uppercase before it", () => {
		// U+0130 (İ) lowercases to two code units, so a naive input.toLowerCase()
		// desyncs the scan indices from the input.slice below — leaking the block
		// interior and truncating the tail. İ is ordinary Turkish-locale content.
		const input = "İİİ<script>alert(1)</script>TAIL";
		const out = stripTagBlocks(input, "script");
		expect(out).toBe("İİİTAIL");
		expect(out).not.toContain("alert(1)");
	});

	it("matches the tag name case-insensitively", () => {
		expect(stripTagBlocks("a<STYLE>x</STYLE>b", "style")).toBe("ab");
	});
});
