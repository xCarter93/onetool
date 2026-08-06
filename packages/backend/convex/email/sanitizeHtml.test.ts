import { describe, it, expect } from "vitest";
import {
	sanitizeHtml,
	htmlToPlainText,
	EMAIL_BODY_STYLES,
} from "./sanitizeHtml";

/** Attributes forced onto every kept link. */
const LINK_ATTRS = ` target="_blank" rel="noopener noreferrer nofollow"`;

/**
 * Allowlist sanitizer for TipTap composer output. Runs in the default Convex
 * runtime, so these are pure-function tests — no convex-test harness.
 */
describe("sanitizeHtml", () => {
	describe("allowlisted markup", () => {
		it("keeps the supported inline and block tags", () => {
			const input =
				"<p>Hello <strong>bold</strong> <b>b</b> <em>em</em> <i>i</i> <u>u</u></p>";
			expect(sanitizeHtml(input)).toBe(input);
		});

		it("keeps lists and blockquotes", () => {
			const input =
				"<ul><li>one</li><li>two</li></ul><ol><li>a</li></ol><blockquote><p>q</p></blockquote>";
			expect(sanitizeHtml(input)).toBe(input);
		});

		it("normalizes <br> to a self-closed void tag", () => {
			expect(sanitizeHtml("<p>a<br>b<br/>c</p>")).toBe(
				"<p>a<br />b<br />c</p>"
			);
		});

		it("is idempotent", () => {
			const input =
				'<p>Hi <a href="https://example.com">link</a></p><ul><li>x</li></ul>';
			const once = sanitizeHtml(input);
			expect(sanitizeHtml(once)).toBe(once);
		});

		it("forces target and rel on kept links", () => {
			expect(sanitizeHtml(`<a href="https://a.test">x</a>`)).toBe(
				`<a href="https://a.test"${LINK_ATTRS}>x</a>`
			);
		});

		it("returns empty string for empty input", () => {
			expect(sanitizeHtml("")).toBe("");
		});
	});

	describe("XSS vectors", () => {
		it("drops <script> along with its contents", () => {
			expect(sanitizeHtml("<p>a</p><script>alert(1)</script><p>b</p>")).toBe(
				"<p>a</p><p>b</p>"
			);
		});

		it("drops script contents even when the tag has attributes", () => {
			expect(
				sanitizeHtml('<script type="text/javascript">alert("x")</script>hi')
			).toBe("hi");
		});

		it("pins nested-script handling: skip ends at the first close tag", () => {
			expect(sanitizeHtml("<script><script>x</script>hi")).toBe("hi");
		});

		it("drops an unterminated <script> and everything after it", () => {
			expect(sanitizeHtml("<p>ok</p><script>alert(1)")).toBe("<p>ok</p>");
		});

		it("strips event handler attributes", () => {
			expect(
				sanitizeHtml(`<p onclick="alert(1)" onmouseover='steal()'>hi</p>`)
			).toBe("<p>hi</p>");
		});

		it("strips style and class attributes", () => {
			expect(
				sanitizeHtml(
					`<p style="background:url(javascript:alert(1))" class="x" id="y">hi</p>`
				)
			).toBe("<p>hi</p>");
		});

		it("drops javascript: hrefs but keeps the link text", () => {
			expect(sanitizeHtml(`<a href="javascript:alert(1)">click</a>`)).toBe(
				"<a>click</a>"
			);
			expect(sanitizeHtml(`<a href="JaVaScRiPt:alert(1)">click</a>`)).toBe(
				"<a>click</a>"
			);
		});

		it("drops entity-obfuscated javascript: hrefs", () => {
			expect(
				sanitizeHtml(`<a href="java&#115;cript:alert(1)">click</a>`)
			).toBe("<a>click</a>");
		});

		it("drops javascript: hrefs padded with control characters", () => {
			expect(sanitizeHtml(`<a href="java\tscript:alert(1)">c</a>`)).toBe(
				"<a>c</a>"
			);
			expect(sanitizeHtml(`<a href=" javascript:alert(1)">c</a>`)).toBe(
				"<a>c</a>"
			);
		});

		it("drops data:, vbscript: and protocol-relative hrefs", () => {
			expect(
				sanitizeHtml(`<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>`)
			).toBe("<a>x</a>");
			expect(sanitizeHtml(`<a href="vbscript:msgbox(1)">x</a>`)).toBe(
				"<a>x</a>"
			);
			expect(sanitizeHtml(`<a href="//evil.com">x</a>`)).toBe("<a>x</a>");
			expect(sanitizeHtml(`<a href="/relative/path">x</a>`)).toBe("<a>x</a>");
		});

		it("keeps http, https, mailto and tel hrefs", () => {
			expect(sanitizeHtml(`<a href="https://a.test/p?q=1">x</a>`)).toBe(
				`<a href="https://a.test/p?q=1"${LINK_ATTRS}>x</a>`
			);
			expect(sanitizeHtml(`<a href="http://a.test">x</a>`)).toBe(
				`<a href="http://a.test"${LINK_ATTRS}>x</a>`
			);
			expect(sanitizeHtml(`<a href="mailto:a@b.test">x</a>`)).toBe(
				`<a href="mailto:a@b.test"${LINK_ATTRS}>x</a>`
			);
			expect(sanitizeHtml(`<a href="tel:+15551234567">x</a>`)).toBe(
				`<a href="tel:+15551234567"${LINK_ATTRS}>x</a>`
			);
		});

		it("drops every non-href attribute on anchors, forcing its own target/rel", () => {
			expect(
				sanitizeHtml(
					`<a href="https://a.test" target="_top" rel="opener" onclick="x()" download>x</a>`
				)
			).toBe(`<a href="https://a.test"${LINK_ATTRS}>x</a>`);
		});

		it("escapes quotes and angle brackets inside href values", () => {
			expect(sanitizeHtml(`<a href='https://a.test/"><script>'>x</a>`)).toBe(
				`<a href="https://a.test/&quot;&gt;&lt;script&gt;"${LINK_ATTRS}>x</a>`
			);
		});

		it("strips img, iframe and svg payloads", () => {
			expect(sanitizeHtml(`<img src=x onerror="alert(1)">hi`)).toBe("hi");
			expect(
				sanitizeHtml(`<iframe src="javascript:alert(1)"></iframe>hi`)
			).toBe("hi");
			expect(
				sanitizeHtml(`<svg><script>alert(1)</script></svg>after`)
			).toBe("after");
			expect(sanitizeHtml(`<object data="x"></object>hi`)).toBe("hi");
			expect(sanitizeHtml(`<style>body{display:none}</style>hi`)).toBe("hi");
		});

		it("drops comments, doctypes and processing instructions", () => {
			expect(
				sanitizeHtml(`<!DOCTYPE html><!-- <script>x</script> --><p>hi</p>`)
			).toBe("<p>hi</p>");
			expect(sanitizeHtml(`<?php echo "x"; ?><p>hi</p>`)).toBe("<p>hi</p>");
		});
	});

	describe("unknown tags and malformed markup", () => {
		it("unwraps unknown-but-harmless tags, keeping their text", () => {
			expect(sanitizeHtml("<div><span>hi</span></div>")).toBe("hi");
			expect(sanitizeHtml("<h1>Title</h1>")).toBe("Title");
			expect(sanitizeHtml("<table><tr><td>cell</td></tr></table>")).toBe(
				"cell"
			);
		});

		it("closes unbalanced tags", () => {
			expect(sanitizeHtml("<p>a<strong>b</p>")).toBe(
				"<p>a<strong>b</strong></p>"
			);
			expect(sanitizeHtml("<ul><li>a")).toBe("<ul><li>a</li></ul>");
		});

		it("drops stray closing tags", () => {
			expect(sanitizeHtml("a</p>b")).toBe("ab");
			expect(sanitizeHtml("</strong>x")).toBe("x");
		});

		it("neutralizes an unterminated tag as text", () => {
			expect(sanitizeHtml("<p>a</p><script")).toBe("<p>a</p>&lt;script");
			expect(sanitizeHtml("1 < 2")).toBe("1 &lt; 2");
		});

		it("escapes bare angle brackets and ampersands in text", () => {
			expect(sanitizeHtml("<p>5 < 6 & 7 > 3</p>")).toBe(
				"<p>5 &lt; 6 &amp; 7 &gt; 3</p>"
			);
		});

		it("does not double-escape existing entities", () => {
			expect(sanitizeHtml("<p>A &amp; B &#39;q&#39; &nbsp;</p>")).toBe(
				"<p>A &amp; B &#39;q&#39; &nbsp;</p>"
			);
		});

		it("handles deeply nested mismatched tags without throwing", () => {
			const input = "<p><em><strong>x</em></strong></p>";
			expect(() => sanitizeHtml(input)).not.toThrow();
			expect(sanitizeHtml(input)).toBe("<p><em><strong>x</strong></em></p>");
		});

		it("survives a pathological soup of broken markup", () => {
			const input =
				`<<p>>x<a href=<script>>y</a><<//p>><img<<>><p onclick=alert(1)>z`;
			const out = sanitizeHtml(input);
			expect(out).not.toContain("<script");
			expect(out).not.toContain("onclick");
			expect(out).toContain("z");
		});
	});

	describe("styles option", () => {
		it("injects the configured inline style per tag", () => {
			const out = sanitizeHtml(
				`<p>hi</p><ul><li>x</li></ul><a href="https://a.test">l</a>`,
				{ styles: EMAIL_BODY_STYLES }
			);
			expect(out).toContain(`<p style="${EMAIL_BODY_STYLES.p}">`);
			expect(out).toContain(`<li style="${EMAIL_BODY_STYLES.li}">`);
			expect(out).toContain(
				`<a href="https://a.test"${LINK_ATTRS} style="${EMAIL_BODY_STYLES.a}">`
			);
		});

		it("never lets an author-supplied style survive alongside the injected one", () => {
			const out = sanitizeHtml(`<p style="color:red">hi</p>`, {
				styles: EMAIL_BODY_STYLES,
			});
			expect(out).toBe(`<p style="${EMAIL_BODY_STYLES.p}">hi</p>`);
		});
	});
});

describe("htmlToPlainText", () => {
	it("turns paragraphs and <br> into line breaks", () => {
		expect(htmlToPlainText("<p>one</p><p>two<br>three</p>")).toBe(
			"one\n\ntwo\nthree"
		);
	});

	it("breaks lines for list items and blockquotes", () => {
		expect(
			htmlToPlainText("<ul><li>a</li><li>b</li></ul><blockquote>q</blockquote>")
		).toBe("a\nb\n\nq");
	});

	it("decodes entities", () => {
		expect(htmlToPlainText("<p>A &amp; B &lt;c&gt; &#39;d&#39;</p>")).toBe(
			"A & B <c> 'd'"
		);
	});

	it("drops script/style contents", () => {
		expect(htmlToPlainText("<p>a</p><script>alert(1)</script>")).toBe("a");
		expect(htmlToPlainText("<style>p{color:red}</style><p>b</p>")).toBe("b");
	});

	it("collapses blank-line runs and trims", () => {
		expect(htmlToPlainText("<p></p><p>a</p><p></p><p></p><p>b</p><p></p>")).toBe(
			"a\n\nb"
		);
	});

	it("separates adjacent table cells", () => {
		expect(
			htmlToPlainText("<table><tr><td>a</td><td>b</td></tr><tr><th>c</th></tr></table>")
		).toBe("a\nb\nc");
	});

	it("keeps inline formatting inline", () => {
		expect(htmlToPlainText("<p>hi <strong>there</strong> friend</p>")).toBe(
			"hi there friend"
		);
	});

	it("returns empty string for empty input", () => {
		expect(htmlToPlainText("")).toBe("");
	});
});
