import { describe, it, expect, beforeEach } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestClient, createTestIdentity } from "./test.helpers";

// Idempotency-key replay protection (PRD-mobile-offline §4.6). notifications.createMention
// is append-only, so its receipt test only needs to prove the SECOND queued
// insert never happens — not a status-guard replay like tasks.complete.
describe("mutationReceipts", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seed() {
		const { orgId, clerkUserId, clerkOrgId } = await t.run(createTestOrg);
		const clientId = await t.run((ctx) => createTestClient(ctx, orgId));
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		return { asUser, orgId, clientId };
	}

	it("same key twice: one effect, same result returned", async () => {
		const { asUser, clientId } = await seed();
		const args = {
			message: "hello",
			entityType: "client" as const,
			entityId: clientId,
			entityName: "Acme",
			idempotencyKey: "mention-1",
		};

		const first = await asUser.mutation(api.notifications.createMention, args);
		const second = await asUser.mutation(api.notifications.createMention, args);
		expect(second).toBe(first);

		const messages = await t.run((ctx) => ctx.db.query("teamMessages").collect());
		expect(messages).toHaveLength(1);
	});

	it("same key with different arguments throws IDEMPOTENCY_KEY_REUSED", async () => {
		const { asUser, clientId } = await seed();
		await asUser.mutation(api.notifications.createMention, {
			message: "hello",
			entityType: "client",
			entityId: clientId,
			entityName: "Acme",
			idempotencyKey: "mention-2",
		});

		await expect(
			asUser.mutation(api.notifications.createMention, {
				message: "a different message",
				entityType: "client",
				entityId: clientId,
				entityName: "Acme",
				idempotencyKey: "mention-2",
			})
		).rejects.toThrow(/IDEMPOTENCY_KEY_REUSED/);
	});

	it("an omitted idempotencyKey runs the mutation normally every time", async () => {
		const { asUser, clientId } = await seed();
		const args = {
			message: "hello",
			entityType: "client" as const,
			entityId: clientId,
			entityName: "Acme",
		};

		await asUser.mutation(api.notifications.createMention, args);
		await asUser.mutation(api.notifications.createMention, args);

		const messages = await t.run((ctx) => ctx.db.query("teamMessages").collect());
		expect(messages).toHaveLength(2);
	});

	it("cleanupExpired deletes only receipts past the retention window", async () => {
		const { orgId } = await t.run(createTestOrg);
		const userId = await t.run(async (ctx) => {
			const org = await ctx.db.get(orgId);
			return org!.ownerUserId;
		});
		const now = Date.now();
		const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1000;
		const TEN_DAYS = 10 * 24 * 60 * 60 * 1000;

		const [oldId, recentId] = await t.run(async (ctx) => {
			const old = await ctx.db.insert("mutationReceipts", {
				orgId,
				userId,
				key: "old-key",
				operation: "tasks.complete",
				argsHash: "abc",
				createdAt: now - THIRTY_ONE_DAYS,
			});
			const recent = await ctx.db.insert("mutationReceipts", {
				orgId,
				userId,
				key: "recent-key",
				operation: "tasks.complete",
				argsHash: "def",
				createdAt: now - TEN_DAYS,
			});
			return [old, recent];
		});

		await t.mutation(internal.mutationReceipts.cleanupExpired, {});

		const remaining = await t.run((ctx) => ctx.db.query("mutationReceipts").collect());
		const ids = remaining.map((r) => r._id);
		expect(ids).not.toContain(oldId);
		expect(ids).toContain(recentId);
	});
});
