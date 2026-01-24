import { describe, it, expect, beforeEach } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

describe("Automations", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it("should create a workflow automation", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Auto-approve quotes",
				description: "When a quote is sent, automatically mark project as in-progress",
				isActive: true,
				trigger: {
					objectType: "quote",
					toStatus: "sent",
				},
				nodes: [
					{
						id: "node-1",
						type: "action",
						action: {
							targetType: "project",
							actionType: "update_status",
							newStatus: "in-progress",
						},
					},
				],
			});

			expect(automationId).toBeDefined();
		});
	});

	describe("list", () => {
		it("should list automations for organization", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Create automation
			await asUser.mutation(api.automations.create, {
				name: "Test automation",
				isActive: true,
				trigger: {
					objectType: "project",
					toStatus: "completed",
				},
				nodes: [
					{
						id: "node-1",
						type: "action",
						action: {
							targetType: "self",
							actionType: "update_status",
							newStatus: "archived",
						},
					},
				],
			});

			// List automations
			const automations = await asUser.query(api.automations.list, {});

			expect(automations).toHaveLength(1);
			expect(automations[0].name).toBe("Test automation");
		});

		it("should isolate automations by organization", async () => {
			const org1 = await t.run(async (ctx) =>
				await createTestOrg(ctx, {
					clerkUserId: "user_org1_test",
					clerkOrgId: "org_org1_test",
				})
			);
			const org2 = await t.run(async (ctx) =>
				await createTestOrg(ctx, {
					clerkUserId: "user_org2_test",
					clerkOrgId: "org_org2_test",
				})
			);

			const asUser1 = t.withIdentity(createTestIdentity(org1.clerkUserId, org1.clerkOrgId));
			const asUser2 = t.withIdentity(createTestIdentity(org2.clerkUserId, org2.clerkOrgId));

			// Create automation in org1
			await asUser1.mutation(api.automations.create, {
				name: "Org 1 automation",
				isActive: true,
				trigger: { objectType: "client", toStatus: "active" },
				nodes: [
					{
						id: "node-1",
						type: "action",
						action: {
							targetType: "self",
							actionType: "update_status",
							newStatus: "active",
						},
					},
				],
			});

			// List from org2 should be empty
			const org2Automations = await asUser2.query(api.automations.list, {});

			expect(org2Automations).toHaveLength(0);
		});
	});

	describe("update", () => {
		it("should update automation name", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Original name",
				isActive: true,
				trigger: { objectType: "task", toStatus: "completed" },
				nodes: [
					{
						id: "node-1",
						type: "action",
						action: {
							targetType: "self",
							actionType: "update_status",
							newStatus: "done",
						},
					},
				],
			});

			await asUser.mutation(api.automations.update, {
				id: automationId,
				name: "Updated name",
			});

			const automation = await asUser.query(api.automations.get, { id: automationId });

			expect(automation?.name).toBe("Updated name");
		});

		it("should toggle isActive status", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Test",
				isActive: true,
				trigger: { objectType: "invoice", toStatus: "paid" },
				nodes: [
					{
						id: "node-1",
						type: "action",
						action: {
							targetType: "self",
							actionType: "update_status",
							newStatus: "archived",
						},
					},
				],
			});

			await asUser.mutation(api.automations.update, {
				id: automationId,
				isActive: false,
			});

			const automation = await asUser.query(api.automations.get, { id: automationId });

			expect(automation?.isActive).toBe(false);
		});
	});

	describe("remove", () => {
		it("should delete automation", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.mutation(api.automations.create, {
				name: "To be deleted",
				isActive: true,
				trigger: { objectType: "quote", toStatus: "approved" },
				nodes: [
					{
						id: "node-1",
						type: "action",
						action: {
							targetType: "project",
							actionType: "update_status",
							newStatus: "in-progress",
						},
					},
				],
			});

			await asUser.mutation(api.automations.remove, { id: automationId });

			const automation = await asUser.query(api.automations.get, { id: automationId });

			expect(automation).toBeNull();
		});
	});
});
