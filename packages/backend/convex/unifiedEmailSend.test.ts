// Must be set before email/durableResend.ts loads — its client captures the
// key at construction and sendEmail throws "API key is not set" on "".
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? "re_test_dummy_key";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConvexError } from "convex/values";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestClientContact,
	createTestIdentity,
} from "./test.helpers";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { OutboundMessage } from "./email/types";

// Observe the provider payload without changing behavior (same shape as
// resend.test.ts) — a plain spy can't intercept the ESM binding.
const { sentMessages } = vi.hoisted(() => ({
	sentMessages: [] as OutboundMessage[],
}));

vi.mock("./email/outbound", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./email/outbound")>();
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

/**
 * Unified quote/invoice email sending: the compose-modal arguments layered
 * onto quotes/invoices `sendToClient`, and the attachment transport.
 *
 * The durable @convex-dev/resend component is registered in test.setup.ts; its
 * delivery loop doesn't run under convex-test, but sendEmail enqueues and
 * returns an id, which is the whole app contract.
 */
describe("unified quote/invoice email sending", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		sentMessages.length = 0;
		vi.useFakeTimers();
		vi.stubEnv("PORTAL_JWT_ISSUER", "https://portal.example.com");
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	async function seedQuote(
		opts: { contactEmail?: string; status?: "draft" | "sent" } = {}
	) {
		const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const org = await createTestOrg(ctx, { userName: "Sender Person" });
				const clientId = await createTestClient(ctx, org.orgId);
				await ctx.db.patch(clientId, { portalAccessId: "portal-abc-123" });
				await createTestClientContact(ctx, org.orgId, clientId, {
					firstName: "Ada",
					lastName: "Lovelace",
					isPrimary: true,
					email: opts.contactEmail ?? "ada@example.test",
				});
				return { ...org, clientId };
			}
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		// Created through the API so triggers fire (aggregates + searchText).
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Roof replacement",
			status: opts.status ?? "draft",
			subtotal: 1000,
			total: 1000,
		});
		return { asUser, quoteId, orgId, clientId };
	}

	const messages = () =>
		t.run(async (ctx) => ctx.db.query("emailMessages").collect());
	const attachments = () =>
		t.run(async (ctx) => ctx.db.query("emailAttachments").collect());
	const threadsForClient = (clientId: Id<"clients">) =>
		t.run(async (ctx) =>
			(await ctx.db.query("emailThreads").collect()).filter(
				(row) => row.clientId === clientId
			)
		);

	async function sendUsage(orgId: Id<"organizations">) {
		return await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("planUsage")
				.withIndex("by_org_meter_period", (q) =>
					q.eq("orgId", orgId).eq("meter", "clientSends")
				)
				.collect();
			return rows[0]?.used ?? 0;
		});
	}

	/** convex-test surfaces ConvexError data as either the object or its JSON. */
	function errorCode(error: unknown): string | undefined {
		const data = (error as { data?: unknown }).data;
		const parsed = typeof data === "string" ? JSON.parse(data) : data;
		return (parsed as { code?: string } | undefined)?.code;
	}

	async function statusEvents() {
		return await t.run(async (ctx) =>
			(await ctx.db.query("domainEvents").collect()).filter(
				(row) => row.eventSource === "quotes.sendToClient"
			)
		);
	}

	// ------------------------------------------------------------------
	// Template mode — the pre-modal call shape mobile still uses.
	// ------------------------------------------------------------------

	it("sends the portal template on a bare { id } call and records it in the inbox", async () => {
		const { asUser, quoteId, orgId, clientId } = await seedQuote();

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const rows = await messages();
		expect(rows).toHaveLength(1);
		expect(rows[0].direction).toBe("outbound");
		expect(rows[0].toEmail).toBe("ada@example.test");
		expect(rows[0].clientId).toBe(clientId);
		expect(rows[0].quoteId).toBe(quoteId);
		expect(rows[0].resendEmailId).toBeTruthy();
		expect(rows[0].sentBy).toBeDefined();
		expect(rows[0].systemSent).toBeUndefined();
		// User-initiated sends thread back into the inbox via a plus-tagged
		// Reply-To, so the message must carry the thread it belongs to.
		expect(rows[0].threadDocId).toBeDefined();

		expect(await sendUsage(orgId)).toBe(1);
		expect(await statusEvents()).toHaveLength(1);
	});

	it("charges the send meter once — a resend is free", async () => {
		const { asUser, quoteId, orgId } = await seedQuote();

		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(await sendUsage(orgId)).toBe(1);
		expect(await messages()).toHaveLength(2);
		// Only the draft -> sent transition emits; the resend does not.
		expect(await statusEvents()).toHaveLength(1);
	});

	it("keeps a resend in the thread the first send opened", async () => {
		const { asUser, quoteId, clientId } = await seedQuote();

		// finishAllScheduledFunctions resets the harness on a second call, so
		// drain manually between the sends the resend lookup depends on.
		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		vi.runAllTimers();
		await t.finishInProgressScheduledFunctions();
		await asUser.mutation(api.quotes.sendToClient, { id: quoteId });
		vi.runAllTimers();
		await t.finishInProgressScheduledFunctions();

		const rows = await messages();
		expect(rows).toHaveLength(2);
		expect(rows[0].threadDocId).toBeDefined();
		expect(rows[1].threadDocId).toBe(rows[0].threadDocId);
		expect(await threadsForClient(clientId)).toHaveLength(1);
	});

	// ------------------------------------------------------------------
	// Custom mode — same side effects, different body.
	// ------------------------------------------------------------------

	it("custom mode flips status, emits and debits exactly like the template", async () => {
		const { asUser, quoteId, orgId } = await seedQuote();

		await asUser.mutation(api.quotes.sendToClient, {
			id: quoteId,
			mode: "custom",
			subject: "About your roof",
			html: "<p>Hi Ada, here are the <strong>details</strong>.</p>",
		});

		expect(await sendUsage(orgId)).toBe(1);
		const events = await statusEvents();
		expect(events).toHaveLength(1);
		expect(events[0]!.payload.newValue).toBe("sent");

		const rows = await messages();
		expect(rows).toHaveLength(1);
		expect(rows[0].subject).toBe("About your roof");
		expect(rows[0].messageBody).toContain("here are the details");
		expect(rows[0].htmlBody).toContain("<strong>details</strong>");
		expect(rows[0].quoteId).toBe(quoteId);

		const quote = await asUser.query(api.quotes.get, { id: quoteId });
		expect(quote?.status).toBe("sent");
	});

	it("custom mode always appends the portal CTA below the body", async () => {
		const { asUser, quoteId } = await seedQuote();

		await asUser.mutation(api.quotes.sendToClient, {
			id: quoteId,
			mode: "custom",
			html: "<p>Take a look.</p>",
		});

		expect(sentMessages).toHaveLength(1);
		const html = sentMessages[0].html;
		expect(html).toContain(`/portal/c/portal-abc-123/quotes/${quoteId}`);
		expect(html).toContain("Review quote");
		expect(html).not.toContain("Hi Ada Lovelace");
		expect(html).not.toContain("Best regards");
		expect(html).not.toContain("Powered by OneTool");
	});

	it("rejects a custom send with an empty body", async () => {
		const { asUser, quoteId } = await seedQuote();

		await expect(
			asUser.mutation(api.quotes.sendToClient, {
				id: quoteId,
				mode: "custom",
				html: "   ",
			})
		).rejects.toThrow(/Write a message/);
	});

	// ------------------------------------------------------------------
	// Recipients
	// ------------------------------------------------------------------

	it("passes cc and bcc through to the provider and the stored row", async () => {
		const { asUser, quoteId } = await seedQuote();

		await asUser.mutation(api.quotes.sendToClient, {
			id: quoteId,
			mode: "custom",
			html: "<p>Copies for the team.</p>",
			cc: ["cc@example.test", " CC@example.test "],
			bcc: ["bcc@example.test"],
		});

		const message = sentMessages[0];
		// cc is deduped case-insensitively.
		expect(message.cc).toEqual(["cc@example.test"]);
		expect(message.bcc).toEqual(["bcc@example.test"]);

		const rows = await messages();
		expect(rows[0].cc).toEqual(["cc@example.test"]);
		expect(rows[0].bcc).toEqual(["bcc@example.test"]);
	});

	it("blocks a send to a suppressed recipient with RECIPIENT_SUPPRESSED", async () => {
		const { asUser, quoteId, orgId } = await seedQuote();
		await t.run(async (ctx) => {
			await ctx.db.insert("emailSuppressions", {
				orgId,
				email: "ada@example.test",
				reason: "hard_bounce",
				source: "test",
				createdAt: Date.now(),
			});
		});

		const error = await asUser
			.mutation(api.quotes.sendToClient, { id: quoteId })
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ConvexError);
		expect(errorCode(error)).toBe("RECIPIENT_SUPPRESSED");
		// The block happens before any side effect: no status flip, no debit.
		const quote = await asUser.query(api.quotes.get, { id: quoteId });
		expect(quote?.status).toBe("draft");
		expect(await sendUsage(orgId)).toBe(0);
		expect(await messages()).toHaveLength(0);
	});

	it("blocks when only a cc recipient is suppressed", async () => {
		const { asUser, quoteId, orgId } = await seedQuote();
		await t.run(async (ctx) => {
			await ctx.db.insert("emailSuppressions", {
				orgId,
				email: "bounced@example.test",
				reason: "complaint",
				source: "test",
				createdAt: Date.now(),
			});
		});

		await expect(
			asUser.mutation(api.quotes.sendToClient, {
				id: quoteId,
				cc: ["bounced@example.test"],
			})
		).rejects.toThrow(/can't receive email/);
	});

	// ------------------------------------------------------------------
	// Attachments
	// ------------------------------------------------------------------

	it("writes outbound attachment rows and defers the send to the manual transport", async () => {
		const { asUser, quoteId, orgId } = await seedQuote();
		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["%PDF-1.7 fake"], { type: "application/pdf" }))
		);
		await asUser.mutation(api.emailAttachments.registerUpload, {
			storageId,
			filename: "quote.pdf",
		});

		await asUser.mutation(api.quotes.sendToClient, {
			id: quoteId,
			mode: "custom",
			html: "<p>Quote attached.</p>",
			attachments: [
				{
					storageId,
					filename: "quote.pdf",
					mimeType: "application/pdf",
					size: 1,
				},
			],
		});

		const rows = await messages();
		expect(rows).toHaveLength(1);
		expect(rows[0].hasAttachments).toBe(true);
		// The provider id arrives when the scheduled action reports back.
		expect(rows[0].resendEmailId).toBe("");

		const files = await attachments();
		expect(files).toHaveLength(1);
		expect(files[0].direction).toBe("outbound");
		expect(files[0].filename).toBe("quote.pdf");
		expect(files[0].orgId).toBe(orgId);
		// Size comes from storage metadata, never the client's claim.
		expect(files[0].size).toBeGreaterThan(1);

		const pending = await t.run(async (ctx) =>
			(await ctx.db.system.query("_scheduled_functions").collect()).filter(
				(row) =>
					row.name.includes("attachmentSend") && row.state.kind === "pending"
			)
		);
		expect(pending).toHaveLength(1);
	});

	it("rechecks suppression before a deferred attachment reaches the provider", async () => {
		const { asUser, quoteId, orgId } = await seedQuote();
		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["attachment"], { type: "text/plain" }))
		);
		await asUser.mutation(api.emailAttachments.registerUpload, {
			storageId,
			filename: "notes.txt",
		});
		await asUser.mutation(api.quotes.sendToClient, {
			id: quoteId,
			mode: "custom",
			html: "<p>Notes attached.</p>",
			attachments: [
				{
					storageId,
					filename: "notes.txt",
					mimeType: "text/plain",
					size: 1,
				},
			],
		});

		await t.run(async (ctx) => {
			await ctx.db.insert("emailSuppressions", {
				orgId,
				email: "ada@example.test",
				reason: "manual",
				source: "test",
				createdAt: Date.now(),
			});
		});

		vi.stubEnv("RESEND_API_KEY", "re_test_dummy_key");
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await t.finishAllScheduledFunctions(vi.runAllTimers);
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining("email.attachmentSend.deliver failed"),
				expect.objectContaining({
					message: "A recipient was suppressed before delivery.",
				})
			);
		} finally {
			errorSpy.mockRestore();
		}

		const rows = await messages();
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe("failed");
		expect(rows[0].resendEmailId).toBe("");
	});

	it("refuses attachments whose blob is gone", async () => {
		const { asUser, quoteId } = await seedQuote();
		const storageId = await t.run(async (ctx) => {
			const id = await ctx.storage.store(new Blob(["x"]));
			await ctx.storage.delete(id);
			return id;
		});

		await expect(
			asUser.mutation(api.quotes.sendToClient, {
				id: quoteId,
				attachments: [
					{ storageId, filename: "gone.pdf", mimeType: "application/pdf", size: 1 },
				],
			})
		).rejects.toThrow(/no longer available/);
	});

	it("refuses a storageId another org uploaded", async () => {
		const { asUser, quoteId } = await seedQuote();
		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["other org file"], { type: "text/plain" }))
		);
		// Fake timers freeze Date.now(), so the helper's default clerk ids would
		// collide with the first org's.
		const otherOrg = await t.run(async (ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "user_other_org",
				clerkOrgId: "org_other_org",
			})
		);
		await t
			.withIdentity(
				createTestIdentity(otherOrg.clerkUserId, otherOrg.clerkOrgId)
			)
			.mutation(api.emailAttachments.registerUpload, {
				storageId,
				filename: "theirs.txt",
			});

		const error = await asUser
			.mutation(api.quotes.sendToClient, {
				id: quoteId,
				attachments: [
					{
						storageId,
						filename: "theirs.txt",
						mimeType: "text/plain",
						size: 1,
					},
				],
			})
			.catch((e: unknown) => e);

		expect(errorCode(error)).toBe("NOT_FOUND");
		expect(await messages()).toHaveLength(0);
	});

	it("refuses a blocked extension renamed onto a registered upload", async () => {
		const { asUser, quoteId } = await seedQuote();
		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["MZ"], { type: "application/octet-stream" }))
		);
		await asUser.mutation(api.emailAttachments.registerUpload, {
			storageId,
			filename: "safe.pdf",
		});

		const error = await asUser
			.mutation(api.quotes.sendToClient, {
				id: quoteId,
				attachments: [
					{
						storageId,
						filename: "payload.exe",
						mimeType: "application/octet-stream",
						size: 1,
					},
				],
			})
			.catch((e: unknown) => e);

		expect(errorCode(error)).toBe("BAD_REQUEST");
		expect(await messages()).toHaveLength(0);
	});

	it("accepts the quote's own generated PDF without an upload claim", async () => {
		const { asUser, quoteId, orgId } = await seedQuote();
		const storageId = await t.run(async (ctx) => {
			const id = await ctx.storage.store(
				new Blob(["%PDF-1.7 generated"], { type: "application/pdf" })
			);
			await ctx.db.insert("documents", {
				orgId,
				documentType: "quote",
				documentId: quoteId,
				storageId: id,
				generatedAt: Date.now(),
				version: 1,
			});
			return id;
		});

		await asUser.mutation(api.quotes.sendToClient, {
			id: quoteId,
			mode: "custom",
			html: "<p>Quote attached.</p>",
			attachments: [
				{
					storageId,
					filename: "quote.pdf",
					mimeType: "application/pdf",
					size: 1,
				},
			],
		});

		const files = await attachments();
		expect(files).toHaveLength(1);
		expect(files[0].filename).toBe("quote.pdf");
	});

	// ------------------------------------------------------------------
	// Invoices
	// ------------------------------------------------------------------

	async function seedInvoice(opts: { chargesEnabled?: boolean } = {}) {
		const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const org = await createTestOrg(ctx, { userName: "Sender Person" });
				if (opts.chargesEnabled !== undefined) {
					await ctx.db.patch(org.orgId, {
						stripeChargesEnabled: opts.chargesEnabled,
					});
				}
				const clientId = await createTestClient(ctx, org.orgId);
				await ctx.db.patch(clientId, { portalAccessId: "portal-inv-1" });
				await createTestClientContact(ctx, org.orgId, clientId, {
					firstName: "Ada",
					lastName: "Lovelace",
					isPrimary: true,
					email: "ada@example.test",
				});
				return { ...org, clientId };
			}
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-1001",
			status: "draft",
			subtotal: 500,
			total: 500,
			issuedDate: Date.now(),
			dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
		});
		return { asUser, invoiceId, orgId, clientId };
	}

	it("offers the pay CTA once Stripe Connect can take charges", async () => {
		const { asUser, invoiceId } = await seedInvoice({ chargesEnabled: true });

		await asUser.mutation(api.invoices.sendToClient, {
			id: invoiceId,
			mode: "custom",
			html: "<p>Invoice attached.</p>",
		});

		expect(sentMessages[0].html).toContain("View &amp; pay invoice");
		expect(sentMessages[0].html).not.toContain("Hi Ada Lovelace");
		expect(sentMessages[0].html).not.toContain("Best regards");
		expect(sentMessages[0].html).not.toContain("Powered by OneTool");
	});

	it("offers a view-only CTA when the org can't take charges", async () => {
		const { asUser, invoiceId } = await seedInvoice({ chargesEnabled: false });

		await asUser.mutation(api.invoices.sendToClient, {
			id: invoiceId,
			mode: "custom",
			html: "<p>Invoice attached.</p>",
		});

		expect(sentMessages[0].html).toContain("View invoice online");
		expect(sentMessages[0].html).not.toContain("pay invoice");
	});

	it("records an invoice send against the invoice and debits once", async () => {
		const { asUser, invoiceId, orgId } = await seedInvoice();

		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });
		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(await sendUsage(orgId)).toBe(1);
		const rows = await messages();
		expect(rows).toHaveLength(2);
		expect(rows[0].invoiceId).toBe(invoiceId);
	});

	it("keeps a custom-mode invoice resend in the template send's thread", async () => {
		const { asUser, invoiceId, clientId } = await seedInvoice();

		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		await asUser.mutation(api.invoices.sendToClient, {
			id: invoiceId,
			mode: "custom",
			html: "<p>Just following up.</p>",
		});

		const rows = await messages();
		expect(rows).toHaveLength(2);
		expect(rows[0].threadDocId).toBeDefined();
		expect(rows[1].threadDocId).toBe(rows[0].threadDocId);
		expect(await threadsForClient(clientId)).toHaveLength(1);
	});

	// ------------------------------------------------------------------
	// Inbox composer
	// ------------------------------------------------------------------

	it("carries cc, bcc and attachments through an inbox send", async () => {
		const { asUser, clientId, orgId } = await seedQuote();
		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["hello"], { type: "text/plain" }))
		);
		await asUser.mutation(api.emailAttachments.registerUpload, {
			storageId,
			filename: "notes.txt",
		});

		await asUser.mutation(api.resend.sendClientEmail, {
			clientId,
			subject: "Paperwork",
			messageBody: "See attached.",
			cc: ["cc@example.test"],
			bcc: ["bcc@example.test"],
			attachments: [
				{ storageId, filename: "notes.txt", mimeType: "text/plain", size: 5 },
			],
		});

		expect(sentMessages[0].cc).toEqual(["cc@example.test"]);
		expect(sentMessages[0].bcc).toEqual(["bcc@example.test"]);

		const rows = await messages();
		expect(rows).toHaveLength(1);
		expect(rows[0].hasAttachments).toBe(true);
		// Inbox sends stay unlinked to any entity and unmetered.
		expect(rows[0].quoteId).toBeUndefined();
		expect(await sendUsage(orgId)).toBe(0);

		const files = await attachments();
		expect(files).toHaveLength(1);
		expect(files[0].direction).toBe("outbound");
	});

	// ------------------------------------------------------------------
	// Schema back-compatibility
	// ------------------------------------------------------------------

	it("still accepts a legacy inbound attachment row with no direction", async () => {
		const { asUser, quoteId, orgId } = await seedQuote();
		await asUser.mutation(api.quotes.sendToClient, {
			id: quoteId,
			mode: "custom",
			html: "<p>Body.</p>",
		});
		const [message] = await messages();

		const legacyId = await t.run(async (ctx) =>
			ctx.db.insert("emailAttachments", {
				orgId,
				emailMessageId: message._id,
				attachmentId: "resend-attachment-1",
				filename: "inbound.pdf",
				contentType: "application/pdf",
				size: 42,
				receivedAt: Date.now(),
			})
		);

		const legacy = await t.run(async (ctx) => ctx.db.get(legacyId));
		expect(legacy?.direction).toBeUndefined();
	});
});
