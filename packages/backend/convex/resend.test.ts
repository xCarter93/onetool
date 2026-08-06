// Must be set before email/durableResend.ts loads — its client captures the
// key at construction and sendEmail throws "API key is not set" on "".
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? "re_test_dummy_key";

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestClientContact,
	createTestIdentity,
} from "./test.helpers";
import { api } from "./_generated/api";
import type { OutboundMessage } from "./email/types";

/**
 * Manual client email send paths (resend.ts): sendClientEmail + replyToEmail,
 * with and without the rich-text `messageHtml` arg.
 *
 * The durable resend component is registered in test.setup.ts; its delivery
 * loop doesn't run under convex-test, but sendEmail enqueues and returns an id.
 * We wrap the outbound seam so the provider payload (notably the new text/plain
 * part) is observable without changing behavior.
 */
const { sentMessages } = vi.hoisted(() => ({
	sentMessages: [] as OutboundMessage[],
}));

vi.mock("./email/outbound", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("./email/outbound")>();
	return {
		...actual,
		sendOutbound: async (
			ctx: Parameters<typeof actual.sendOutbound>[0],
			orgId: Parameters<typeof actual.sendOutbound>[1],
			msg: OutboundMessage
		) => {
			sentMessages.push(msg);
			return actual.sendOutbound(ctx, orgId, msg);
		},
	};
});

const RICH_HTML =
	'<p>Hello <strong>there</strong></p><ul><li>one</li></ul><p><a href="https://example.test">link</a></p>';
const RICH_TEXT = "Hello there\none\nlink";

describe("resend send paths", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		sentMessages.length = 0;
	});

	async function setup() {
		const org = await t.run(async (ctx) => {
			const s = await createTestOrg(ctx, { userName: "Sender Person" });
			const clientId = await createTestClient(ctx, s.orgId);
			const contactId = await createTestClientContact(ctx, s.orgId, clientId, {
				firstName: "Ada",
				lastName: "Lovelace",
				email: "ada@example.test",
				isPrimary: true,
			});
			return { ...s, clientId, contactId };
		});
		const asUser = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		return { ...org, asUser };
	}

	const getMessages = () =>
		t.run(async (ctx) => ctx.db.query("emailMessages").collect());

	describe("sendClientEmail", () => {
		it("stores a plain-text row and sends a text/plain part (no messageHtml)", async () => {
			const { asUser, clientId } = await setup();
			const body = "Line one\nLine two";

			const result = await asUser.mutation(api.resend.sendClientEmail, {
				clientId,
				subject: "Quote follow-up",
				messageBody: body,
			});

			expect(result.emailMessageId).toBeDefined();
			const [row] = await getMessages();
			expect(row.direction).toBe("outbound");
			expect(row.messageBody).toBe(body);
			expect(row.messagePreview).toBe(body.substring(0, 100));
			expect(row.htmlBody).toBeUndefined();
			expect(row.visibleText).toBeUndefined();

			// Every send now carries a text/plain alternative.
			expect(sentMessages).toHaveLength(1);
			expect(sentMessages[0].text).toBe(body);
			// Plain-text bodies still go through the escaped <p> pipeline.
			expect(sentMessages[0].html).toContain(
				'<p style="margin: 8px 0;">Line one</p>'
			);
		});

		it("stores sanitized html + plain text when messageHtml is provided", async () => {
			const { asUser, clientId } = await setup();

			await asUser.mutation(api.resend.sendClientEmail, {
				clientId,
				subject: "Rich note",
				messageBody: RICH_TEXT,
				messageHtml: RICH_HTML,
			});

			const [row] = await getMessages();
			expect(row.messageBody).toBe(RICH_TEXT);
			expect(row.visibleText).toBe(RICH_TEXT);
			expect(row.messagePreview).toBe(RICH_TEXT.substring(0, 100));
			expect(row.htmlBody).toBe(RICH_HTML);

			expect(sentMessages[0].text).toBe(RICH_TEXT);
			// Rich body replaces the <p>-per-line pipeline inside the shell.
			expect(sentMessages[0].html).toContain("<li");
			expect(sentMessages[0].html).toContain("<strong>there</strong>");
			expect(sentMessages[0].html).not.toContain(
				`<p style="margin: 8px 0;">${RICH_TEXT}</p>`
			);
		});

		it("sanitizes hostile composer html before storing or sending", async () => {
			const { asUser, clientId } = await setup();
			const hostile =
				'<p onclick="steal()">hi</p><script>alert(1)</script>' +
				'<img src=x onerror="alert(1)">' +
				'<a href="javascript:alert(1)">bad</a>';

			await asUser.mutation(api.resend.sendClientEmail, {
				clientId,
				subject: "Hostile",
				messageBody: "hi bad",
				messageHtml: hostile,
			});

			const [row] = await getMessages();
			expect(row.htmlBody).toBe("<p>hi</p><a>bad</a>");
			expect(row.htmlBody).not.toContain("script");
			expect(row.htmlBody).not.toContain("onclick");
			expect(sentMessages[0].html).not.toContain("onerror");
			expect(sentMessages[0].html).not.toContain("javascript:");
		});

		it("falls back to the plain-text path when the html sanitizes to nothing", async () => {
			const { asUser, clientId } = await setup();

			await asUser.mutation(api.resend.sendClientEmail, {
				clientId,
				subject: "Junk html",
				messageBody: "plain fallback",
				messageHtml: "<script>alert(1)</script><img src=x>",
			});

			const [row] = await getMessages();
			expect(row.htmlBody).toBeUndefined();
			expect(row.visibleText).toBeUndefined();
			expect(sentMessages[0].html).toContain(
				'<p style="margin: 8px 0;">plain fallback</p>'
			);
		});

		it("truncates messagePreview to 100 chars of plain text", async () => {
			const { asUser, clientId } = await setup();
			const long = "x".repeat(250);

			await asUser.mutation(api.resend.sendClientEmail, {
				clientId,
				subject: "Long",
				messageBody: long,
				messageHtml: `<p>${long}</p>`,
			});

			const [row] = await getMessages();
			expect(row.messagePreview).toBe(long.substring(0, 100));
			expect(row.messagePreview).toHaveLength(100);
		});

		it("creates a thread when no threadId is supplied (standalone compose)", async () => {
			const { asUser, clientId } = await setup();

			const result = await asUser.mutation(api.resend.sendClientEmail, {
				clientId,
				subject: "Brand new conversation",
				messageBody: "hello",
			});

			const threads = await t.run(async (ctx) =>
				ctx.db.query("emailThreads").collect()
			);
			expect(threads).toHaveLength(1);
			expect(threads[0].subject).toBe("Brand new conversation");
			expect(result.threadId).toBe(threads[0]._id);
		});

		it("sends to an explicitly selected contact", async () => {
			const { asUser, clientId, orgId } = await setup();
			const otherId = await t.run(async (ctx) =>
				createTestClientContact(ctx, orgId, clientId, {
					firstName: "Grace",
					lastName: "Hopper",
					email: "grace@example.test",
				})
			);

			await asUser.mutation(api.resend.sendClientEmail, {
				clientId,
				contactId: otherId,
				subject: "Hi Grace",
				messageBody: "hello",
			});

			const [row] = await getMessages();
			expect(row.toEmail).toBe("grace@example.test");
		});
	});

	describe("replyToEmail", () => {
		async function sendFirst() {
			const s = await setup();
			const first = await s.asUser.mutation(api.resend.sendClientEmail, {
				clientId: s.clientId,
				subject: "Original",
				messageBody: "original body",
			});
			sentMessages.length = 0;
			return { ...s, first };
		}

		it("adds a text/plain part and stores no htmlBody without messageHtml", async () => {
			const { asUser, first } = await sendFirst();

			await asUser.mutation(api.resend.replyToEmail, {
				emailMessageId: first.emailMessageId,
				messageBody: "reply body",
			});

			const rows = await getMessages();
			const reply = rows.find((r) => r.subject === "Re: Original")!;
			expect(reply.messageBody).toBe("reply body");
			expect(reply.messagePreview).toBe("reply body");
			expect(reply.htmlBody).toBeUndefined();
			expect(reply.visibleText).toBeUndefined();
			expect(sentMessages[0].text).toBe("reply body");
		});

		it("stores sanitized html + plain text when messageHtml is provided", async () => {
			const { asUser, first } = await sendFirst();

			await asUser.mutation(api.resend.replyToEmail, {
				emailMessageId: first.emailMessageId,
				messageBody: RICH_TEXT,
				messageHtml: `${RICH_HTML}<script>alert(1)</script>`,
			});

			const rows = await getMessages();
			const reply = rows.find((r) => r.subject === "Re: Original")!;
			expect(reply.htmlBody).toBe(RICH_HTML);
			expect(reply.visibleText).toBe(RICH_TEXT);
			expect(reply.messageBody).toBe(RICH_TEXT);
			expect(sentMessages[0].text).toBe(RICH_TEXT);
			expect(sentMessages[0].html).toContain("<li");
		});
	});
});
