import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
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
		it("blocks sendMessage without premium access", async () => {
			const { orgA } = await seedTwoOrgs();
			const asFree = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);

			const { threadId } = await asFree.mutation(
				api.assistantChat.createThread,
				{}
			);

			await expect(
				asFree.mutation(api.assistantChat.sendMessage, {
					threadId,
					prompt: "hello",
				})
			).rejects.toThrow("Business plan");
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

		it("blocks streamResponse without premium access", async () => {
			const { orgA } = await seedTwoOrgs();
			const asFree = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);

			// The gate runs before thread authorization, so dummy IDs suffice —
			// this action can be invoked directly, independent of sendMessage.
			await expect(
				asFree.action(api.assistantChat.streamResponse, {
					threadId: "thread_x",
					promptMessageId: "msg_x",
				})
			).rejects.toThrow("Business plan");
		});

		it("allows sendMessage via the Clerk Billing plan claim", async () => {
			const { orgA } = await seedTwoOrgs();
			const asPlan = t.withIdentity({
				...createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId),
				pla: "u:free_user o:onetool_business_plan_org",
			});

			const { threadId } = await asPlan.mutation(
				api.assistantChat.createThread,
				{}
			);
			const { messageId } = await asPlan.mutation(
				api.assistantChat.sendMessage,
				{ threadId, prompt: "hello" }
			);
			expect(messageId).toBeTruthy();
		});
	});
});
