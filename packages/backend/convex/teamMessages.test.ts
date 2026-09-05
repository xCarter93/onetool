import { describe, it, expect, beforeEach } from "vitest";
import type { convexTest } from "convex-test";
import { api } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestIdentity,
	createTestProject,
	addMemberToOrg,
} from "./test.helpers";
import { insertTeamMessage } from "./teamMessages";

/**
 * Team Communication feed (teamMessages.listByEntity) — pinned by shipped
 * mobile binaries, so the row shape and ordering are part of the contract.
 */
describe("teamMessages.listByEntity", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("resolves author identity for repeated user and automation authors", async () => {
		const setup = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx, {
				clerkUserId: "user_tm_a",
				clerkOrgId: "org_tm_a",
				userName: "Ada Lovelace",
			});
			const clientId = await createTestClient(ctx, org.orgId);
			const member = await addMemberToOrg(ctx, org.orgId, {
				userName: "Grace Hopper",
				clerkUserId: "user_tm_member",
			});

			const trigger = {
				type: "scheduled" as const,
				schedule: {
					frequency: "daily" as const,
					timezone: "UTC",
					time: "09:00",
				},
			};
			const automationId = await ctx.db.insert("workflowAutomations", {
				orgId: org.orgId,
				name: "Nightly digest",
				trigger,
				nodes: [],
				status: "active" as const,
				createdBy: org.userId,
				createdAt: 1,
				updatedAt: 1,
			});

			const base = {
				orgId: org.orgId,
				entityType: "client" as const,
				entityId: clientId,
			};
			await insertTeamMessage(ctx, {
				...base,
				message: "first",
				authorType: "user",
				authorUserId: org.userId,
			});
			await insertTeamMessage(ctx, {
				...base,
				message: "second",
				authorType: "user",
				authorUserId: member.userId,
				mentionedUserIds: [org.userId],
				hasAttachments: true,
			});
			await insertTeamMessage(ctx, {
				...base,
				message: "third",
				authorType: "automation",
				automationId,
			});
			await insertTeamMessage(ctx, {
				...base,
				message: "fourth",
				authorType: "automation",
				automationId,
			});

			return { org, clientId };
		});

		const asOrg = t.withIdentity(
			createTestIdentity(setup.org.clerkUserId, setup.org.clerkOrgId)
		);
		const feed = await asOrg.query(api.teamMessages.listByEntity, {
			entityType: "client",
			entityId: setup.clientId,
		});

		expect(feed.map((m) => m.message)).toEqual([
			"fourth",
			"third",
			"second",
			"first",
		]);
		expect(feed.map((m) => m.authorName)).toEqual([
			"Nightly digest",
			"Nightly digest",
			"Grace Hopper",
			"Ada Lovelace",
		]);
		expect(feed.map((m) => m.hasAttachments)).toEqual([
			false,
			false,
			true,
			false,
		]);
		expect(feed[2].mentionedUserIds).toEqual([setup.org.userId]);
		expect(feed[0].authorUserId).toBeNull();
	});

	it("returns nothing to a member without the entity's view grant", async () => {
		const setup = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx, {
				clerkUserId: "user_tm_gate_owner",
				clerkOrgId: "org_tm_gate",
			});
			const clientId = await createTestClient(ctx, org.orgId);
			// Default member grants carry no clients access.
			const member = await addMemberToOrg(ctx, org.orgId, {
				clerkUserId: "user_tm_gate_member",
			});
			await insertTeamMessage(ctx, {
				orgId: org.orgId,
				entityType: "client",
				entityId: clientId,
				message: "owner note",
				authorType: "user",
				authorUserId: org.userId,
			});
			return { org, clientId, member };
		});

		const asMember = t.withIdentity(
			createTestIdentity(setup.member.clerkUserId, setup.org.clerkOrgId)
		);
		const args = { entityType: "client" as const, entityId: setup.clientId };

		expect(await asMember.query(api.teamMessages.listByEntity, args)).toEqual(
			[]
		);

		await t.run(async (ctx: { db: MutationCtx["db"] }) => {
			const membership = await ctx.db
				.query("organizationMemberships")
				.withIndex("by_org_user", (q) =>
					q.eq("orgId", setup.org.orgId).eq("userId", setup.member.userId)
				)
				.unique();
			await ctx.db.patch(membership!._id, {
				permissions: { clients: { level: "view", allRecords: true } },
			});
		});

		const feed = await asMember.query(api.teamMessages.listByEntity, args);
		expect(feed.map((m) => m.message)).toEqual(["owner note"]);
	});

	it("returns nothing to a scoped member for a client outside their assignments", async () => {
		const setup = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx, {
				clerkUserId: "user_tm_scope_owner",
				clerkOrgId: "org_tm_scope",
			});
			const assignedClientId = await createTestClient(ctx, org.orgId);
			const otherClientId = await createTestClient(ctx, org.orgId);
			const member = await addMemberToOrg(ctx, org.orgId, {
				clerkUserId: "user_tm_scope_member",
			});
			const projectId = await createTestProject(ctx, org.orgId, assignedClientId);
			await ctx.db.patch(projectId, { assignedUserIds: [member.userId] });
			for (const clientId of [assignedClientId, otherClientId]) {
				await insertTeamMessage(ctx, {
					orgId: org.orgId,
					entityType: "client",
					entityId: clientId,
					message: `note for ${clientId}`,
					authorType: "user",
					authorUserId: org.userId,
				});
			}
			return { org, member, assignedClientId, otherClientId };
		});
		await t.run(async (ctx: { db: MutationCtx["db"] }) => {
			const membership = await ctx.db
				.query("organizationMemberships")
				.withIndex("by_org_user", (q) =>
					q.eq("orgId", setup.org.orgId).eq("userId", setup.member.userId)
				)
				.unique();
			// View without allRecords: only assigned records are in scope.
			await ctx.db.patch(membership!._id, {
				permissions: { clients: { level: "view" } },
			});
		});

		const asMember = t.withIdentity(
			createTestIdentity(setup.member.clerkUserId, setup.org.clerkOrgId)
		);
		const assigned = await asMember.query(api.teamMessages.listByEntity, {
			entityType: "client",
			entityId: setup.assignedClientId,
		});
		expect(assigned.map((m) => m.message)).toEqual([
			`note for ${setup.assignedClientId}`,
		]);
		expect(
			await asMember.query(api.teamMessages.listByEntity, {
				entityType: "client",
				entityId: setup.otherClientId,
			})
		).toEqual([]);
	});

	it("returns nothing for another org's entity", async () => {
		const setup = await t.run(async (ctx) => {
			const orgA = await createTestOrg(ctx, {
				clerkUserId: "user_tm_x",
				clerkOrgId: "org_tm_x",
			});
			const orgB = await createTestOrg(ctx, {
				clerkUserId: "user_tm_y",
				clerkOrgId: "org_tm_y",
			});
			const clientId = await createTestClient(ctx, orgB.orgId);
			await insertTeamMessage(ctx, {
				orgId: orgB.orgId,
				entityType: "client",
				entityId: clientId,
				message: "B only",
				authorType: "user",
				authorUserId: orgB.userId,
			});
			return { orgA, clientId };
		});

		const asA = t.withIdentity(
			createTestIdentity(setup.orgA.clerkUserId, setup.orgA.clerkOrgId)
		);
		const feed = await asA.query(api.teamMessages.listByEntity, {
			entityType: "client",
			entityId: setup.clientId,
		});

		expect(feed).toEqual([]);
	});
});
