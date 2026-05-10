import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestProject,
	createTestTask,
	createTestIdentity,
} from "./test.helpers";

describe("Calendar", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("getCalendarEvents", () => {
		it("should return empty arrays when no events exist", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const now = Date.now();
			const result = await asUser.query(api.calendar.getCalendarEvents, {
				startDate: now,
				endDate: now + 7 * 24 * 60 * 60 * 1000, // 7 days
			});

			expect(result).toEqual({ projects: [], tasks: [] });
		});

		it("should return empty result when user is not authenticated", async () => {
			const now = Date.now();
			const result = await t.query(api.calendar.getCalendarEvents, {
				startDate: now,
				endDate: now + 7 * 24 * 60 * 60 * 1000,
			});

			expect(result).toEqual({ projects: [], tasks: [] });
		});

		it("should return tasks within the date range", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId, {
					companyName: "Test Client",
				});

				const now = Date.now();
				// Task within range
				await createTestTask(ctx, org.orgId, {
					title: "Task In Range",
					date: now + 2 * 24 * 60 * 60 * 1000, // 2 days from now
					clientId,
					type: "external",
				});

				// Task outside range (before)
				await createTestTask(ctx, org.orgId, {
					title: "Task Before Range",
					date: now - 2 * 24 * 60 * 60 * 1000, // 2 days ago
					clientId,
					type: "external",
				});

				// Task outside range (after)
				await createTestTask(ctx, org.orgId, {
					title: "Task After Range",
					date: now + 10 * 24 * 60 * 60 * 1000, // 10 days from now
					clientId,
					type: "external",
				});

				return { ...org, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const now = Date.now();
			const result = await asUser.query(api.calendar.getCalendarEvents, {
				startDate: now,
				endDate: now + 7 * 24 * 60 * 60 * 1000, // 7 days
			});

			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].title).toBe("Task In Range");
			expect(result.tasks[0].type).toBe("task");
			expect(result.tasks[0].clientName).toBe("Test Client");
		});

		it("should return projects that overlap with the date range", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId, {
					companyName: "Project Client",
				});

				const now = Date.now();
				const dayMs = 24 * 60 * 60 * 1000;

				// Project fully within range
				await createTestProject(ctx, org.orgId, clientId, {
					title: "Project In Range",
					startDate: now + 1 * dayMs,
					endDate: now + 5 * dayMs,
				});

				// Project starting before, ending within range
				await createTestProject(ctx, org.orgId, clientId, {
					title: "Project Overlap Start",
					startDate: now - 3 * dayMs,
					endDate: now + 2 * dayMs,
				});

				// Project starting within, ending after range
				await createTestProject(ctx, org.orgId, clientId, {
					title: "Project Overlap End",
					startDate: now + 5 * dayMs,
					endDate: now + 15 * dayMs,
				});

				// Project entirely before range
				await createTestProject(ctx, org.orgId, clientId, {
					title: "Project Before Range",
					startDate: now - 10 * dayMs,
					endDate: now - 5 * dayMs,
				});

				// Project without startDate (should not appear)
				await createTestProject(ctx, org.orgId, clientId, {
					title: "Project No Dates",
				});

				return org;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const now = Date.now();
			const result = await asUser.query(api.calendar.getCalendarEvents, {
				startDate: now,
				endDate: now + 7 * 24 * 60 * 60 * 1000,
			});

			expect(result.projects).toHaveLength(3);
			const projectTitles = result.projects.map((p) => p.title);
			expect(projectTitles).toContain("Project In Range");
			expect(projectTitles).toContain("Project Overlap Start");
			expect(projectTitles).toContain("Project Overlap End");
			expect(projectTitles).not.toContain("Project Before Range");
			expect(projectTitles).not.toContain("Project No Dates");
		});

		it("should include client names for tasks and projects", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId, {
					companyName: "Acme Corp",
				});

				const now = Date.now();

				await createTestTask(ctx, org.orgId, {
					title: "Client Task",
					date: now + 1 * 24 * 60 * 60 * 1000,
					clientId,
					type: "external",
				});

				await createTestProject(ctx, org.orgId, clientId, {
					title: "Client Project",
					startDate: now + 1 * 24 * 60 * 60 * 1000,
				});

				return org;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const now = Date.now();
			const result = await asUser.query(api.calendar.getCalendarEvents, {
				startDate: now,
				endDate: now + 7 * 24 * 60 * 60 * 1000,
			});

			expect(result.tasks[0].clientName).toBe("Acme Corp");
			expect(result.projects[0].clientName).toBe("Acme Corp");
		});

		it("should show 'Internal Task' for internal tasks without client", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);

				const now = Date.now();
				await createTestTask(ctx, org.orgId, {
					title: "Internal Meeting",
					date: now + 1 * 24 * 60 * 60 * 1000,
					type: "internal",
				});

				return org;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const now = Date.now();
			const result = await asUser.query(api.calendar.getCalendarEvents, {
				startDate: now,
				endDate: now + 7 * 24 * 60 * 60 * 1000,
			});

			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].title).toBe("Internal Meeting");
			expect(result.tasks[0].clientName).toBe("Internal Task");
		});

		it("should enforce organization isolation for calendar events", async () => {
			const { clerkUserId: user1ClerkId, clerkOrgId: org1ClerkId } = await t.run(
				async (ctx) => {
					// Create first organization
					const org1 = await createTestOrg(ctx, {
						clerkUserId: "user_org1",
						clerkOrgId: "org_1",
					});
					const client1 = await createTestClient(ctx, org1.orgId, {
						companyName: "Org1 Client",
					});

					const now = Date.now();
					await createTestTask(ctx, org1.orgId, {
						title: "Org1 Task",
						date: now + 1 * 24 * 60 * 60 * 1000,
						clientId: client1,
						type: "external",
					});
					await createTestProject(ctx, org1.orgId, client1, {
						title: "Org1 Project",
						startDate: now + 1 * 24 * 60 * 60 * 1000,
					});

					// Create second organization
					const org2 = await createTestOrg(ctx, {
						clerkUserId: "user_org2",
						clerkOrgId: "org_2",
					});
					const client2 = await createTestClient(ctx, org2.orgId, {
						companyName: "Org2 Client",
					});

					await createTestTask(ctx, org2.orgId, {
						title: "Org2 Task",
						date: now + 1 * 24 * 60 * 60 * 1000,
						clientId: client2,
						type: "external",
					});
					await createTestProject(ctx, org2.orgId, client2, {
						title: "Org2 Project",
						startDate: now + 1 * 24 * 60 * 60 * 1000,
					});

					return org1;
				}
			);

			const asOrg1User = t.withIdentity(createTestIdentity(user1ClerkId, org1ClerkId));

			const now = Date.now();
			const result = await asOrg1User.query(api.calendar.getCalendarEvents, {
				startDate: now,
				endDate: now + 7 * 24 * 60 * 60 * 1000,
			});

			// Should only see org1's events
			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].title).toBe("Org1 Task");
			expect(result.projects).toHaveLength(1);
			expect(result.projects[0].title).toBe("Org1 Project");
		});

		it("should include task time information in calendar events", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);

				const now = Date.now();
				await createTestTask(ctx, org.orgId, {
					title: "Timed Task",
					date: now + 1 * 24 * 60 * 60 * 1000,
					startTime: "09:00",
					endTime: "10:30",
					clientId,
					type: "external",
				});

				return org;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const now = Date.now();
			const result = await asUser.query(api.calendar.getCalendarEvents, {
				startDate: now,
				endDate: now + 7 * 24 * 60 * 60 * 1000,
			});

			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].startTime).toBe("09:00");
			expect(result.tasks[0].endTime).toBe("10:30");
		});
	});
});
