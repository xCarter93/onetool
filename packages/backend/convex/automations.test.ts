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

	describe("v1.2 schema expansion", () => {
		it("should create automation with v1.2 status_changed trigger format", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Status changed v1.2",
				isActive: true,
				trigger: {
					type: "status_changed",
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

			const automation = await asUser.query(api.automations.get, { id: automationId });
			expect(automation?.trigger).toHaveProperty("type", "status_changed");
		});

		it("should still accept legacy trigger format without type field", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Legacy format",
				isActive: true,
				trigger: {
					objectType: "client",
					toStatus: "active",
				},
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

			expect(automationId).toBeDefined();
		});

		it("should create automation with fetch_records node", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Fetch records test",
				isActive: true,
				trigger: {
					type: "status_changed",
					objectType: "invoice",
					toStatus: "overdue",
				},
				nodes: [
					{
						id: "fetch-1",
						type: "fetch_records",
						fetchConfig: {
							entityType: "invoice",
							filters: [{ field: "status", operator: "equals", value: "overdue" }],
							limit: 100,
						},
						nextNodeId: "action-1",
					},
					{
						id: "action-1",
						type: "action",
						action: {
							targetType: "self",
							actionType: "update_status",
							newStatus: "cancelled",
						},
					},
				],
			});

			expect(automationId).toBeDefined();
		});

		it("should create automation with loop node", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Loop test",
				isActive: true,
				trigger: {
					type: "status_changed",
					objectType: "project",
					toStatus: "completed",
				},
				nodes: [
					{
						id: "loop-1",
						type: "loop",
						loopConfig: {
							sourceNodeId: "fetch-1",
							batchSize: 25,
						},
						nextNodeId: "action-1",
					},
					{
						id: "action-1",
						type: "action",
						action: {
							targetType: "self",
							actionType: "update_status",
							newStatus: "archived",
						},
					},
				],
			});

			expect(automationId).toBeDefined();
		});

		it("should create automation with expanded condition operators", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Test greater_than operator
			const automationId1 = await asUser.mutation(api.automations.create, {
				name: "Greater than condition",
				isActive: true,
				trigger: {
					type: "status_changed",
					objectType: "invoice",
					toStatus: "sent",
				},
				nodes: [
					{
						id: "cond-1",
						type: "condition",
						condition: {
							field: "total",
							operator: "greater_than",
							value: 10000,
						},
						nextNodeId: "action-1",
					},
					{
						id: "action-1",
						type: "action",
						action: {
							targetType: "self",
							actionType: "update_status",
							newStatus: "paid",
						},
					},
				],
			});

			expect(automationId1).toBeDefined();

			// Test before operator
			const automationId2 = await asUser.mutation(api.automations.create, {
				name: "Before condition",
				isActive: true,
				trigger: {
					type: "status_changed",
					objectType: "task",
					toStatus: "completed",
				},
				nodes: [
					{
						id: "cond-1",
						type: "condition",
						condition: {
							field: "dueDate",
							operator: "before",
							value: "2026-01-01",
						},
						nextNodeId: "action-1",
					},
					{
						id: "action-1",
						type: "action",
						action: {
							targetType: "self",
							actionType: "update_status",
							newStatus: "archived",
						},
					},
				],
			});

			expect(automationId2).toBeDefined();
		});

		it("should create automation with update_field action", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const automationId = await asUser.mutation(api.automations.create, {
				name: "Update field test",
				isActive: true,
				trigger: {
					type: "status_changed",
					objectType: "client",
					toStatus: "active",
				},
				nodes: [
					{
						id: "action-1",
						type: "action",
						action: {
							targetType: "self",
							actionType: "update_field",
							newStatus: "",
							field: "notes",
							value: "Activated via automation",
						},
					},
				],
			});

			expect(automationId).toBeDefined();
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
