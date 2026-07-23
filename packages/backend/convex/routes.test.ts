import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestClientProperty,
	createTestIdentity,
	createPremiumTestIdentity,
} from "./test.helpers";

const START = {
	kind: "org" as const,
	label: "HQ",
	latitude: 40.7128,
	longitude: -74.006,
};

const stop = (n: number, overrides: Record<string, unknown> = {}) => ({
	label: `Stop ${n}`,
	latitude: 40.7 + n * 0.01,
	longitude: -74 - n * 0.01,
	order: n,
	...overrides,
});

describe("Routes", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function setupOrg() {
		return await t.run(async (ctx) => await createTestOrg(ctx));
	}

	describe("create", () => {
		it("creates a route for a premium org", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);

			const routeId = await asUser.mutation(api.routes.create, {
				name: "Thursday loop",
				start: START,
				roundTrip: true,
				stops: [stop(0), stop(1)],
			});

			const route = await asUser.query(api.routes.get, { routeId });
			expect(route).toMatchObject({
				name: "Thursday loop",
				status: "draft",
				roundTrip: true,
			});
			expect(route!.stops).toHaveLength(2);
		});

		it("rejects non-premium users", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrg();
			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			await expect(
				asUser.mutation(api.routes.create, {
					name: "Nope",
					start: START,
					roundTrip: false,
					stops: [stop(0)],
				})
			).rejects.toThrow(/Business plan/);
		});

		it("rejects blank names, bad coordinates, and too many stops", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);

			await expect(
				asUser.mutation(api.routes.create, {
					name: "   ",
					start: START,
					roundTrip: false,
					stops: [stop(0)],
				})
			).rejects.toThrow(/name/i);

			await expect(
				asUser.mutation(api.routes.create, {
					name: "Bad coords",
					start: START,
					roundTrip: false,
					stops: [stop(0, { latitude: 123 })],
				})
			).rejects.toThrow(/coordinates/i);

			await expect(
				asUser.mutation(api.routes.create, {
					name: "Too many",
					start: START,
					roundTrip: false,
					stops: Array.from({ length: 25 }, (_, i) => stop(i)),
				})
			).rejects.toThrow(/at most/);
		});

		it("rejects stops referencing another org's property", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrg();
			const foreignPropertyId = await t.run(async (ctx) => {
				const other = await createTestOrg(ctx, {
					clerkUserId: "user_other",
					clerkOrgId: "org_other",
				});
				const clientId = await createTestClient(ctx, other.orgId);
				return await createTestClientProperty(ctx, other.orgId, clientId);
			});

			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			await expect(
				asUser.mutation(api.routes.create, {
					name: "Cross-org",
					start: START,
					roundTrip: false,
					stops: [stop(0, { propertyId: foreignPropertyId })],
				})
			).rejects.toThrow(/organization/i);
		});
	});

	describe("list / get org isolation", () => {
		it("only returns the caller org's routes", async () => {
			const orgA = await setupOrg();
			const orgB = await t.run(
				async (ctx) =>
					await createTestOrg(ctx, {
						clerkUserId: "user_b",
						clerkOrgId: "org_b",
					})
			);

			const asA = t.withIdentity(
				createPremiumTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);
			const asB = t.withIdentity(
				createPremiumTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
			);

			const routeId = await asA.mutation(api.routes.create, {
				name: "A's route",
				start: START,
				roundTrip: false,
				stops: [stop(0)],
			});

			expect(await asA.query(api.routes.list, {})).toHaveLength(1);
			expect(await asB.query(api.routes.list, {})).toHaveLength(0);
			expect(await asB.query(api.routes.get, { routeId })).toBeNull();

			await expect(
				asB.mutation(api.routes.update, { routeId, name: "stolen" })
			).rejects.toThrow(/organization/i);
			await expect(
				asB.mutation(api.routes.remove, { routeId })
			).rejects.toThrow(/organization/i);
		});

		it("returns empty for unauthenticated callers", async () => {
			expect(await t.query(api.routes.list, {})).toEqual([]);
		});
	});

	describe("update", () => {
		it("clears computed results when inputs change, keeps them otherwise", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);

			const routeId = await asUser.mutation(api.routes.create, {
				name: "Computed",
				start: START,
				roundTrip: false,
				stops: [stop(0), stop(1)],
			});

			// Simulate a computed result.
			await t.run(async (ctx) => {
				await ctx.db.patch(routeId, {
					optimized: true,
					geometry: "abc123",
					totalDistanceMeters: 1000,
					totalDurationSeconds: 600,
					legs: [{ distanceMeters: 1000, durationSeconds: 600 }],
					computedAt: 1234567890,
				});
			});

			// Rename only → computed result preserved.
			await asUser.mutation(api.routes.update, {
				routeId,
				name: "Renamed",
			});
			let route = await asUser.query(api.routes.get, { routeId });
			expect(route!.geometry).toBe("abc123");
			expect(route!.optimized).toBe(true);

			// Stop change → computed result cleared.
			await asUser.mutation(api.routes.update, {
				routeId,
				stops: [stop(0)],
			});
			route = await asUser.query(api.routes.get, { routeId });
			expect(route!.geometry).toBeUndefined();
			expect(route!.optimized).toBeUndefined();
			expect(route!.legs).toBeUndefined();
			expect(route!.totalDistanceMeters).toBeUndefined();
			expect(route!.computedAt).toBeUndefined();
		});

		it("rejects empty update payloads", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const routeId = await asUser.mutation(api.routes.create, {
				name: "R",
				start: START,
				roundTrip: false,
				stops: [stop(0)],
			});

			await expect(
				asUser.mutation(api.routes.update, { routeId })
			).rejects.toThrow(/No updates/);
		});
	});

	describe("remove", () => {
		it("deletes a route", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const routeId = await asUser.mutation(api.routes.create, {
				name: "Gone",
				start: START,
				roundTrip: false,
				stops: [stop(0)],
			});

			await asUser.mutation(api.routes.remove, { routeId });
			expect(await asUser.query(api.routes.get, { routeId })).toBeNull();
			expect(await asUser.query(api.routes.list, {})).toHaveLength(0);
		});
	});
});
