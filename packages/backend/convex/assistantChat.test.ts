import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
	addMemberToOrg,
	createPremiumTestIdentity,
	createTestIdentity,
	createTestOrg,
} from "./test.helpers";
import { setupConvexTest } from "./test.setup";

const PAGE = { numItems: 20, cursor: null };

describe("assistantChat", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedTwoOrgs() {
		return await t.run(async (ctx) => {
			const orgA = await createTestOrg(ctx, {
				clerkUserId: "user_a",
				clerkOrgId: "org_a",
			});
			const orgB = await createTestOrg(ctx, {
				clerkUserId: "user_b",
				clerkOrgId: "org_b",
			});
			return { orgA, orgB };
		});
	}

	it("creates a thread and lists it only for the owner", async () => {
		const { orgA, orgB } = await seedTwoOrgs();
		const asA = t.withIdentity(
			createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
		);
		const asB = t.withIdentity(
			createTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
		);

		const { threadId } = await asA.mutation(api.assistantChat.createThread, {});
		expect(threadId).toBeTruthy();

		const threadsA = await asA.query(api.assistantChat.listThreads, {});
		expect(threadsA).toHaveLength(1);
		expect(threadsA[0].threadId).toBe(threadId);

		const threadsB = await asB.query(api.assistantChat.listThreads, {});
		expect(threadsB).toHaveLength(0);
	});

	it("rejects sendMessage on another org's thread", async () => {
		const { orgA, orgB } = await seedTwoOrgs();
		const asA = t.withIdentity(
			createPremiumTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
		);
		// Premium too, so the org-isolation check (not the plan gate) rejects.
		const asB = t.withIdentity(
			createPremiumTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
		);

		const { threadId } = await asA.mutation(api.assistantChat.createThread, {});

		await expect(
			asB.mutation(api.assistantChat.sendMessage, {
				threadId,
				prompt: "leak attempt",
			})
		).rejects.toThrow("Thread not found");
	});

	it("rejects access by a different user in the same org", async () => {
		const { orgA } = await seedTwoOrgs();
		const member = await t.run(async (ctx) =>
			addMemberToOrg(ctx, orgA.orgId, { clerkUserId: "user_a2" })
		);
		const asOwner = t.withIdentity(
			createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
		);
		const asMember = t.withIdentity(
			createTestIdentity(member.clerkUserId, orgA.clerkOrgId)
		);

		const { threadId } = await asOwner.mutation(
			api.assistantChat.createThread,
			{}
		);

		await expect(
			asMember.query(api.assistantChat.listThreadMessages, {
				threadId,
				paginationOpts: PAGE,
			})
		).rejects.toThrow("Thread not found");

		const memberThreads = await asMember.query(
			api.assistantChat.listThreads,
			{}
		);
		expect(memberThreads).toHaveLength(0);
	});

	it("saves a message, sets the thread title, and lists messages for the owner only", async () => {
		const { orgA, orgB } = await seedTwoOrgs();
		const asA = t.withIdentity(
			createPremiumTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
		);
		const asB = t.withIdentity(
			createTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
		);

		const { threadId } = await asA.mutation(api.assistantChat.createThread, {});
		const { messageId } = await asA.mutation(api.assistantChat.sendMessage, {
			threadId,
			prompt: "What is on my schedule today?",
		});
		expect(messageId).toBeTruthy();

		const page = await asA.query(api.assistantChat.listThreadMessages, {
			threadId,
			paginationOpts: PAGE,
		});
		expect(page.page).toHaveLength(1);
		expect(page.page[0].role).toBe("user");

		const threads = await asA.query(api.assistantChat.listThreads, {});
		expect(threads[0].title).toBe("What is on my schedule today?");

		await expect(
			asB.query(api.assistantChat.listThreadMessages, {
				threadId,
				paginationOpts: PAGE,
			})
		).rejects.toThrow("Thread not found");
	});

	describe("plan gate", () => {
		it("free orgs can send, metered at 10 messages per UTC day", async () => {
			const { orgA } = await seedTwoOrgs();
			const asFree = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);

			const { threadId } = await asFree.mutation(
				api.assistantChat.createThread,
				{}
			);

			for (let i = 0; i < 10; i++) {
				const { messageId } = await asFree.mutation(
					api.assistantChat.sendMessage,
					{ threadId, prompt: `hello ${i}` }
				);
				expect(messageId).toBeTruthy();
			}
			// The 11th message of the day refuses with the frozen shape.
			let caught: unknown;
			try {
				await asFree.mutation(api.assistantChat.sendMessage, {
					threadId,
					prompt: "one too many",
				});
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeDefined();
			expect(String(caught)).toContain("PLAN_LIMIT_REACHED");
			expect(String(caught)).toContain("assistantMessages");
		});

		it("allows sendMessage via the org metadata flag", async () => {
			const { orgA } = await seedTwoOrgs();
			const asOrgPremium = t.withIdentity({
				...createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId),
				orgPublicMetadata: { has_premium_feature_access: true },
			});

			const { threadId } = await asOrgPremium.mutation(
				api.assistantChat.createThread,
				{}
			);
			const { messageId } = await asOrgPremium.mutation(
				api.assistantChat.sendMessage,
				{ threadId, prompt: "hello" }
			);
			expect(messageId).toBeTruthy();
		});

		it("streamResponse authorization no longer plan-blocks free orgs", async () => {
			const { orgA } = await seedTwoOrgs();
			const asFree = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);

			// The aiAssistant switch is free-for-all at Slice A, so the failure
			// for a bogus thread is ownership, not the plan gate.
			await expect(
				asFree.action(api.assistantChat.streamResponse, {
					threadId: "thread_x",
					promptMessageId: "msg_x",
				})
			).rejects.toThrow("Thread not found");
		});

		it("allows sendMessage via the webhook-synced org subscription", async () => {
			const { orgA } = await seedTwoOrgs();
			// What billingWebhook.ts writes when the org subscribes to the paid plan.
			await t.run(async (ctx) => {
				await ctx.db.patch(orgA.orgId, {
					clerkPlanSlug: "onetool_business_plan_org",
					subscriptionStatus: "active",
				});
			});
			const asPaid = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);

			const { threadId } = await asPaid.mutation(
				api.assistantChat.createThread,
				{}
			);
			const { messageId } = await asPaid.mutation(
				api.assistantChat.sendMessage,
				{ threadId, prompt: "hello" }
			);
			expect(messageId).toBeTruthy();
		});

		it("business orgs are unmetered past the free daily cap", async () => {
			const { orgA } = await seedTwoOrgs();
			await t.run(async (ctx) => {
				await ctx.db.patch(orgA.orgId, {
					clerkPlanSlug: "onetool_business_plan_org",
					subscriptionStatus: "active",
				});
			});
			const asPaid = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);

			const { threadId } = await asPaid.mutation(
				api.assistantChat.createThread,
				{}
			);
			for (let i = 0; i < 12; i++) {
				const { messageId } = await asPaid.mutation(
					api.assistantChat.sendMessage,
					{ threadId, prompt: `hello ${i}` }
				);
				expect(messageId).toBeTruthy();
			}
		});

		describe("UTC day rollover", () => {
			// Only this block runs on fake timers; the rest of the suite is
			// wall-clock and must stay that way.
			afterEach(() => {
				vi.useRealTimers();
			});

			it("the daily budget resets at UTC midnight", async () => {
				vi.useFakeTimers();
				vi.setSystemTime(Date.UTC(2026, 4, 12, 18));
				const { orgA } = await seedTwoOrgs();
				const asFree = t.withIdentity(
					createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
				);

				const { threadId } = await asFree.mutation(
					api.assistantChat.createThread,
					{}
				);
				for (let i = 0; i < 10; i++) {
					await asFree.mutation(api.assistantChat.sendMessage, {
						threadId,
						prompt: `day one ${i}`,
					});
				}
				await expect(
					asFree.mutation(api.assistantChat.sendMessage, {
						threadId,
						prompt: "one too many",
					})
				).rejects.toThrow("PLAN_LIMIT_REACHED");

				// Next UTC day: a fresh period key, so the budget is whole again.
				vi.setSystemTime(Date.UTC(2026, 4, 13, 1));
				const { messageId } = await asFree.mutation(
					api.assistantChat.sendMessage,
					{ threadId, prompt: "day two" }
				);
				expect(messageId).toBeTruthy();
			});
		});
	});

	describe("regeneration pin", () => {
		async function seedThread() {
			const { orgA } = await seedTwoOrgs();
			const asUser = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);
			const { threadId } = await asUser.mutation(
				api.assistantChat.createThread,
				{}
			);
			return { asUser, threadId };
		}

		it("only the message sendMessage last metered may be regenerated", async () => {
			const { asUser, threadId } = await seedThread();

			const first = await asUser.mutation(api.assistantChat.sendMessage, {
				threadId,
				prompt: "first",
			});
			await expect(
				asUser.query(internal.assistantChat.authorizeThread, {
					threadId,
					promptMessageId: first.messageId,
				})
			).resolves.toBeDefined();

			const second = await asUser.mutation(api.assistantChat.sendMessage, {
				threadId,
				prompt: "second",
			});
			// Replaying the older message would buy an unmetered generation.
			await expect(
				asUser.query(internal.assistantChat.authorizeThread, {
					threadId,
					promptMessageId: first.messageId,
				})
			).rejects.toThrow("can no longer be regenerated");
			await expect(
				asUser.query(internal.assistantChat.authorizeThread, {
					threadId,
					promptMessageId: second.messageId,
				})
			).resolves.toBeDefined();
		});

		it("a legacy thread with no pin accepts any message id", async () => {
			const { asUser, threadId } = await seedThread();
			await asUser.mutation(api.assistantChat.sendMessage, {
				threadId,
				prompt: "first",
			});
			// Threads whose meta predates lastPromptMessageId stay unpinned.
			await t.run(async (ctx) => {
				const meta = await ctx.db
					.query("agentThreadMeta")
					.withIndex("by_thread", (q) => q.eq("threadId", threadId))
					.unique();
				await ctx.db.patch(meta!._id, { lastPromptMessageId: undefined });
			});

			await expect(
				asUser.query(internal.assistantChat.authorizeThread, {
					threadId,
					promptMessageId: "msg_from_before_the_pin",
				})
			).resolves.toBeDefined();
		});
	});
});
