import { describe, it, expect } from "vitest";
import { extractVisibleText, deriveVisibleText, htmlToText } from "./replyParser";

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
			text: "New reply.\n\nOn Wed wrote:\n> old",
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
