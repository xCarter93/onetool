import { describe, it, expect, beforeEach } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { PREMIUM_PLAN_SLUG } from "./lib/permissions";
import {
	FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT,
	FREE_MAX_CLIENTS,
} from "./lib/planLimits";

// Free-plan ceilings are enforced in the create mutations via lib/planCaps.ts,
// which the automation create_record executor shares. Test orgs have no
// clerkPlanSlug, so they are free-plan by default.
describe("free-plan create caps", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedOrg() {
		const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) =>
			createTestOrg(ctx)
		);
		return {
			orgId,
			asUser: t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId)),
		};
	}

	/** Flip the org doc to the paid plan (hasPremiumAccess falls back to it). */
	async function makePaid(orgId: Id<"organizations">) {
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, {
				clerkPlanSlug: PREMIUM_PLAN_SLUG,
				subscriptionStatus: "active",
			});
		});
	}

	/** Sequential — never Promise.all across components (aggregate cross-wiring). */
	async function createClients(
		asUser: ReturnType<typeof t.withIdentity>,
		count: number,
		status: "active" | "archived" = "active"
	) {
		const ids: Id<"clients">[] = [];
		for (let i = 0; i < count; i++) {
			ids.push(
				await asUser.mutation(api.clients.create, {
					companyName: `Client ${i}`,
					status,
				})
			);
		}
		return ids;
	}

	async function expectPlanLimit(promise: Promise<unknown>) {
		let caught: unknown;
		try {
			await promise;
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeDefined();
		// The stable code is the contract clients branch on.
		const payload =
			caught instanceof ConvexError ? caught.data : String(caught);
		expect(JSON.stringify(payload)).toContain("PLAN_LIMIT_REACHED");
	}

	describe("clients.create", () => {
		it("allows creates under the cap", async () => {
			const { asUser } = await seedOrg();
			const ids = await createClients(asUser, FREE_MAX_CLIENTS - 1);
			expect(ids).toHaveLength(FREE_MAX_CLIENTS - 1);
			await expect(
				asUser.mutation(api.clients.create, {
					companyName: "One more",
					status: "active",
				})
			).resolves.toBeDefined();
		});

		it("rejects the create that would exceed the cap", async () => {
			const { asUser } = await seedOrg();
			await createClients(asUser, FREE_MAX_CLIENTS);
			await expectPlanLimit(
				asUser.mutation(api.clients.create, {
					companyName: "Over the line",
					status: "active",
				})
			);
		});

		it("archived clients don't consume a slot", async () => {
			const { asUser, orgId } = await seedOrg();
			await createClients(asUser, FREE_MAX_CLIENTS);
			await t.run(async (ctx) => {
				const clients = await ctx.db
					.query("clients")
					.withIndex("by_org", (q) => q.eq("orgId", orgId))
					.collect();
				await ctx.db.patch(clients[0]._id, { status: "archived" });
			});
			await expect(
				asUser.mutation(api.clients.create, {
					companyName: "Backfill",
					status: "active",
				})
			).resolves.toBeDefined();
		});

		it("paid plan bypasses the cap", async () => {
			const { asUser, orgId } = await seedOrg();
			await createClients(asUser, FREE_MAX_CLIENTS);
			await makePaid(orgId);
			await expect(
				asUser.mutation(api.clients.create, {
					companyName: "Paid extra",
					status: "active",
				})
			).resolves.toBeDefined();
		});

		it("premium override flag bypasses the cap", async () => {
			const { asUser, orgId } = await seedOrg();
			await createClients(asUser, FREE_MAX_CLIENTS);
			await t.run(async (ctx) => {
				await ctx.db.patch(orgId, { hasPremiumFeatureAccess: true });
			});
			await expect(
				asUser.mutation(api.clients.create, {
					companyName: "Override extra",
					status: "active",
				})
			).resolves.toBeDefined();
		});
	});

	describe("projects.create", () => {
		async function seedClient() {
			const { asUser, orgId } = await seedOrg();
			const [clientId] = await createClients(asUser, 1);
			return { asUser, orgId, clientId };
		}

		async function createProjects(
			asUser: ReturnType<typeof t.withIdentity>,
			clientId: Id<"clients">,
			count: number,
			status: "planned" | "in-progress" | "completed" | "cancelled" = "planned"
		) {
			for (let i = 0; i < count; i++) {
				await asUser.mutation(api.projects.create, {
					clientId,
					title: `Project ${status} ${i}`,
					status,
					projectType: "one-off",
				});
			}
		}

		it("allows creates under the per-client cap", async () => {
			const { asUser, clientId } = await seedClient();
			await createProjects(
				asUser,
				clientId,
				FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT - 1
			);
			await expect(
				asUser.mutation(api.projects.create, {
					clientId,
					title: "Last slot",
					status: "planned",
					projectType: "one-off",
				})
			).resolves.toBeDefined();
		});

		it("rejects a fourth active project on the same client", async () => {
			const { asUser, clientId } = await seedClient();
			await createProjects(
				asUser,
				clientId,
				FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT
			);
			await expectPlanLimit(
				asUser.mutation(api.projects.create, {
					clientId,
					title: "Too many",
					status: "in-progress",
					projectType: "one-off",
				})
			);
		});

		it("completed and cancelled projects don't consume a slot", async () => {
			const { asUser, clientId } = await seedClient();
			await createProjects(asUser, clientId, 5, "completed");
			await createProjects(asUser, clientId, 5, "cancelled");
			await createProjects(
				asUser,
				clientId,
				FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT - 1
			);
			await expect(
				asUser.mutation(api.projects.create, {
					clientId,
					title: "Still allowed",
					status: "planned",
					projectType: "one-off",
				})
			).resolves.toBeDefined();
		});

		it("the cap is per client, not per org", async () => {
			const { asUser, clientId } = await seedClient();
			await createProjects(
				asUser,
				clientId,
				FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT
			);
			const otherId = await asUser.mutation(api.clients.create, {
				companyName: "Other client",
				status: "active",
			});
			await expect(
				asUser.mutation(api.projects.create, {
					clientId: otherId,
					title: "Fresh client",
					status: "planned",
					projectType: "one-off",
				})
			).resolves.toBeDefined();
		});

		it("creating a completed project is allowed at the cap", async () => {
			const { asUser, clientId } = await seedClient();
			await createProjects(
				asUser,
				clientId,
				FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT
			);
			await expect(
				asUser.mutation(api.projects.create, {
					clientId,
					title: "Archived-style",
					status: "completed",
					projectType: "one-off",
				})
			).resolves.toBeDefined();
		});

		it("paid plan bypasses the cap", async () => {
			const { asUser, orgId, clientId } = await seedClient();
			await createProjects(
				asUser,
				clientId,
				FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT
			);
			await makePaid(orgId);
			await expect(
				asUser.mutation(api.projects.create, {
					clientId,
					title: "Paid extra",
					status: "planned",
					projectType: "one-off",
				})
			).resolves.toBeDefined();
		});

		it("reviving a completed project faces the cap", async () => {
			const { asUser, clientId } = await seedClient();
			await createProjects(
				asUser,
				clientId,
				FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT
			);
			const doneId = await asUser.mutation(api.projects.create, {
				clientId,
				title: "Finished",
				status: "completed",
				projectType: "one-off",
			});
			await expectPlanLimit(
				asUser.mutation(api.projects.update, {
					id: doneId,
					status: "in-progress",
				})
			);
		});

		it("moving an active project onto a full client faces that client's cap", async () => {
			const { asUser, clientId } = await seedClient();
			await createProjects(
				asUser,
				clientId,
				FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT
			);
			const otherId = await asUser.mutation(api.clients.create, {
				companyName: "Other client",
				status: "active",
			});
			const movingId = await asUser.mutation(api.projects.create, {
				clientId: otherId,
				title: "Moving",
				status: "planned",
				projectType: "one-off",
			});
			await expectPlanLimit(
				asUser.mutation(api.projects.update, {
					id: movingId,
					clientId,
				})
			);
		});

		it("editing a project that already holds its slot still works at the cap", async () => {
			const { asUser, clientId } = await seedClient();
			await createProjects(
				asUser,
				clientId,
				FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT
			);
			const activeId = await t.run(async (ctx) => {
				const rows = await ctx.db
					.query("projects")
					.withIndex("by_client", (q) => q.eq("clientId", clientId))
					.collect();
				return rows[0]._id;
			});
			await expect(
				asUser.mutation(api.projects.update, {
					id: activeId,
					title: "Renamed",
					status: "in-progress",
				})
			).resolves.toBeDefined();
		});
	});

	// The ceiling counts states, not inserts: a client coming back from the
	// archive occupies a slot exactly like a fresh create.
	describe("client status transitions", () => {
		/** Fills the org to the cap and leaves one archived client behind. */
		async function seedFullOrgWithArchived() {
			const { asUser, orgId } = await seedOrg();
			const ids = await createClients(asUser, FREE_MAX_CLIENTS);
			await t.run(async (ctx) => {
				await ctx.db.patch(ids[0], { status: "archived" });
			});
			// Back to the cap, with ids[0] parked in the archive.
			await asUser.mutation(api.clients.create, {
				companyName: "Refill",
				status: "active",
			});
			return { asUser, orgId, archivedId: ids[0], activeId: ids[1] };
		}

		it("restore is refused at the cap", async () => {
			const { asUser, archivedId } = await seedFullOrgWithArchived();
			await expectPlanLimit(
				asUser.mutation(api.clients.restore, { id: archivedId })
			);
		});

		it("un-archiving through clients.update is refused at the cap", async () => {
			const { asUser, archivedId } = await seedFullOrgWithArchived();
			await expectPlanLimit(
				asUser.mutation(api.clients.update, {
					id: archivedId,
					status: "active",
				})
			);
		});

		it("a client that already holds a slot can still be edited at the cap", async () => {
			const { asUser, activeId } = await seedFullOrgWithArchived();
			await expect(
				asUser.mutation(api.clients.update, {
					id: activeId,
					status: "inactive",
				})
			).resolves.toBeDefined();
		});

		it("paid plan can still restore at the cap", async () => {
			const { asUser, orgId, archivedId } = await seedFullOrgWithArchived();
			await makePaid(orgId);
			await expect(
				asUser.mutation(api.clients.restore, { id: archivedId })
			).resolves.toBeDefined();
		});
	});
});
