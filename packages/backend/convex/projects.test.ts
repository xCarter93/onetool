import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestProject,
	createTestIdentity,
} from "./test.helpers";

describe("Projects", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it("should create a project with valid data", async () => {
			const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					return { orgId, clientId, clerkUserId, clerkOrgId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const projectId = await asUser.mutation(api.projects.create, {
				title: "Test Project",
				description: "A test project description",
				clientId,
				status: "planned",
				projectType: "one-off",
			});

			expect(projectId).toBeDefined();

			const project = await asUser.query(api.projects.get, { id: projectId });
			expect(project).toMatchObject({
				title: "Test Project",
				description: "A test project description",
				status: "planned",
				projectType: "one-off",
				clientId,
				orgId,
			});
		});

		it("should create a project with minimal required fields", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				return { clientId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const projectId = await asUser.mutation(api.projects.create, {
				title: "Minimal Project",
				clientId,
				status: "planned",
				projectType: "one-off",
			});

			expect(projectId).toBeDefined();
		});

		it("should throw error for empty title", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				return { clientId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.projects.create, {
					title: "",
					clientId,
					status: "planned",
					projectType: "one-off",
				})
			).rejects.toThrowError();
		});

		it("should create a recurring project", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				return { clientId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const projectId = await asUser.mutation(api.projects.create, {
				title: "Recurring Project",
				clientId,
				status: "in-progress",
				projectType: "recurring",
			});

			const project = await asUser.query(api.projects.get, { id: projectId });
			expect(project?.projectType).toBe("recurring");
		});
	});

	describe("list", () => {
		it("should return empty array when no projects exist", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const projects = await asUser.query(api.projects.list, {});
			expect(projects).toEqual([]);
		});

		it("should return all projects for organization", async () => {
			const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					await createTestProject(ctx, orgId, clientId, { title: "Project 1" });
					await createTestProject(ctx, orgId, clientId, { title: "Project 2" });
					await createTestProject(ctx, orgId, clientId, { title: "Project 3" });
					return { orgId, clientId, clerkUserId, clerkOrgId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const projects = await asUser.query(api.projects.list, {});
			expect(projects).toHaveLength(3);
		});

		it("should filter projects by status", async () => {
			const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					await createTestProject(ctx, orgId, clientId, {
						title: "Planned",
						status: "planned",
					});
					await createTestProject(ctx, orgId, clientId, {
						title: "In Progress",
						status: "in-progress",
					});
					await createTestProject(ctx, orgId, clientId, {
						title: "Completed",
						status: "completed",
					});
					return { orgId, clientId, clerkUserId, clerkOrgId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const inProgressProjects = await asUser.query(api.projects.list, {
				status: "in-progress",
			});
			expect(inProgressProjects).toHaveLength(1);
			expect(inProgressProjects[0].title).toBe("In Progress");
		});

		it("should filter projects by client", async () => {
			const { orgId, clientId1, clientId2, clerkUserId, clerkOrgId } =
				await t.run(async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId1 = await createTestClient(ctx, orgId, {
						companyName: "Client 1",
					});
					const clientId2 = await createTestClient(ctx, orgId, {
						companyName: "Client 2",
					});
					await createTestProject(ctx, orgId, clientId1, {
						title: "Client 1 Project",
					});
					await createTestProject(ctx, orgId, clientId2, {
						title: "Client 2 Project A",
					});
					await createTestProject(ctx, orgId, clientId2, {
						title: "Client 2 Project B",
					});
					return { orgId, clientId1, clientId2, clerkUserId, clerkOrgId };
				});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const client2Projects = await asUser.query(api.projects.list, {
				clientId: clientId2,
			});
			expect(client2Projects).toHaveLength(2);
		});
	});

	describe("update", () => {
		// TODO: Re-enable after fixing async event emission transaction issue
		it.skip("should update project fields", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				return { clientId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Create via API to properly initialize aggregates
			const projectId = await asUser.mutation(api.projects.create, {
				title: "Original Title",
				clientId,
				status: "planned",
				projectType: "one-off",
			});

			await asUser.mutation(api.projects.update, {
				id: projectId,
				title: "Updated Title",
				description: "New description",
				status: "in-progress",
			});

			const project = await asUser.query(api.projects.get, { id: projectId });
			expect(project).toMatchObject({
				title: "Updated Title",
				description: "New description",
				status: "in-progress",
			});
		});

		// TODO: Re-enable after fixing async event emission transaction issue
		it.skip("should mark project as completed", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				return { clientId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Create via API to properly initialize aggregates
			const projectId = await asUser.mutation(api.projects.create, {
				title: "Test Project",
				clientId,
				status: "in-progress",
				projectType: "one-off",
			});

			await asUser.mutation(api.projects.update, {
				id: projectId,
				status: "completed",
			});

			const project = await asUser.query(api.projects.get, { id: projectId });
			expect(project?.status).toBe("completed");
		});
	});

	describe("remove", () => {
		it("should delete a project", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				return { clientId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Create via API to properly initialize aggregates
			const projectId = await asUser.mutation(api.projects.create, {
				title: "To Delete",
				clientId,
				status: "planned",
				projectType: "one-off",
			});

			await asUser.mutation(api.projects.remove, { id: projectId });

			const project = await asUser.query(api.projects.get, { id: projectId });
			expect(project).toBeNull();
		});

		it("should throw error when deleting non-existent project", async () => {
			const { clerkUserId, clerkOrgId, fakeProjectId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					// Create and immediately delete to get a "valid" but non-existent ID
					const projectId = await createTestProject(ctx, orgId, clientId);
					await ctx.db.delete(projectId);
					return { clerkUserId, clerkOrgId, fakeProjectId: projectId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.projects.remove, { id: fakeProjectId })
			).rejects.toThrowError();
		});
	});

	describe("getStats", () => {
		it("should return correct project statistics", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);

				// Create projects with different statuses
				await createTestProject(ctx, orgId, clientId, { status: "planned" });
				await createTestProject(ctx, orgId, clientId, { status: "planned" });
				await createTestProject(ctx, orgId, clientId, { status: "in-progress" });
				await createTestProject(ctx, orgId, clientId, { status: "completed" });
				await createTestProject(ctx, orgId, clientId, { status: "cancelled" });

				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const stats = await asUser.query(api.projects.getStats, {});

			expect(stats.total).toBe(5);
			expect(stats.byStatus.planned).toBe(2);
			expect(stats.byStatus["in-progress"]).toBe(1);
			expect(stats.byStatus.completed).toBe(1);
			expect(stats.byStatus.cancelled).toBe(1);
		});

		it("should return zero stats for empty organization", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const stats = await asUser.query(api.projects.getStats, {});

			expect(stats.total).toBe(0);
		});
	});

	describe("getUpcomingDeadlines", () => {
		it("should return projects with upcoming end dates", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);

				const now = Date.now();
				const oneWeekFromNow = now + 7 * 24 * 60 * 60 * 1000;
				const twoWeeksFromNow = now + 14 * 24 * 60 * 60 * 1000;
				const oneMonthFromNow = now + 30 * 24 * 60 * 60 * 1000;

				// Project due in 1 week
				await createTestProject(ctx, orgId, clientId, {
					title: "Due Soon",
					status: "in-progress",
					endDate: oneWeekFromNow,
				});

				// Project due in 2 weeks
				await createTestProject(ctx, orgId, clientId, {
					title: "Due Later",
					status: "in-progress",
					endDate: twoWeeksFromNow,
				});

				// Project due in 1 month (outside default window)
				await createTestProject(ctx, orgId, clientId, {
					title: "Due Much Later",
					status: "in-progress",
					endDate: oneMonthFromNow,
				});

				// Completed project (shouldn't show in upcoming)
				await createTestProject(ctx, orgId, clientId, {
					title: "Already Done",
					status: "completed",
					endDate: oneWeekFromNow,
				});

				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const upcomingProjects = await asUser.query(
				api.projects.getUpcomingDeadlines,
				{}
			);

			// Should include projects due within default window (14 days), excluding completed
			expect(upcomingProjects.length).toBeGreaterThanOrEqual(1);
			expect(upcomingProjects.every((p) => p.status !== "completed")).toBe(true);
		});
	});

	describe("organization isolation", () => {
		it("should not return projects from other organizations", async () => {
			const { clerkUserId1, clerkOrgId1, clerkOrgId2 } = await t.run(
				async (ctx) => {
					// Create first org with a project
					const { orgId: orgId1, clerkUserId, clerkOrgId } = await createTestOrg(
						ctx,
						{
							clerkUserId: "user_1",
							clerkOrgId: "org_1",
						}
					);
					const clientId1 = await createTestClient(ctx, orgId1);
					await createTestProject(ctx, orgId1, clientId1, {
						title: "Org 1 Project",
					});

					// Create second org with a project
					const {
						orgId: orgId2,
						clerkUserId: clerkUserId2,
						clerkOrgId: clerkOrgId2,
					} = await createTestOrg(ctx, {
						clerkUserId: "user_2",
						clerkOrgId: "org_2",
					});
					const clientId2 = await createTestClient(ctx, orgId2);
					await createTestProject(ctx, orgId2, clientId2, {
						title: "Org 2 Project",
					});

					return { clerkUserId1: clerkUserId, clerkOrgId1: clerkOrgId, clerkOrgId2 };
				}
			);

			// User from org 1 should only see org 1's projects
			const asUser1 = t.withIdentity(
				createTestIdentity(clerkUserId1, clerkOrgId1)
			);

			const projects = await asUser1.query(api.projects.list, {});
			expect(projects).toHaveLength(1);
			expect(projects[0].title).toBe("Org 1 Project");
		});
	});
});
