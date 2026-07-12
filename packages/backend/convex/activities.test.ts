import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestIdentity,
	addMemberToOrg,
	TestOrgSetup,
} from "./test.helpers";
import { Id } from "./_generated/dataModel";

describe("Activities", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	/**
	 * Helper function to create a test activity
	 */
	async function createTestActivity(
		ctx: { db: { insert: Function } },
		orgId: Id<"organizations">,
		userId: Id<"users">,
		overrides: {
			activityType?:
				| "client_created"
				| "client_updated"
				| "project_created"
				| "project_updated"
				| "project_completed"
				| "quote_created"
				| "quote_sent"
				| "quote_approved"
				| "quote_declined"
				| "invoice_created"
				| "invoice_sent"
				| "invoice_paid"
				| "task_created"
				| "task_completed"
				| "user_invited"
				| "user_removed"
				| "organization_updated";
			entityType?:
				| "client"
				| "project"
				| "quote"
				| "invoice"
				| "task"
				| "user"
				| "organization";
			entityId?: string;
			entityName?: string;
			description?: string;
			timestamp?: number;
			isVisible?: boolean;
		} = {}
	): Promise<Id<"activities">> {
		return await ctx.db.insert("activities", {
			orgId,
			userId,
			activityType: overrides.activityType ?? "client_created",
			entityType: overrides.entityType ?? "client",
			entityId: overrides.entityId ?? "test_entity_123",
			entityName: overrides.entityName ?? "Test Entity",
			description: overrides.description ?? "Test activity description",
			timestamp: overrides.timestamp ?? Date.now(),
			isVisible: overrides.isVisible ?? true,
		});
	}

	describe("getRecent", () => {
		it("should return empty array when no activities exist", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const activities = await asUser.query(api.activities.getRecent, {});
			expect(activities).toEqual([]);
		});

		it("should return activities with user data", async () => {
			const { userId, orgId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					const setup = await createTestOrg(ctx);
					await createTestActivity(ctx, setup.orgId, setup.userId, {
						activityType: "client_created",
						entityType: "client",
						entityName: "Acme Corp",
						description: "Created new client Acme Corp",
					});
					return setup;
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const activities = await asUser.query(api.activities.getRecent, {});

			expect(activities).toHaveLength(1);
			expect(activities[0]).toMatchObject({
				activityType: "client_created",
				entityType: "client",
				entityName: "Acme Corp",
				description: "Created new client Acme Corp",
				isVisible: true,
			});
			expect(activities[0].user).toMatchObject({
				name: "Test User",
				email: "test@example.com",
			});
		});

		it("should respect limit parameter", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);
				// Create 5 activities
				for (let i = 0; i < 5; i++) {
					await createTestActivity(ctx, setup.orgId, setup.userId, {
						entityName: `Entity ${i}`,
						timestamp: Date.now() + i * 1000, // Different timestamps
					});
				}
				return setup;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const activities = await asUser.query(api.activities.getRecent, {
				limit: 3,
			});

			expect(activities).toHaveLength(3);
		});

		it("should return activities in descending order by timestamp", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);
				const now = Date.now();

				await createTestActivity(ctx, setup.orgId, setup.userId, {
					entityName: "First",
					timestamp: now - 2000,
				});
				await createTestActivity(ctx, setup.orgId, setup.userId, {
					entityName: "Second",
					timestamp: now - 1000,
				});
				await createTestActivity(ctx, setup.orgId, setup.userId, {
					entityName: "Third",
					timestamp: now,
				});

				return setup;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const activities = await asUser.query(api.activities.getRecent, {});

			expect(activities).toHaveLength(3);
			expect(activities[0].entityName).toBe("Third");
			expect(activities[1].entityName).toBe("Second");
			expect(activities[2].entityName).toBe("First");
		});

		it("should exclude activities where isVisible is false", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);

				await createTestActivity(ctx, setup.orgId, setup.userId, {
					entityName: "Visible Activity",
					isVisible: true,
				});
				await createTestActivity(ctx, setup.orgId, setup.userId, {
					entityName: "Hidden Activity",
					isVisible: false,
				});

				return setup;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const activities = await asUser.query(api.activities.getRecent, {});

			expect(activities).toHaveLength(1);
			expect(activities[0].entityName).toBe("Visible Activity");
		});
	});

	describe("entityType 'user' visibility (permission-change audit trail)", () => {
		it("hides member_permissions_updated activities from ordinary members", async () => {
			const { clerkOrgId, memberClerkUserId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);
				const { userId: targetUserId, clerkUserId: memberClerkUserId } =
					await addMemberToOrg(ctx, setup.orgId, {
						userName: "Target Member",
					});
				await createTestActivity(ctx, setup.orgId, setup.userId, {
					activityType: "user_removed",
					entityType: "user",
					entityId: targetUserId,
					entityName: "Target Member",
					description: "Updated access permissions for Target Member",
				});
				return { ...setup, memberClerkUserId };
			});

			const asMember = t.withIdentity(
				createTestIdentity(memberClerkUserId, clerkOrgId)
			);
			const memberActivities = await asMember.query(
				api.activities.getRecent,
				{}
			);
			expect(memberActivities).toHaveLength(0);
		});

		it("shows member_permissions_updated activities to admins/owners", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);
				const { userId: targetUserId } = await addMemberToOrg(
					ctx,
					setup.orgId,
					{ userName: "Target Member" }
				);
				await createTestActivity(ctx, setup.orgId, setup.userId, {
					activityType: "user_removed",
					entityType: "user",
					entityId: targetUserId,
					entityName: "Target Member",
					description: "Updated access permissions for Target Member",
				});
				return setup;
			});

			const asAdmin = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const adminActivities = await asAdmin.query(api.activities.getRecent, {});

			expect(adminActivities).toHaveLength(1);
			expect(adminActivities[0].entityType).toBe("user");
		});
	});

	describe("getByType", () => {
		it("should filter activities by type", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);

				await createTestActivity(ctx, setup.orgId, setup.userId, {
					activityType: "client_created",
					entityName: "Client Activity",
				});
				await createTestActivity(ctx, setup.orgId, setup.userId, {
					activityType: "project_created",
					entityType: "project",
					entityName: "Project Activity",
				});
				await createTestActivity(ctx, setup.orgId, setup.userId, {
					activityType: "invoice_paid",
					entityType: "invoice",
					entityName: "Invoice Activity",
				});

				return setup;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const clientActivities = await asUser.query(api.activities.getByType, {
				activityType: "client_created",
			});

			expect(clientActivities).toHaveLength(1);
			expect(clientActivities[0].activityType).toBe("client_created");
			expect(clientActivities[0].entityName).toBe("Client Activity");
		});

		it("should return empty array when no activities match type", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);

				await createTestActivity(ctx, setup.orgId, setup.userId, {
					activityType: "client_created",
				});

				return setup;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const activities = await asUser.query(api.activities.getByType, {
				activityType: "invoice_paid",
			});

			expect(activities).toEqual([]);
		});
	});

	describe("getByEntity", () => {
		it("should filter activities by entity type and ID", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);

				await createTestActivity(ctx, setup.orgId, setup.userId, {
					entityType: "client",
					entityId: "client_123",
					entityName: "Acme Corp",
				});
				await createTestActivity(ctx, setup.orgId, setup.userId, {
					entityType: "client",
					entityId: "client_456",
					entityName: "Beta Inc",
				});
				await createTestActivity(ctx, setup.orgId, setup.userId, {
					entityType: "project",
					entityId: "project_789",
					entityName: "Website Redesign",
				});

				return setup;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const activities = await asUser.query(api.activities.getByEntity, {
				entityType: "client",
				entityId: "client_123",
			});

			expect(activities).toHaveLength(1);
			expect(activities[0].entityName).toBe("Acme Corp");
			expect(activities[0].entityId).toBe("client_123");
		});

		it("should return empty array when entity has no activities", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);

				await createTestActivity(ctx, setup.orgId, setup.userId, {
					entityType: "client",
					entityId: "client_123",
				});

				return setup;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const activities = await asUser.query(api.activities.getByEntity, {
				entityType: "project",
				entityId: "project_999",
			});

			expect(activities).toEqual([]);
		});
	});

	describe("getCount", () => {
		it("should return total count of visible activities", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);

				for (let i = 0; i < 5; i++) {
					await createTestActivity(ctx, setup.orgId, setup.userId, {
						isVisible: true,
					});
				}
				// Add one hidden activity
				await createTestActivity(ctx, setup.orgId, setup.userId, {
					isVisible: false,
				});

				return setup;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const count = await asUser.query(api.activities.getCount, {});

			expect(count).toBe(5);
		});

		it("should filter count by activity type", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);

				await createTestActivity(ctx, setup.orgId, setup.userId, {
					activityType: "client_created",
				});
				await createTestActivity(ctx, setup.orgId, setup.userId, {
					activityType: "client_created",
				});
				await createTestActivity(ctx, setup.orgId, setup.userId, {
					activityType: "project_created",
					entityType: "project",
				});

				return setup;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const clientCount = await asUser.query(api.activities.getCount, {
				activityType: "client_created",
			});

			expect(clientCount).toBe(2);
		});
	});

	describe("organization isolation", () => {
		it("should only return activities for the current organization", async () => {
			// Create two separate organizations
			const { clerkUserId: user1ClerkId, clerkOrgId: org1ClerkId } =
				await t.run(async (ctx) => {
					const setup1 = await createTestOrg(ctx, {
						clerkUserId: "user_org1",
						clerkOrgId: "org_1",
						orgName: "Organization 1",
					});

					await createTestActivity(ctx, setup1.orgId, setup1.userId, {
						entityName: "Org 1 Activity",
					});

					return setup1;
				});

			const { clerkUserId: user2ClerkId, clerkOrgId: org2ClerkId } =
				await t.run(async (ctx) => {
					const setup2 = await createTestOrg(ctx, {
						clerkUserId: "user_org2",
						clerkOrgId: "org_2",
						orgName: "Organization 2",
					});

					await createTestActivity(ctx, setup2.orgId, setup2.userId, {
						entityName: "Org 2 Activity",
					});

					return setup2;
				});

			// User from org 1 should only see org 1's activities
			const asUser1 = t.withIdentity(createTestIdentity(user1ClerkId, org1ClerkId));
			const org1Activities = await asUser1.query(api.activities.getRecent, {});

			expect(org1Activities).toHaveLength(1);
			expect(org1Activities[0].entityName).toBe("Org 1 Activity");

			// User from org 2 should only see org 2's activities
			const asUser2 = t.withIdentity(createTestIdentity(user2ClerkId, org2ClerkId));
			const org2Activities = await asUser2.query(api.activities.getRecent, {});

			expect(org2Activities).toHaveLength(1);
			expect(org2Activities[0].entityName).toBe("Org 2 Activity");
		});

		it("should not leak activities across organizations in getByEntity", async () => {
			const sharedEntityId = "shared_entity_123";

			// Create activity in org 1 with a specific entity ID
			const { clerkUserId: user1ClerkId, clerkOrgId: org1ClerkId } =
				await t.run(async (ctx) => {
					const setup1 = await createTestOrg(ctx, {
						clerkUserId: "user_org1",
						clerkOrgId: "org_1",
					});

					await createTestActivity(ctx, setup1.orgId, setup1.userId, {
						entityType: "client",
						entityId: sharedEntityId,
						entityName: "Org 1 Client",
					});

					return setup1;
				});

			// Create activity in org 2 with the same entity ID
			const { clerkUserId: user2ClerkId, clerkOrgId: org2ClerkId } =
				await t.run(async (ctx) => {
					const setup2 = await createTestOrg(ctx, {
						clerkUserId: "user_org2",
						clerkOrgId: "org_2",
					});

					await createTestActivity(ctx, setup2.orgId, setup2.userId, {
						entityType: "client",
						entityId: sharedEntityId,
						entityName: "Org 2 Client",
					});

					return setup2;
				});

			// User from org 2 should only see their own activity, not org 1's
			const asUser2 = t.withIdentity(createTestIdentity(user2ClerkId, org2ClerkId));
			const activities = await asUser2.query(api.activities.getByEntity, {
				entityType: "client",
				entityId: sharedEntityId,
			});

			expect(activities).toHaveLength(1);
			expect(activities[0].entityName).toBe("Org 2 Client");
		});
	});
});
