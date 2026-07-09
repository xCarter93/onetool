import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestClientContact,
} from "./test.helpers";
import { Id } from "./_generated/dataModel";

// resendReceiving.ts constructs the raw Resend SDK client at module load and
// throws without an API key; stub one before convex-test imports the module.
// (These tests only exercise the mutation — no network calls happen.)
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? "re_test_dummy_key";

/**
 * Inbound ingest (processInboundEmail): dedup, org/thread routing (incl. the
 * plus-token + fallback-sender path), unknown-sender persistence, and
 * thread-client adoption.
 */
describe("resendReceiving.processInboundEmail", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	const RECEIVING = "org-inbound1@inbound.onetool.biz";

	// t.run's ctx isn't schema-typed for custom indexes, so tests scan the
	// (tiny, in-memory) table instead of using by_resend_id.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function findByResendId(ctx: any, resendEmailId: string) {
		const all = await ctx.db.query("emailMessages").collect();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return all.find((m: any) => m.resendEmailId === resendEmailId) ?? null;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function filterByResendId(ctx: any, resendEmailId: string) {
		const all = await ctx.db.query("emailMessages").collect();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return all.filter((m: any) => m.resendEmailId === resendEmailId);
	}

	async function orgSetup(overrides: { receivingAddress?: string } = {}) {
		return await t.run(async (ctx) => {
			const org = await createTestOrg(ctx, {
				clerkUserId: "user_inbound_1",
				clerkOrgId: "org_inbound_1",
			});
			await ctx.db.patch(org.orgId, {
				receivingAddress: overrides.receivingAddress ?? RECEIVING,
			});
			const clientId = await createTestClient(ctx, org.orgId);
			await createTestClientContact(ctx, org.orgId, clientId, {
				email: "jane@client.com",
				firstName: "Jane",
				lastName: "Client",
				isPrimary: true,
			});
			return { ...org, clientId };
		});
	}

	function inboundArgs(
		overrides: Partial<{
			emailId: string;
			from: string;
			to: string[];
			subject: string;
			rfcMessageId: string;
			inReplyTo: string;
			references: string[];
			receivedForAddress: string;
			textBody: string;
			visibleText: string;
		}> = {}
	) {
		return {
			emailId: overrides.emailId ?? "re_in_1",
			from: overrides.from ?? "Jane Client <jane@client.com>",
			to: overrides.to ?? [RECEIVING],
			subject: overrides.subject ?? "Project question",
			rfcMessageId: overrides.rfcMessageId ?? "<in-1@client.com>",
			inReplyTo: overrides.inReplyTo,
			references: overrides.references,
			receivedForAddress: overrides.receivedForAddress ?? RECEIVING,
			textBody: overrides.textBody ?? "Hello there",
			visibleText: overrides.visibleText ?? "Hello there",
		};
	}

	it("persists a known-contact email onto a client-linked thread", async () => {
		const { orgId, clientId } = await orgSetup();

		const result = await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs()
		);
		expect(result.success).toBe(true);

		const { message, thread } = await t.run(async (ctx) => {
			const message = await findByResendId(ctx, "re_in_1");
			const thread = message?.threadDocId
				? await ctx.db.get(message.threadDocId)
				: null;
			return { message, thread };
		});
		expect(message?.orgId).toBe(orgId);
		expect(message?.clientId).toBe(clientId);
		expect(thread?.clientId).toBe(clientId);
		expect(thread?.unreadCount).toBe(1);
		expect(thread?.messageCount).toBe(1);
	});

	it("deduplicates a redelivered webhook (same Resend emailId)", async () => {
		await orgSetup();

		const first = await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs()
		);
		expect(first.success).toBe(true);

		const second = await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs()
		);
		expect(second.success).toBe(true);
		expect(second.skipped).toBe(true);

		const { rowCount, thread } = await t.run(async (ctx) => {
			const rows = await filterByResendId(ctx, "re_in_1");
			const thread = rows[0]?.threadDocId
				? await ctx.db.get(rows[0].threadDocId)
				: null;
			return { rowCount: rows.length, thread };
		});
		expect(rowCount).toBe(1);
		// Aggregates must not double-bump.
		expect(thread?.messageCount).toBe(1);
		expect(thread?.unreadCount).toBe(1);
	});

	it("persists unknown-sender mail on an unlinked (clientId null) thread", async () => {
		await orgSetup();

		const result = await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs({
				emailId: "re_in_unknown",
				from: "Stranger <stranger@nowhere.com>",
				rfcMessageId: "<in-unknown@nowhere.com>",
			})
		);
		expect(result.success).toBe(true);

		const { message, thread } = await t.run(async (ctx) => {
			const message = await findByResendId(ctx, "re_in_unknown");
			const thread = message?.threadDocId
				? await ctx.db.get(message.threadDocId)
				: null;
			return { message, thread };
		});
		expect(message).not.toBeNull();
		expect(message?.clientId).toBeNull();
		expect(thread?.clientId).toBeNull();
	});

	it("routes a plus-token reply into the tokened thread even across subjects", async () => {
		await orgSetup();

		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs()
		);
		const threadDocId = await t.run(async (ctx) => {
			const message = await findByResendId(ctx, "re_in_1");
			return message!.threadDocId!;
		});

		const tagged = RECEIVING.replace("@", `+t${threadDocId}@`);
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs({
				emailId: "re_in_2",
				subject: "Totally different subject",
				rfcMessageId: "<in-2@client.com>",
				to: [tagged],
				receivedForAddress: tagged,
			})
		);

		const second = await t.run(async (ctx) => {
			return await findByResendId(ctx, "re_in_2");
		});
		expect(second?.threadDocId).toBe(threadDocId);
	});

	it("routes a plus-tokened reply to the support@ fallback sender instead of dropping it", async () => {
		// Org WITHOUT a receiving address sends from the shared fallback; the
		// only routing signal on the reply is the +t<threadDocId> token.
		const { orgId } = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx, {
				clerkUserId: "user_fallback_1",
				clerkOrgId: "org_fallback_1",
			});
			return org;
		});
		const threadDocId = await t.run(async (ctx) => {
			return await ctx.db.insert("emailThreads", {
				orgId,
				clientId: null,
				subjectNormalized: "quote",
				subject: "Quote",
				lastMessageAt: Date.now(),
				messageCount: 1,
				unreadCount: 0,
				status: "open",
				participantEmails: ["jane@client.com"],
			});
		});

		const tagged = `support+t${threadDocId}@onetool.biz`;
		const result = await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs({
				emailId: "re_in_fallback",
				from: "Jane Client <jane@client.com>",
				subject: "Re: Quote",
				rfcMessageId: "<in-fb@client.com>",
				to: [tagged],
				receivedForAddress: tagged,
			})
		);
		expect(result.success).toBe(true);
		expect(result.skipped).toBeUndefined();

		const message = await t.run(async (ctx) => {
			return await findByResendId(ctx, "re_in_fallback");
		});
		expect(message?.orgId).toBe(orgId);
		expect(message?.threadDocId).toBe(threadDocId);
	});

	it("still skips untokened mail to the support@ general inbox", async () => {
		const result = await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs({
				emailId: "re_in_support",
				to: ["support@onetool.biz"],
				receivedForAddress: "support@onetool.biz",
			})
		);
		expect(result.success).toBe(true);
		expect(result.skipped).toBe(true);
	});

	it("adopts the thread's linked client for later mail from an unrecognized sender", async () => {
		const { orgId } = await orgSetup();

		// Unknown sender starts a thread…
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs({
				emailId: "re_in_adopt_1",
				from: "Stranger <stranger@nowhere.com>",
				rfcMessageId: "<adopt-1@nowhere.com>",
			})
		);
		const { threadDocId, linkedClientId } = await t.run(async (ctx) => {
			const message = await findByResendId(ctx, "re_in_adopt_1");
			const threadDocId = message!.threadDocId! as Id<"emailThreads">;
			// …and is then manually linked to a client (as via the inbox UI).
			const linkedClientId = await createTestClient(ctx, orgId, {
				companyName: "Adopted Co",
			});
			await ctx.db.patch(threadDocId, { clientId: linkedClientId });
			return { threadDocId, linkedClientId };
		});

		const tagged = RECEIVING.replace("@", `+t${threadDocId}@`);
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs({
				emailId: "re_in_adopt_2",
				from: "Stranger <stranger@nowhere.com>",
				subject: "Re: Project question",
				rfcMessageId: "<adopt-2@nowhere.com>",
				to: [tagged],
				receivedForAddress: tagged,
			})
		);

		const second = await t.run(async (ctx) => {
			return await findByResendId(ctx, "re_in_adopt_2");
		});
		expect(second?.threadDocId).toBe(threadDocId);
		expect(second?.clientId).toBe(linkedClientId);
	});

	it("threads a reply via In-Reply-To against a stored RFC Message-ID", async () => {
		await orgSetup();

		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs()
		);
		const threadDocId = await t.run(async (ctx) => {
			const message = await findByResendId(ctx, "re_in_1");
			return message!.threadDocId!;
		});

		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs({
				emailId: "re_in_reply",
				subject: "Re: Project question",
				rfcMessageId: "<in-reply@client.com>",
				inReplyTo: "<in-1@client.com>",
			})
		);

		const reply = await t.run(async (ctx) => {
			return await findByResendId(ctx, "re_in_reply");
		});
		expect(reply?.threadDocId).toBe(threadDocId);
	});
});
