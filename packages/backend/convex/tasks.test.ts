import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { Id } from "./_generated/dataModel";

describe("Tasks", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it("should create a task with valid data", async () => {
			// Create test data
			const { orgId, userId, clientId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { orgId, userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const taskId = await asUser.mutation(api.tasks.create, {
				title: "Test Task",
				description: "Test Description",
				date: Date.now(),
				startTime: "09:00",
				endTime: "10:00",
				status: "pending",
				clientId,
				type: "external",
			});

			expect(taskId).toBeDefined();

			const task = await asUser.query(api.tasks.get, { id: taskId });
			expect(task).toMatchObject({
				title: "Test Task",
				description: "Test Description",
				status: "pending",
				clientId,
				orgId,
			});
		});

		it("should throw error for empty title", async () => {
			const { userId, clientId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await expect(
				asUser.mutation(api.tasks.create, {
					title: "",
					date: Date.now(),
					status: "pending",
					clientId,
					type: "external",
				})
			).rejects.toThrowError("Task title is required");
		});

		it("should throw error for invalid time format", async () => {
			const { userId, clientId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await expect(
				asUser.mutation(api.tasks.create, {
					title: "Test Task",
					date: Date.now(),
					startTime: "25:00", // Invalid time
					status: "pending",
					clientId,
					type: "external",
				})
			).rejects.toThrowError("Invalid start time format");
		});

		it("should throw error when end time is before start time", async () => {
			const { userId, clientId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await expect(
				asUser.mutation(api.tasks.create, {
					title: "Test Task",
					date: Date.now(),
					startTime: "14:00",
					endTime: "13:00", // Before start time
					status: "pending",
					clientId,
					type: "external",
				})
			).rejects.toThrowError("End time must be after start time");
		});

		it("should create recurring tasks with multiple instances", async () => {
			const { userId, clientId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const startDate = Date.now();
			const endDate = startDate + 7 * 24 * 60 * 60 * 1000; // 7 days later

			const parentTaskId = await asUser.mutation(api.tasks.create, {
				title: "Recurring Task",
				date: startDate,
				status: "pending",
				clientId,
				type: "external",
				repeat: "daily",
				repeatUntil: endDate,
			});

			expect(parentTaskId).toBeDefined();

			// Get all tasks to verify recurring instances
			const tasks = await asUser.query(api.tasks.list, {});

			// Should have created multiple task instances (7-8 days worth)
			expect(tasks.length).toBeGreaterThanOrEqual(7);
		});

		it("should require client for external tasks", async () => {
			const { userId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				return { userId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await expect(
				asUser.mutation(api.tasks.create, {
					title: "External Task",
					date: Date.now(),
					status: "pending",
					type: "external",
				})
			).rejects.toThrowError("External tasks require a client");
		});

		it("should allow internal tasks without client", async () => {
			await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const taskId = await asUser.mutation(api.tasks.create, {
				title: "Internal Task",
				date: Date.now(),
				status: "pending",
				type: "internal",
			});

			expect(taskId).toBeDefined();

			const task = await asUser.query(api.tasks.get, { id: taskId });
			expect(task).toMatchObject({
				title: "Internal Task",
				type: "internal",
			});
			expect(task?.clientId).toBeUndefined();
		});
	});

	describe("list", () => {
		it("should return empty array when no tasks exist", async () => {
			await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const tasks = await asUser.query(api.tasks.list, {});
			expect(tasks).toEqual([]);
		});

		it("should filter tasks by status", async () => {
			const { userId, clientId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			// Create tasks with different statuses
			await asUser.mutation(api.tasks.create, {
				title: "Pending Task",
				date: Date.now(),
				status: "pending",
				clientId,
				type: "external",
			});

			await asUser.mutation(api.tasks.create, {
				title: "Completed Task",
				date: Date.now(),
				status: "completed",
				clientId,
				type: "external",
			});

			const pendingTasks = await asUser.query(api.tasks.list, {
				status: "pending",
			});
			expect(pendingTasks).toHaveLength(1);
			expect(pendingTasks[0].title).toBe("Pending Task");

			const completedTasks = await asUser.query(api.tasks.list, {
				status: "completed",
			});
			expect(completedTasks).toHaveLength(1);
			expect(completedTasks[0].title).toBe("Completed Task");
		});

		it("should filter tasks by clientId", async () => {
			const { userId, clientId1, clientId2 } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId1 = await ctx.db.insert("clients", {
					orgId,
					companyName: "Client 1",
					status: "active",
				});

				const clientId2 = await ctx.db.insert("clients", {
					orgId,
					companyName: "Client 2",
					status: "active",
				});

				return { userId, clientId1, clientId2 };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.tasks.create, {
				title: "Task for Client 1",
				date: Date.now(),
				status: "pending",
				clientId: clientId1,
				type: "external",
			});

			await asUser.mutation(api.tasks.create, {
				title: "Task for Client 2",
				date: Date.now(),
				status: "pending",
				clientId: clientId2,
				type: "external",
			});

			const client1Tasks = await asUser.query(api.tasks.list, {
				clientId: clientId1,
			});
			expect(client1Tasks).toHaveLength(1);
			expect(client1Tasks[0].title).toBe("Task for Client 1");
		});

		it("should apply date range when combined with an entity filter", async () => {
			const { clientId1, clientId2 } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId1 = await ctx.db.insert("clients", {
					orgId,
					companyName: "Client 1",
					status: "active",
				});

				const clientId2 = await ctx.db.insert("clients", {
					orgId,
					companyName: "Client 2",
					status: "active",
				});

				return { clientId1, clientId2 };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const inRange = Date.UTC(2026, 6, 15);
			const outOfRange = Date.UTC(2026, 7, 15);

			await asUser.mutation(api.tasks.create, {
				title: "Client 1 July Task",
				date: inRange,
				status: "pending",
				clientId: clientId1,
				type: "external",
			});

			await asUser.mutation(api.tasks.create, {
				title: "Client 1 August Task",
				date: outOfRange,
				status: "pending",
				clientId: clientId1,
				type: "external",
			});

			await asUser.mutation(api.tasks.create, {
				title: "Client 2 July Task",
				date: inRange,
				status: "pending",
				clientId: clientId2,
				type: "external",
			});

			const tasks = await asUser.query(api.tasks.list, {
				clientId: clientId1,
				dateFrom: Date.UTC(2026, 6, 1),
				dateTo: Date.UTC(2026, 6, 31),
			});

			expect(tasks).toHaveLength(1);
			expect(tasks[0].title).toBe("Client 1 July Task");
		});

		it.skip("should only show assigned tasks for member users", async () => {
			const { member1Id, member2Id, clientId } = await t.run(async (ctx) => {
				const adminId = await ctx.db.insert("users", {
					name: "Admin User",
					email: "admin@example.com",
					image: "https://example.com/image.jpg",
					externalId: "admin_123",
				});

				const member1Id = await ctx.db.insert("users", {
					name: "Member 1",
					email: "member1@example.com",
					image: "https://example.com/image.jpg",
					externalId: "member1_123",
				});

				const member2Id = await ctx.db.insert("users", {
					name: "Member 2",
					email: "member2@example.com",
					image: "https://example.com/image.jpg",
					externalId: "member2_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: adminId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: adminId,
					role: "admin",
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: member1Id,
					role: "member",
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: member2Id,
					role: "member",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { member1Id, member2Id, clientId };
			});

			const asAdmin = t.withIdentity({
				subject: "admin_123",
				activeOrgId: "org_123",
			});
			const asMember1 = t.withIdentity({
				subject: "member1_123",
				activeOrgId: "org_123",
			});
			const asMember2 = t.withIdentity({
				subject: "member2_123",
				activeOrgId: "org_123",
			});

			// Admin creates tasks assigned to different members
			await asAdmin.mutation(api.tasks.create, {
				title: "Task for Member 1",
				date: Date.now(),
				status: "pending",
				clientId,
				type: "external",
				assigneeUserId: member1Id,
			});

			await asAdmin.mutation(api.tasks.create, {
				title: "Task for Member 2",
				date: Date.now(),
				status: "pending",
				clientId,
				type: "external",
				assigneeUserId: member2Id,
			});

			// Member 1 should only see their own task
			const member1Tasks = await asMember1.query(api.tasks.list, {});
			expect(member1Tasks).toHaveLength(1);
			expect(member1Tasks[0].title).toBe("Task for Member 1");

			// Member 2 should only see their own task
			const member2Tasks = await asMember2.query(api.tasks.list, {});
			expect(member2Tasks).toHaveLength(1);
			expect(member2Tasks[0].title).toBe("Task for Member 2");

			// Admin should see all tasks
			const adminTasks = await asAdmin.query(api.tasks.list, {});
			expect(adminTasks).toHaveLength(2);
		});
	});

	describe("update", () => {
		it("should update task fields", async () => {
			const { userId, clientId, taskId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				const taskId = await ctx.db.insert("tasks", {
					orgId,
					clientId,
					title: "Original Title",
					date: Date.now(),
					status: "pending",
					type: "external",
				});

				return { userId, clientId, taskId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.tasks.update, {
				id: taskId,
				title: "Updated Title",
				description: "New description",
			});

			const task = await asUser.query(api.tasks.get, { id: taskId });
			expect(task).toMatchObject({
				title: "Updated Title",
				description: "New description",
			});
		});

		it("should throw error when updating with empty title", async () => {
			const { userId, clientId, taskId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				const taskId = await ctx.db.insert("tasks", {
					orgId,
					clientId,
					title: "Original Title",
					date: Date.now(),
					status: "pending",
					type: "external",
				});

				return { userId, clientId, taskId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await expect(
				asUser.mutation(api.tasks.update, {
					id: taskId,
					title: "",
				})
			).rejects.toThrowError("Task title cannot be empty");
		});

		it("should reject updating a task from another organization", async () => {
			const { taskId } = await t.run(async (ctx) => {
				const ownerId = await ctx.db.insert("users", {
					name: "Org A Owner",
					email: "a@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_a",
				});
				const orgAId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_a",
					name: "Org A",
					ownerUserId: ownerId,
				});
				await ctx.db.insert("organizationMemberships", {
					orgId: orgAId,
					userId: ownerId,
					role: "admin",
				});
				const taskId = await ctx.db.insert("tasks", {
					orgId: orgAId,
					title: "Org A Task",
					date: Date.now(),
					status: "pending",
					type: "internal",
				});

				const intruderId = await ctx.db.insert("users", {
					name: "Org B Owner",
					email: "b@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_b",
				});
				const orgBId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_b",
					name: "Org B",
					ownerUserId: intruderId,
				});
				await ctx.db.insert("organizationMemberships", {
					orgId: orgBId,
					userId: intruderId,
					role: "admin",
				});

				return { taskId };
			});

			const asOrgB = t.withIdentity({
				subject: "user_b",
				activeOrgId: "org_b",
			});

			await expect(
				asOrgB.mutation(api.tasks.update, {
					id: taskId,
					title: "Hijacked",
				})
			).rejects.toThrowError();
		});
	});

	describe("update — phase 22 mobile edit-sheet paths", () => {
		// These tests lock the tasks.update behavior the Phase 22 mobile edit sheet
		// (Plan 22-03) depends on: repeat/repeatUntil round-trip, external<->internal
		// type switching, and undefined-field filtering. tasks.ts is intentionally
		// unchanged — this is regression coverage for already-observed behavior.

		const date = Date.UTC(2026, 5, 10);
		const until = Date.UTC(2026, 6, 10); // until > date

		async function seedOrgUser(ctx: any) {
			const userId = await ctx.db.insert("users", {
				name: "Test User",
				email: "test@example.com",
				image: "https://example.com/image.jpg",
				externalId: "user_123",
			});

			const orgId = await ctx.db.insert("organizations", {
				clerkOrganizationId: "org_123",
				name: "Test Org",
				ownerUserId: userId,
			});

			await ctx.db.insert("organizationMemberships", {
				orgId,
				userId,
				role: "admin",
			});

			return { userId, orgId };
		}

		function asUser() {
			return t.withIdentity({ subject: "user_123", activeOrgId: "org_123" });
		}

		it("update round-trips repeat and repeatUntil", async () => {
			const { clientId } = await t.run(async (ctx) => {
				const { orgId } = await seedOrgUser(ctx);
				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});
				return { clientId };
			});

			const user = asUser();

			const taskId = await user.mutation(api.tasks.create, {
				title: "Round-trip Task",
				date,
				status: "pending",
				clientId,
				type: "external",
				repeat: "none",
			});

			await user.mutation(api.tasks.update, {
				id: taskId,
				repeat: "weekly",
				repeatUntil: until,
			});

			const task = await user.query(api.tasks.get, { id: taskId });
			expect(task?.repeat).toBe("weekly");
			expect(task?.repeatUntil).toBe(until);
		});

		it("update allows external→internal type switch without a client", async () => {
			const { clientId } = await t.run(async (ctx) => {
				const { orgId } = await seedOrgUser(ctx);
				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});
				return { clientId };
			});

			const user = asUser();

			const taskId = await user.mutation(api.tasks.create, {
				title: "Switch to Internal",
				date,
				status: "pending",
				clientId,
				type: "external",
			});

			// Must NOT throw — switching to internal removes the external→client requirement.
			await user.mutation(api.tasks.update, {
				id: taskId,
				type: "internal",
			});

			const task = await user.query(api.tasks.get, { id: taskId });
			expect(task?.type).toBe("internal");
		});

		it("update keeps external task valid when only repeat changes (existing clientId satisfies the rule)", async () => {
			const { clientId } = await t.run(async (ctx) => {
				const { orgId } = await seedOrgUser(ctx);
				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});
				return { clientId };
			});

			const user = asUser();

			const taskId = await user.mutation(api.tasks.create, {
				title: "Repeat-only Update",
				date,
				status: "pending",
				clientId,
				type: "external",
			});

			// No clientId in the update payload — the existing clientId satisfies the
			// external rule, so this must resolve.
			await user.mutation(api.tasks.update, {
				id: taskId,
				repeat: "daily",
				repeatUntil: until,
			});

			const task = await user.query(api.tasks.get, { id: taskId });
			expect(task?.repeat).toBe("daily");
			expect(task?.clientId).toBe(clientId);
		});

		it("update rejects internal→external when no client is present", async () => {
			await t.run(async (ctx) => {
				await seedOrgUser(ctx);
			});

			const user = asUser();

			const taskId = await user.mutation(api.tasks.create, {
				title: "Internal Task",
				date,
				status: "pending",
				type: "internal",
			});

			// Reverse direction of the type switch the mobile form exposes: switching an
			// internal (clientless) task to external with no client MUST reject.
			await expect(
				user.mutation(api.tasks.update, {
					id: taskId,
					type: "external",
				})
			).rejects.toThrow(/External tasks require a client/);
		});

		it("update filters undefined fields — optional fields cannot be cleared", async () => {
			const { clientId } = await t.run(async (ctx) => {
				const { orgId } = await seedOrgUser(ctx);
				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});
				return { clientId };
			});

			const user = asUser();

			const taskId = await user.mutation(api.tasks.create, {
				title: "Has Description",
				description: "original description",
				date,
				status: "pending",
				clientId,
				type: "external",
			});

			// tasks.update runs filterUndefined (lib/crud.ts) — undefined args are dropped,
			// so optional fields cannot be cleared via update (Plan 22-03 known limitation).
			await user.mutation(api.tasks.update, {
				id: taskId,
				title: "still here",
				description: undefined,
			});

			const task = await user.query(api.tasks.get, { id: taskId });
			expect(task?.title).toBe("still here");
			expect(task?.description).toBe("original description");
		});
	});

	describe("complete", () => {
		it("should mark task as completed", async () => {
			const { userId, clientId, taskId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				const taskId = await ctx.db.insert("tasks", {
					orgId,
					clientId,
					title: "Task to Complete",
					date: Date.now(),
					status: "pending",
					type: "external",
				});

				return { userId, clientId, taskId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.tasks.complete, { id: taskId });

			const task = await asUser.query(api.tasks.get, { id: taskId });
			expect(task?.status).toBe("completed");
			expect(task?.completedAt).toBeDefined();
		});

		it("should throw error when completing already completed task", async () => {
			const { userId, clientId, taskId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				const taskId = await ctx.db.insert("tasks", {
					orgId,
					clientId,
					title: "Completed Task",
					date: Date.now(),
					status: "completed",
					completedAt: Date.now(),
					type: "external",
				});

				return { userId, clientId, taskId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await expect(
				asUser.mutation(api.tasks.complete, { id: taskId })
			).rejects.toThrowError("Task is already completed");
		});
	});

	describe("getStats", () => {
		it("should return correct statistics", async () => {
			const { userId, clientId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			// Create tasks with different statuses
			await asUser.mutation(api.tasks.create, {
				title: "Pending Task 1",
				date: Date.now(),
				status: "pending",
				clientId,
				type: "external",
			});

			await asUser.mutation(api.tasks.create, {
				title: "Pending Task 2",
				date: Date.now(),
				status: "pending",
				clientId,
				type: "external",
			});

			await asUser.mutation(api.tasks.create, {
				title: "In Progress Task",
				date: Date.now(),
				status: "in-progress",
				clientId,
				type: "external",
			});

			await asUser.mutation(api.tasks.create, {
				title: "Completed Task",
				date: Date.now(),
				status: "completed",
				clientId,
				type: "external",
			});

			const stats = await asUser.query(api.tasks.getStats, {});

			expect(stats.total).toBe(4);
			expect(stats.byStatus.pending).toBe(2);
			expect(stats.byStatus.inProgress).toBe(1);
			expect(stats.byStatus.completed).toBe(1);
			expect(stats.byStatus.cancelled).toBe(0);
		});
	});

	describe("remove", () => {
		it("should delete a task", async () => {
			const { userId, clientId, taskId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				const taskId = await ctx.db.insert("tasks", {
					orgId,
					clientId,
					title: "Task to Delete",
					date: Date.now(),
					status: "pending",
					type: "external",
				});

				return { userId, clientId, taskId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.tasks.remove, { id: taskId });

			const task = await asUser.query(api.tasks.get, { id: taskId });
			expect(task).toBeNull();
		});
	});
});
