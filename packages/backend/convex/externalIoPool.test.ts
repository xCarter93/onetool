import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity, addMemberToOrg } from "./test.helpers";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * externalIoPool coverage: the send_notification/send_team_message automation
 * actions cap per-run push fan-out (RECIPIENT_FANOUT_CAP) and route dispatch
 * through the shared @convex-dev/workpool component instead of a raw
 * scheduler.runAfter. See automationExecutor.ts + push.ts.
 *
 * KNOWN LIMITATION: convex-test@0.0.41 cannot execute @convex-dev/workpool's
 * internal main loop — it throws `convexTest does not support udf type:
 * "snapshotQuery"` (the loop's recovery/scheduling handler uses a
 * `runSnapshotQuery` primitive convex-test doesn't implement at this pinned
 * version; see loop.ts's use of future.ts's runSnapshotQuery). This means a
 * push enqueued via enqueuePushViaPool never actually dispatches (no fetch
 * call) under this test harness, even though it dispatches correctly against
 * a real deployment (confirmed via `npx convex dev --once` pushing clean and
 * the pool mounting without error). These tests therefore verify the DB-level
 * contract we control directly — the cap and the truncation record — rather
 * than asserting on the mocked fetch for the pooled path. The non-automation
 * push path (raw scheduler, unchanged) IS fully exercised end-to-end below,
 * including the mocked fetch call, since it never touches the pool.
 */
describe("externalIoPool fan-out cap", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function setupUser(overrides?: {
		clerkUserId?: string;
		clerkOrgId?: string;
	}) {
		const setup = await t.run(async (ctx) => createTestOrg(ctx, overrides));
		const asUser = t.withIdentity(
			createTestIdentity(setup.clerkUserId, setup.clerkOrgId)
		);
		return { ...setup, asUser };
	}

	/** Drain the pending domainEvents queue and every scheduled function it fans out to. */
	async function drainEvents() {
		await t.mutation(internal.eventBus.processEvents, {});
		await t.finishAllScheduledFunctions(vi.runAllTimers);
	}

	function sendTeamMessageActionNode(
		id: string,
		recipients: "all_members" | "admins" | { userIds: string[] },
		title: string,
		message: string
	) {
		return {
			id,
			type: "action" as const,
			config: {
				kind: "action" as const,
				action: {
					type: "send_team_message" as const,
					recipients,
					title,
					message,
				},
			},
		};
	}

	it("send_team_message with >50 recipients: at most 50 notified, overflow recorded on the node output", async () => {
		const { asUser, orgId, userId: ownerId } = await setupUser();

		// Owner + 54 members = 55 recipients total; expect the first 50 (by
		// insertion order) notified and the last 5 skipped.
		const memberIds: Id<"users">[] = [];
		for (let i = 0; i < 54; i++) {
			const { userId } = await t.run(async (ctx) =>
				addMemberToOrg(ctx, orgId, {
					role: "member",
					clerkUserId: `member_${i}`,
					userEmail: `member_${i}@example.com`,
				})
			);
			memberIds.push(userId);
		}
		const allIds = [ownerId, ...memberIds];
		expect(allIds).toHaveLength(55);

		const notifiedIds = allIds.slice(0, 50);
		const skippedIds = allIds.slice(50);

		const automationId = await asUser.mutation(api.automations.create, {
			name: "Team ping",
			trigger: { type: "record_created", objectType: "client" },
			nodes: [
				sendTeamMessageActionNode(
					"msg-1",
					{ userIds: allIds },
					"New client",
					"New client: {{trigger.record.companyName}}"
				),
			],
			isActive: true,
		});

		await asUser.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Acme Co",
			status: "lead",
		});

		await drainEvents();

		const bells = (
			await t.run(async (ctx) =>
				ctx.db
					.query("notifications")
					.withIndex("by_org", (q) => q.eq("orgId", orgId))
					.collect()
			)
		).filter((n) => n.notificationType === "automation_message");
		expect(bells).toHaveLength(50);

		const bellUserIds = new Set(bells.map((b) => b.userId));
		for (const id of notifiedIds) expect(bellUserIds.has(id)).toBe(true);
		for (const id of skippedIds) expect(bellUserIds.has(id)).toBe(false);

		const executions = await t.run(async (ctx) =>
			ctx.db.query("workflowExecutions").collect()
		);
		const execution = executions.find((e) => e.automationId === automationId);
		expect(execution?.nodesExecuted[0]?.output).toEqual({
			recipientsNotified: 50,
			recipientsSkipped: 5,
		});
	});

	it("existing push behavior for non-automation callers (createMention) is unchanged — still fires via the raw scheduler path", async () => {
		const { asUser, orgId } = await setupUser();
		const { userId: memberId } = await t.run(async (ctx) =>
			addMemberToOrg(ctx, orgId, { role: "member" })
		);

		await t.run(async (ctx) =>
			ctx.db.insert("pushTokens", {
				userId: memberId,
				token: "ExponentPushToken[MENTION]",
				platform: "ios",
				lastSeenAt: Date.now(),
			})
		);

		const fetchSpy = vi.fn(
			async () =>
				({
					ok: true,
					json: async () => ({ data: [{ status: "ok", id: "r1" }] }),
				}) as unknown as Response
		);
		vi.stubGlobal("fetch", fetchSpy);

		const clientId = await asUser.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Acme Co",
			status: "active",
		});

		await asUser.mutation(api.notifications.createMention, {
			mentionedUserIds: [memberId],
			message: "hey @mention",
			entityType: "client",
			entityId: clientId,
			entityName: "Acme Co",
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const bells = await t.run(async (ctx) =>
			ctx.db
				.query("notifications")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect()
		);
		expect(bells.some((b) => b.userId === memberId)).toBe(true);
		expect(fetchSpy).toHaveBeenCalled();

		vi.unstubAllGlobals();
	});
});
