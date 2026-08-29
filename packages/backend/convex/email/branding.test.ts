import { describe, it, expect } from "vitest";
import {
	buildEmailHtml,
	getOrgInitials,
	resolveFromEmail,
	resolveReplyToEmail,
} from "./branding";
import { EMAIL_BODY_STYLES, sanitizeHref } from "./sanitizeHtml";

const base = {
	organizationName: "Acme Cleaning",
	organizationEmail: "hi@acme.test",
	clientName: "Ada Lovelace",
	senderName: "Sender Person",
};

/** Extract the letter-body slot (the div between greeting and sign-off). */
function bodySlot(html: string): string {
	const open = html.indexOf(
		'<div style="font-size: 15px; line-height: 1.7; color: #334155;">'
	);
	expect(open).toBeGreaterThan(-1);
	const start = html.indexOf(">", open) + 1;
	const end = html.indexOf("</div>", start);
	return html.slice(start, end).trim();
}

describe("buildEmailHtml", () => {
	describe("plain-text path (regression)", () => {
		it("still renders one escaped <p> per line, with &nbsp; for blank lines", () => {
			const html = buildEmailHtml({
				...base,
				messageBody: "Hi there\n\nThanks",
			});
			expect(bodySlot(html)).toBe(
				'<p style="margin: 8px 0;">Hi there</p>' +
					'<p style="margin: 8px 0;">&nbsp;</p>' +
					'<p style="margin: 8px 0;">Thanks</p>'
			);
		});

		it("still escapes HTML in the plain-text body", () => {
			const html = buildEmailHtml({
				...base,
				messageBody: `<script>alert('x')</script> & / "q"`,
			});
			expect(bodySlot(html)).toBe(
				'<p style="margin: 8px 0;">&lt;script&gt;alert(&#039;x&#039;)&lt;&#x2F;script&gt;' +
					' &amp; &#x2F; &quot;q&quot;</p>'
			);
			expect(html).not.toContain("<script>");
		});

		it("is unchanged when messageHtml is undefined or empty", () => {
			const plain = buildEmailHtml({ ...base, messageBody: "Hello" });
			expect(buildEmailHtml({ ...base, messageBody: "Hello" })).toBe(plain);
			expect(
				buildEmailHtml({ ...base, messageBody: "Hello", messageHtml: "" })
			).toBe(plain);
			// html that sanitizes to nothing also falls back to the plain path
			expect(
				buildEmailHtml({
					...base,
					messageBody: "Hello",
					messageHtml: "<script>alert(1)</script>",
				})
			).toBe(plain);
		});

		it("keeps the surrounding shell intact", () => {
			const html = buildEmailHtml({ ...base, messageBody: "Hello" });
			expect(html).toContain("Hi Ada Lovelace,");
			expect(html).toContain("Best regards,");
			expect(html).toContain("Sender Person");
			expect(html).toContain("Powered by OneTool");
		});
	});

	describe("messageHtml variant", () => {
		it("replaces the plain-text pipeline with the rich body", () => {
			const html = buildEmailHtml({
				...base,
				messageBody: "Hello there\none",
				messageHtml:
					"<p>Hello <strong>there</strong></p><ul><li>one</li></ul>",
			});
			const body = bodySlot(html);
			expect(body).toBe(
				`<p style="${EMAIL_BODY_STYLES.p}">Hello <strong>there</strong></p>` +
					`<ul style="${EMAIL_BODY_STYLES.ul}">` +
					`<li style="${EMAIL_BODY_STYLES.li}">one</li></ul>`
			);
			// The plain-text body must not also be rendered.
			expect(body).not.toContain("Hello there");
		});

		it("inline-styles links, lists and blockquotes to match the template", () => {
			const html = buildEmailHtml({
				...base,
				messageBody: "quote link",
				messageHtml:
					'<blockquote><p>quote</p></blockquote><p><a href="https://a.test">link</a></p>',
			});
			const body = bodySlot(html);
			expect(body).toContain(`<blockquote style="`);
			expect(body).toContain("border-left: 3px solid #e2e8f0");
			expect(body).toContain(
				`<a href="https://a.test" target="_blank" rel="noopener noreferrer nofollow" style="${EMAIL_BODY_STYLES.a}">link</a>`
			);
			expect(body).toContain("color: #2563eb");
		});

		it("re-sanitizes even if the caller passes unsanitized html", () => {
			const html = buildEmailHtml({
				...base,
				messageBody: "hi",
				messageHtml:
					'<p onclick="x()">hi</p><script>alert(1)</script><iframe src="//evil"></iframe>',
			});
			const body = bodySlot(html);
			expect(body).toBe(`<p style="${EMAIL_BODY_STYLES.p}">hi</p>`);
			expect(html).not.toContain("onclick");
			expect(html).not.toContain("<iframe");
		});

		it("omits the greeting when no clientName is supplied", () => {
			const html = buildEmailHtml({
				organizationName: "Acme Cleaning",
				senderName: "Acme Cleaning",
				messageBody: "hi",
				messageHtml: "<p>hi</p>",
			});
			expect(html).not.toContain("Hi ,");
			expect(bodySlot(html)).toBe(`<p style="${EMAIL_BODY_STYLES.p}">hi</p>`);
		});
	});

	describe("custom portal email", () => {
		it("keeps only the custom body and portal CTA inside the safe card", () => {
			const html = buildEmailHtml({
				...base,
				messageBody: "Custom message",
				messageHtml: "<p>Custom message</p>",
				customPortalEmail: true,
				cta: { url: "https://portal.example.test/quote", label: "Review quote" },
			});

			expect(bodySlot(html)).toBe(
				`<p style="${EMAIL_BODY_STYLES.p}">Custom message</p>`
			);
			expect(html).toContain('href="https://portal.example.test/quote"');
			expect(html).toContain(">Review quote</a>");
			expect(html).not.toContain("Hi Ada Lovelace,");
			expect(html).not.toContain("Best regards,");
			expect(html).not.toContain("Sender Person</p>");
			expect(html).not.toContain("Powered by OneTool");
		});
	});
});

describe("branding helpers", () => {
	it("derives org initials", () => {
		expect(getOrgInitials("Acme Cleaning")).toBe("AC");
		expect(getOrgInitials("Acme")).toBe("AC");
		expect(getOrgInitials("   ")).toBe("?");
	});

	it("falls back to the no-reply sender with no receiving address", () => {
		expect(resolveFromEmail({ receivingAddress: "a@b.test" })).toBe("a@b.test");
		expect(resolveFromEmail({ receivingAddress: "  " })).toBe(
			"no-reply@onetool.biz"
		);
		expect(resolveFromEmail({})).toBe("no-reply@onetool.biz");
	});

	it("falls back to the shared inbound replyTo base with no receiving address", () => {
		expect(resolveReplyToEmail({ receivingAddress: "a@b.test" })).toBe(
			"a@b.test"
		);
		expect(resolveReplyToEmail({})).toBe("replies@inbound.onetool.biz");
	});

	it("allows only safe CTA schemes, including encoded unsafe schemes", () => {
		for (const href of [
			"https://portal.example.test",
			"http://portal.example.test",
			"mailto:client@example.test",
			"tel:+15555550100",
		]) {
			expect(sanitizeHref(href)).toBe(href);
		}
		for (const href of [
			"javascript:alert(1)",
			"java&#x0A;script:alert(1)",
			"java&#58;script:alert(1)",
			"java\u0000script:alert(1)",
		]) {
			expect(sanitizeHref(href)).toBeNull();
			expect(
				buildEmailHtml({
					...base,
					messageBody: "Hello",
					cta: { url: href, label: "Unsafe" },
				})
			).not.toContain(">Unsafe</a>");
		}
	});
});
