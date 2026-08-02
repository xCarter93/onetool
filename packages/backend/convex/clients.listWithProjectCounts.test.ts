import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
	createTestOrg,
	createTestClient,
	createTestIdentity,
} from "./test.helpers";

/**
 * Characterization tests for clients.listWithProjectCounts, written against the
 * pre-WI-6 implementation (per-client project query + org-wide activities scan)
 * and required to pass unmodified against the batched replacement. The existing
 * clients.test.ts cases only covered activeProjects and primaryContact, so
 * lastActivity and the status/archived filters had no gate at all.
 */
describe("clients.listWithProjectCounts", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	/** Activity rows need every required field; keep the noise in one place. */
	async function insertActivity(
		ctx: { db: MutationCtx["db"] },
		args: {
			orgId: Id<"organizations">;
			userId: Id<"users">;
			entityId: string;
			activityType: "client_created" | "client_updated";
			timestamp: number;
		}
	) {
		return await ctx.db.insert("activities", {
			orgId: args.orgId,
			userId: args.userId,
			activityType: args.activityType,
			entityType: "client" as const,
			entityId: args.entityId,
			entityName: "Test Client",
			description: "activity",
			timestamp: args.timestamp,
			isVisible: true,
		});
	}

	it("counts only planned and in-progress projects, per client", async () => {
		const { clientA, clientB, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientA = await createTestClient(ctx, orgId, {
					companyName: "Client A",
				});
				const clientB = await createTestClient(ctx, orgId, {
					companyName: "Client B",
				});

				// A: 2 active (planned + in-progress), 2 inactive.
				for (const status of [
					"planned",
					"in-progress",
					"completed",
					"cancelled",
				] as const) {
					await ctx.db.insert("projects", {
						orgId,
						clientId: clientA,
						title: `A ${status}`,
						status,
						projectType: "one-off" as const,
					});
				}
				// B: 1 active only.
				await ctx.db.insert("projects", {
					orgId,
					clientId: clientB,
					title: "B planned",
					status: "planned" as const,
					projectType: "one-off" as const,
				});

				return { clientA, clientB, clerkUserId, clerkOrgId };
			}
		);

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const clients = await asUser.query(api.clients.listWithProjectCounts, {});

		expect(clients).toHaveLength(2);
		expect(clients.find((c) => c.id === clientA)?.activeProjects).toBe(2);
		expect(clients.find((c) => c.id === clientB)?.activeProjects).toBe(1);
	});

	it("does not attribute one client's projects to another", async () => {
		const { clientA, clientB, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientA = await createTestClient(ctx, orgId, {
					companyName: "Client A",
				});
				const clientB = await createTestClient(ctx, orgId, {
					companyName: "Client B",
				});
				await ctx.db.insert("projects", {
					orgId,
					clientId: clientA,
					title: "A only",
					status: "in-progress" as const,
					projectType: "one-off" as const,
				});
				return { clientA, clientB, clerkUserId, clerkOrgId };
			}
		);

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const clients = await asUser.query(api.clients.listWithProjectCounts, {});

		expect(clients.find((c) => c.id === clientA)?.activeProjects).toBe(1);
		expect(clients.find((c) => c.id === clientB)?.activeProjects).toBe(0);
	});

	it("falls back to the client's creation time when it has no activities", async () => {
		const { clientId, creationTime, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const doc = await ctx.db.get(clientId);
				return {
					clientId,
					creationTime: doc!._creationTime,
					clerkUserId,
					clerkOrgId,
				};
			}
		);

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const clients = await asUser.query(api.clients.listWithProjectCounts, {});

		expect(clients.find((c) => c.id === clientId)?.lastActivity).toBe(
			new Date(creationTime).toISOString()
		);
	});

	it("reports the newest activity's timestamp as lastActivity", async () => {
		// Ordering probe: the OLDER row carries the alphabetically-greater
		// activityType ("client_updated" > "client_created"). The old
		// implementation walked the by_type index (orgId bound, activityType
		// unbound) in descending order, so it hit client_updated first and
		// reported the OLDER timestamp. Binding by_entity orders by _creationTime
		// within the client, which is genuinely newest-first.
		const { clientId, newest, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const { orgId, userId, clerkUserId, clerkOrgId } =
					await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);

				const older = 1_700_000_000_000;
				const newest = older + 60_000;

				await insertActivity(ctx, {
					orgId,
					userId,
					entityId: clientId,
					activityType: "client_updated",
					timestamp: older,
				});
				await insertActivity(ctx, {
					orgId,
					userId,
					entityId: clientId,
					activityType: "client_created",
					timestamp: newest,
				});

				return { clientId, newest, clerkUserId, clerkOrgId };
			}
		);

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const clients = await asUser.query(api.clients.listWithProjectCounts, {});

		expect(clients.find((c) => c.id === clientId)?.lastActivity).toBe(
			new Date(newest).toISOString()
		);
	});

	it("does not read another client's activity as its own", async () => {
		const { clientA, clientB, tsA, creationB, clerkUserId, clerkOrgId } =
			await t.run(async (ctx) => {
				const { orgId, userId, clerkUserId, clerkOrgId } =
					await createTestOrg(ctx);
				const clientA = await createTestClient(ctx, orgId, {
					companyName: "Client A",
				});
				const clientB = await createTestClient(ctx, orgId, {
					companyName: "Client B",
				});

				const tsA = 1_700_000_000_000;
				await insertActivity(ctx, {
					orgId,
					userId,
					entityId: clientA,
					activityType: "client_updated",
					timestamp: tsA,
				});

				const docB = await ctx.db.get(clientB);
				return {
					clientA,
					clientB,
					tsA,
					creationB: docB!._creationTime,
					clerkUserId,
					clerkOrgId,
				};
			});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const clients = await asUser.query(api.clients.listWithProjectCounts, {});

		expect(clients.find((c) => c.id === clientA)?.lastActivity).toBe(
			new Date(tsA).toISOString()
		);
		// B has none of its own — falls back to its creation time.
		expect(clients.find((c) => c.id === clientB)?.lastActivity).toBe(
			new Date(creationB).toISOString()
		);
	});

	it("maps stored statuses to display statuses and hides archived by default", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
			await createTestClient(ctx, orgId, {
				companyName: "Active Co",
				status: "active",
			});
			await createTestClient(ctx, orgId, {
				companyName: "Lead Co",
				status: "lead",
			});
			await createTestClient(ctx, orgId, {
				companyName: "Inactive Co",
				status: "inactive",
			});
			await createTestClient(ctx, orgId, {
				companyName: "Archived Co",
				status: "archived",
			});
			return { clerkUserId, clerkOrgId };
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		const visible = await asUser.query(api.clients.listWithProjectCounts, {});
		expect(visible).toHaveLength(3);
		expect(visible.find((c) => c.name === "Active Co")?.status).toBe("Active");
		expect(visible.find((c) => c.name === "Lead Co")?.status).toBe("Prospect");
		expect(visible.find((c) => c.name === "Inactive Co")?.status).toBe("Paused");
		expect(visible.find((c) => c.name === "Archived Co")).toBeUndefined();

		const withArchived = await asUser.query(
			api.clients.listWithProjectCounts,
			{ includeArchived: true }
		);
		expect(withArchived).toHaveLength(4);
		expect(withArchived.find((c) => c.name === "Archived Co")?.status).toBe(
			"Archived"
		);
	});

	it("honours the status filter", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
			await createTestClient(ctx, orgId, {
				companyName: "Active Co",
				status: "active",
			});
			await createTestClient(ctx, orgId, {
				companyName: "Lead Co",
				status: "lead",
			});
			return { clerkUserId, clerkOrgId };
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const leads = await asUser.query(api.clients.listWithProjectCounts, {
			status: "lead",
		});

		expect(leads).toHaveLength(1);
		expect(leads[0].name).toBe("Lead Co");
		expect(leads[0].status).toBe("Prospect");
	});

	it("returns the primary contact, and null when there is none", async () => {
		const { withContact, withoutContact, clerkUserId, clerkOrgId } =
			await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const withContact = await createTestClient(ctx, orgId, {
					companyName: "Has Contact",
				});
				const withoutContact = await createTestClient(ctx, orgId, {
					companyName: "No Contact",
				});

				// A non-primary contact must not be picked up.
				await ctx.db.insert("clientContacts", {
					clientId: withContact,
					orgId,
					firstName: "Secondary",
					lastName: "Person",
					email: "secondary@example.com",
					isPrimary: false,
				});
				await ctx.db.insert("clientContacts", {
					clientId: withContact,
					orgId,
					firstName: "Jane",
					lastName: "Doe",
					email: "jane@example.com",
					jobTitle: "Owner",
					isPrimary: true,
				});

				return { withContact, withoutContact, clerkUserId, clerkOrgId };
			});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const clients = await asUser.query(api.clients.listWithProjectCounts, {});

		expect(clients.find((c) => c.id === withContact)?.primaryContact).toEqual({
			name: "Jane Doe",
			email: "jane@example.com",
			jobTitle: "Owner",
		});
		expect(
			clients.find((c) => c.id === withoutContact)?.primaryContact
		).toBeNull();
	});

	it("falls back to placeholder strings for a contact missing email/title", async () => {
		const { clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, orgId);
			await ctx.db.insert("clientContacts", {
				clientId,
				orgId,
				firstName: "No",
				lastName: "Details",
				isPrimary: true,
			});
			return { clientId, clerkUserId, clerkOrgId };
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const clients = await asUser.query(api.clients.listWithProjectCounts, {});

		expect(clients.find((c) => c.id === clientId)?.primaryContact).toEqual({
			name: "No Details",
			email: "No email",
			jobTitle: "No title",
		});
	});

	it("scopes clients, project counts and activities to the caller's org", async () => {
		const setup = await t.run(async (ctx) => {
			const a = await createTestOrg(ctx, {
				clerkUserId: "user_lwpc_a",
				clerkOrgId: "org_lwpc_a",
			});
			const b = await createTestOrg(ctx, {
				clerkUserId: "user_lwpc_b",
				clerkOrgId: "org_lwpc_b",
			});

			const clientA = await createTestClient(ctx, a.orgId, {
				companyName: "Org A Client",
			});
			const clientB = await createTestClient(ctx, b.orgId, {
				companyName: "Org B Client",
			});

			await ctx.db.insert("projects", {
				orgId: a.orgId,
				clientId: clientA,
				title: "A project",
				status: "in-progress" as const,
				projectType: "one-off" as const,
			});
			for (let i = 0; i < 3; i++) {
				await ctx.db.insert("projects", {
					orgId: b.orgId,
					clientId: clientB,
					title: `B project ${i}`,
					status: "planned" as const,
					projectType: "one-off" as const,
				});
			}

			await insertActivity(ctx, {
				orgId: b.orgId,
				userId: b.userId,
				entityId: clientB,
				activityType: "client_updated",
				timestamp: 1_700_000_000_000,
			});

			return { a, b, clientA, clientB };
		});

		const asUserA = t.withIdentity(
			createTestIdentity(setup.a.clerkUserId, setup.a.clerkOrgId)
		);
		const asUserB = t.withIdentity(
			createTestIdentity(setup.b.clerkUserId, setup.b.clerkOrgId)
		);

		const listA = await asUserA.query(api.clients.listWithProjectCounts, {});
		expect(listA).toHaveLength(1);
		expect(listA[0].id).toBe(setup.clientA);
		expect(listA[0].activeProjects).toBe(1);

		const listB = await asUserB.query(api.clients.listWithProjectCounts, {});
		expect(listB).toHaveLength(1);
		expect(listB[0].id).toBe(setup.clientB);
		expect(listB[0].activeProjects).toBe(3);
		expect(listB[0].lastActivity).toBe(
			new Date(1_700_000_000_000).toISOString()
		);
	});
});
