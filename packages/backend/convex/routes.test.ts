import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestOrgWithAddress,
	createTestClient,
	createTestProject,
	createTestClientProperty,
	createTestIdentity,
	createPremiumTestIdentity,
	addMemberToOrg,
} from "./test.helpers";
import { MAX_STOPS } from "./routes";
import type { Id } from "./_generated/dataModel";

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

	/** Org with a geocoded address — required by seedFromSchedule/copyToDaily. */
	async function setupOrgWithAddress() {
		return await t.run(
			async (ctx) =>
				await createTestOrgWithAddress(ctx, {
					latitude: 40.7,
					longitude: -74.0,
				})
		);
	}

	const DATE = new Date("2026-07-20T00:00:00.000Z").getTime();

	async function insertTask(
		orgId: Id<"organizations">,
		overrides: Record<string, unknown> = {}
	): Promise<Id<"tasks">> {
		return await t.run(
			async (ctx) =>
				await ctx.db.insert("tasks", {
					orgId,
					title: "Task",
					date: DATE,
					status: "pending",
					...overrides,
				})
		);
	}

	async function insertProject(
		orgId: Id<"organizations">,
		clientId: Id<"clients">,
		overrides: Record<string, unknown> = {}
	): Promise<Id<"projects">> {
		return await t.run(
			async (ctx) =>
				await ctx.db.insert("projects", {
					orgId,
					clientId,
					title: "Project",
					status: "planned",
					projectType: "one-off",
					...overrides,
				})
		);
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

	describe("create kinds", () => {
		it("throws when kind daily is created without a date", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);

			await expect(
				asUser.mutation(api.routes.create, {
					name: "Daily no date",
					kind: "daily",
					start: START,
					roundTrip: false,
					stops: [stop(0)],
				})
			).rejects.toThrow(/Daily routes require a date/);
		});

		it("round-trips kind daily, date, and assigneeUserId", async () => {
			const { clerkUserId, clerkOrgId, userId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);

			const routeId = await asUser.mutation(api.routes.create, {
				name: "Daily",
				kind: "daily",
				date: DATE,
				assigneeUserId: userId,
				start: START,
				roundTrip: false,
				stops: [stop(0)],
			});

			const route = await asUser.query(api.routes.get, { routeId });
			expect(route).toMatchObject({
				kind: "daily",
				date: DATE,
				assigneeUserId: userId,
			});
		});

		it("defaults kind to saved when omitted", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);

			const routeId = await asUser.mutation(api.routes.create, {
				name: "No kind",
				start: START,
				roundTrip: false,
				stops: [stop(0)],
			});

			const route = await asUser.query(api.routes.get, { routeId });
			expect(route!.kind).toBe("saved");
		});
	});

	describe("seedFromSchedule", () => {
		it("orders stops by startTime with taskId provenance and pending status", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propA, propB } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propA = await createTestClientProperty(ctx, orgId, clientId, {
					latitude: 40.71,
					longitude: -74.01,
				});
				const propB = await createTestClientProperty(ctx, orgId, clientId, {
					latitude: 40.72,
					longitude: -74.02,
				});
				return { clientId, propA, propB };
			});
			const taskLate = await insertTask(orgId, {
				clientId,
				propertyId: propB,
				startTime: "14:00",
			});
			const taskEarly = await insertTask(orgId, {
				clientId,
				propertyId: propA,
				startTime: "09:00",
			});

			const result = await asUser.mutation(api.routes.seedFromSchedule, {
				date: DATE,
			});
			expect(result.stopCount).toBe(2);
			expect(result.skippedNoAddress).toBe(0);

			const route = await asUser.query(api.routes.get, {
				routeId: result.routeId,
			});
			expect(route!.stops.map((s) => s.taskId)).toEqual([taskEarly, taskLate]);
			expect(route!.stops.every((s) => s.status === "pending")).toBe(true);
		});

		it("falls back to the client's primary property when task has none", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const clientId = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				await createTestClientProperty(ctx, orgId, clientId, {
					isPrimary: true,
					latitude: 40.71,
					longitude: -74.01,
				});
				return clientId;
			});
			await insertTask(orgId, { clientId });

			const result = await asUser.mutation(api.routes.seedFromSchedule, {
				date: DATE,
			});
			expect(result.stopCount).toBe(1);
		});

		it("counts an ungeocoded property as skippedNoAddress and omits its stop", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propertyId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					orgId,
					clientId
				); // no lat/lng
				return { clientId, propertyId };
			});
			await insertTask(orgId, { clientId, propertyId });

			await expect(
				asUser.mutation(api.routes.seedFromSchedule, { date: DATE })
			).rejects.toThrow(/none of its properties have a mapped address/);
		});

		it("filters tasks by assigneeUserId", async () => {
			const { clerkUserId, clerkOrgId, orgId, userId } =
				await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propA, propB } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propA = await createTestClientProperty(ctx, orgId, clientId, {
					latitude: 40.71,
					longitude: -74.01,
				});
				const propB = await createTestClientProperty(ctx, orgId, clientId, {
					latitude: 40.72,
					longitude: -74.02,
				});
				return { clientId, propA, propB };
			});
			await insertTask(orgId, { clientId, propertyId: propA, assigneeUserId: userId });
			await insertTask(orgId, { clientId, propertyId: propB });

			const result = await asUser.mutation(api.routes.seedFromSchedule, {
				date: DATE,
				assigneeUserId: userId,
			});
			expect(result.stopCount).toBe(1);
		});

		it("includes an in-range one-off project with projectId provenance", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propertyId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					orgId,
					clientId,
					{ latitude: 40.71, longitude: -74.01 }
				);
				return { clientId, propertyId };
			});
			const projectId = await insertProject(orgId, clientId, {
				propertyId,
				startDate: DATE - 86400000,
				endDate: DATE + 86400000,
			});

			const result = await asUser.mutation(api.routes.seedFromSchedule, {
				date: DATE,
			});
			expect(result.stopCount).toBe(1);
			const route = await asUser.query(api.routes.get, {
				routeId: result.routeId,
			});
			expect(route!.stops[0].projectId).toBe(projectId);
			expect(route!.stops[0].taskId).toBeUndefined();
		});

		it("excludes a recurring project even if in date range", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propertyId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					orgId,
					clientId,
					{ latitude: 40.71, longitude: -74.01 }
				);
				return { clientId, propertyId };
			});
			await insertProject(orgId, clientId, {
				propertyId,
				projectType: "recurring",
				startDate: DATE - 86400000,
				endDate: DATE + 86400000,
			});

			await expect(
				asUser.mutation(api.routes.seedFromSchedule, { date: DATE })
			).rejects.toThrow(/No scheduled work/);
		});

		it("excludes a one-off project outside its date range", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propertyId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					orgId,
					clientId,
					{ latitude: 40.71, longitude: -74.01 }
				);
				return { clientId, propertyId };
			});
			await insertProject(orgId, clientId, {
				propertyId,
				startDate: DATE + 5 * 86400000,
				endDate: DATE + 10 * 86400000,
			});

			await expect(
				asUser.mutation(api.routes.seedFromSchedule, { date: DATE })
			).rejects.toThrow(/No scheduled work/);
		});

		it("supersedes a project's stop with a same-day task referencing that project", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propertyId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					orgId,
					clientId,
					{ latitude: 40.71, longitude: -74.01 }
				);
				return { clientId, propertyId };
			});
			const projectId = await insertProject(orgId, clientId, {
				propertyId,
				startDate: DATE - 86400000,
				endDate: DATE + 86400000,
			});
			const taskId = await insertTask(orgId, {
				clientId,
				propertyId,
				projectId,
			});

			const result = await asUser.mutation(api.routes.seedFromSchedule, {
				date: DATE,
			});
			expect(result.stopCount).toBe(1);
			const route = await asUser.query(api.routes.get, {
				routeId: result.routeId,
			});
			expect(route!.stops[0]).toMatchObject({ taskId, projectId });
		});

		it("dedupes a task and project resolving to the same property into one stop", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propertyId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					orgId,
					clientId,
					{ latitude: 40.71, longitude: -74.01 }
				);
				return { clientId, propertyId };
			});
			// Unrelated project (no task references it) resolving to the same property.
			await insertProject(orgId, clientId, {
				propertyId,
				startDate: DATE - 86400000,
				endDate: DATE + 86400000,
			});
			await insertTask(orgId, { clientId, propertyId });

			const result = await asUser.mutation(api.routes.seedFromSchedule, {
				date: DATE,
			});
			expect(result.stopCount).toBe(1);
		});

		it("marks a completed task's stop visited with visitedAt", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propertyId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					orgId,
					clientId,
					{ latitude: 40.71, longitude: -74.01 }
				);
				return { clientId, propertyId };
			});
			await insertTask(orgId, {
				clientId,
				propertyId,
				status: "completed",
				completedAt: 1700000000000,
			});

			const result = await asUser.mutation(api.routes.seedFromSchedule, {
				date: DATE,
			});
			const route = await asUser.query(api.routes.get, {
				routeId: result.routeId,
			});
			expect(route!.stops[0]).toMatchObject({
				status: "visited",
				visitedAt: 1700000000000,
			});
		});

		it("re-seeds the same route id, replaces stops, and clears computed fields", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propA, propB } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propA = await createTestClientProperty(ctx, orgId, clientId, {
					latitude: 40.71,
					longitude: -74.01,
				});
				const propB = await createTestClientProperty(ctx, orgId, clientId, {
					latitude: 40.72,
					longitude: -74.02,
				});
				return { clientId, propA, propB };
			});
			await insertTask(orgId, { clientId, propertyId: propA });

			const first = await asUser.mutation(api.routes.seedFromSchedule, {
				date: DATE,
			});

			await t.run(async (ctx) => {
				await ctx.db.patch(first.routeId, {
					geometry: "abc123",
					computedAt: 1234567890,
					optimized: true,
				});
			});

			// Schedule changes: swap the task to a different property.
			await insertTask(orgId, { clientId, propertyId: propB });

			const second = await asUser.mutation(api.routes.seedFromSchedule, {
				date: DATE,
			});
			expect(second.routeId).toBe(first.routeId);

			const route = await asUser.query(api.routes.get, {
				routeId: second.routeId,
			});
			expect(route!.stops).toHaveLength(2);
			expect(route!.geometry).toBeUndefined();
			expect(route!.computedAt).toBeUndefined();
			expect(route!.optimized).toBeUndefined();
		});

		it("keeps separate daily singletons per assignee on the same date", async () => {
			const { clerkUserId, clerkOrgId, orgId, userId } =
				await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propertyId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					orgId,
					clientId,
					{ latitude: 40.71, longitude: -74.01 }
				);
				return { clientId, propertyId };
			});
			await insertTask(orgId, { clientId, propertyId, assigneeUserId: userId });

			const orgWide = await asUser.mutation(api.routes.seedFromSchedule, {
				date: DATE,
			});
			const assigned = await asUser.mutation(api.routes.seedFromSchedule, {
				date: DATE,
				assigneeUserId: userId,
			});
			expect(orgWide.routeId).not.toBe(assigned.routeId);
		});

		it("throws when nothing is schedulable on that day", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);

			await expect(
				asUser.mutation(api.routes.seedFromSchedule, { date: DATE })
			).rejects.toThrow(/No scheduled work/);
		});

		it("throws when the organization has no lat/lng", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propertyId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					orgId,
					clientId,
					{ latitude: 40.71, longitude: -74.01 }
				);
				return { clientId, propertyId };
			});
			await insertTask(orgId, { clientId, propertyId });

			await expect(
				asUser.mutation(api.routes.seedFromSchedule, { date: DATE })
			).rejects.toThrow(/organization's address/);
		});
	});

	describe("copyToDaily", () => {
		it("creates a fresh daily route with pending stops, leaving the master untouched", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const propertyId = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				return await createTestClientProperty(ctx, orgId, clientId, {
					latitude: 40.71,
					longitude: -74.01,
				});
			});

			const savedId = await asUser.mutation(api.routes.create, {
				name: "Master",
				start: START,
				roundTrip: true,
				stops: [stop(0, { propertyId }), stop(1)],
			});

			const dailyId = await asUser.mutation(api.routes.copyToDaily, {
				routeId: savedId,
				date: DATE,
			});

			const daily = await asUser.query(api.routes.get, { routeId: dailyId });
			expect(daily).toMatchObject({ kind: "daily", date: DATE });
			expect(daily!.stops).toHaveLength(2);
			expect(daily!.stops.every((s) => s.status === undefined)).toBe(true);
			expect(daily!.stops.map((s) => s.order)).toEqual([0, 1]);

			const master = await asUser.query(api.routes.get, { routeId: savedId });
			expect(master!.stops).toHaveLength(2);
			expect(master!.kind).toBe("saved");
		});

		it("merges onto an existing daily route without duplicating shared stops, reordering 0..n", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { propShared, propNew } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propShared = await createTestClientProperty(
					ctx,
					orgId,
					clientId,
					{ latitude: 40.71, longitude: -74.01 }
				);
				const propNew = await createTestClientProperty(
					ctx,
					orgId,
					clientId,
					{ latitude: 40.72, longitude: -74.02 }
				);
				return { propShared, propNew };
			});

			const existingId = await asUser.mutation(api.routes.create, {
				name: "Daily",
				kind: "daily",
				date: DATE,
				start: START,
				roundTrip: true,
				stops: [stop(0, { propertyId: propShared })],
			});

			const savedId = await asUser.mutation(api.routes.create, {
				name: "Master",
				start: START,
				roundTrip: true,
				stops: [
					stop(0, { propertyId: propShared }),
					stop(1, { propertyId: propNew }),
				],
			});

			const returnedId = await asUser.mutation(api.routes.copyToDaily, {
				routeId: savedId,
				date: DATE,
			});
			expect(returnedId).toBe(existingId);

			const merged = await asUser.query(api.routes.get, {
				routeId: existingId,
			});
			expect(merged!.stops).toHaveLength(2);
			expect(merged!.stops.map((s) => s.propertyId)).toEqual([
				propShared,
				propNew,
			]);
			expect(merged!.stops.map((s) => s.order)).toEqual([0, 1]);
		});

		it("rejects copying a daily route as the source", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const dailyId = await asUser.mutation(api.routes.create, {
				name: "Already daily",
				kind: "daily",
				date: DATE,
				start: START,
				roundTrip: false,
				stops: [stop(0)],
			});

			await expect(
				asUser.mutation(api.routes.copyToDaily, {
					routeId: dailyId,
					date: DATE + 86400000,
				})
			).rejects.toThrow(/Only saved routes/);
		});

		it("throws when merging would exceed the 23-stop cap", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);

			const existingStops = Array.from(
				{ length: MAX_STOPS - 3 },
				(_, i) => stop(i)
			);
			await asUser.mutation(api.routes.create, {
				name: "Full daily",
				kind: "daily",
				date: DATE,
				start: START,
				roundTrip: true,
				stops: existingStops,
			});

			// 5 new stops with coordinates distinct from the existing ones.
			const newStops = Array.from({ length: 5 }, (_, i) =>
				stop(100 + i, { order: i })
			);
			const savedId = await asUser.mutation(api.routes.create, {
				name: "Extra stops",
				start: START,
				roundTrip: true,
				stops: newStops,
			});

			await expect(
				asUser.mutation(api.routes.copyToDaily, {
					routeId: savedId,
					date: DATE,
				})
			).rejects.toThrow(/at most 23/);
		});
	});

	describe("setStopStatus", () => {
		it("marks a stop visited with visitedAt, then reverting to pending clears it", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const routeId = await asUser.mutation(api.routes.create, {
				name: "Daily",
				kind: "daily",
				date: DATE,
				start: START,
				roundTrip: false,
				stops: [stop(0), stop(1)],
			});

			await asUser.mutation(api.routes.setStopStatus, {
				routeId,
				order: 0,
				status: "visited",
			});
			let route = await asUser.query(api.routes.get, { routeId });
			expect(route!.stops[0].status).toBe("visited");
			expect(route!.stops[0].visitedAt).toBeTypeOf("number");
			// Untouched stop stays as-is.
			expect(route!.stops[1].status).toBeUndefined();

			await asUser.mutation(api.routes.setStopStatus, {
				routeId,
				order: 0,
				status: "pending",
			});
			route = await asUser.query(api.routes.get, { routeId });
			expect(route!.stops[0].status).toBe("pending");
			expect(route!.stops[0].visitedAt).toBeUndefined();
		});

		it("throws on a saved-kind route", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const routeId = await asUser.mutation(api.routes.create, {
				name: "Saved",
				start: START,
				roundTrip: false,
				stops: [stop(0)],
			});

			await expect(
				asUser.mutation(api.routes.setStopStatus, {
					routeId,
					order: 0,
					status: "visited",
				})
			).rejects.toThrow(/Only daily routes/);
		});

		it("throws when no stop matches the given order", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const routeId = await asUser.mutation(api.routes.create, {
				name: "Daily",
				kind: "daily",
				date: DATE,
				start: START,
				roundTrip: false,
				stops: [stop(0)],
			});

			await expect(
				asUser.mutation(api.routes.setStopStatus, {
					routeId,
					order: 5,
					status: "visited",
				})
			).rejects.toThrow(/Stop not found/);
		});

		it("rejects a route belonging to another org", async () => {
			const orgA = await setupOrg();
			const orgB = await t.run(
				async (ctx) =>
					await createTestOrg(ctx, {
						clerkUserId: "user_b2",
						clerkOrgId: "org_b2",
					})
			);
			const asA = t.withIdentity(
				createPremiumTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);
			const asB = t.withIdentity(
				createPremiumTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
			);

			const routeId = await asA.mutation(api.routes.create, {
				name: "Daily",
				kind: "daily",
				date: DATE,
				start: START,
				roundTrip: false,
				stops: [stop(0)],
			});

			await expect(
				asB.mutation(api.routes.setStopStatus, {
					routeId,
					order: 0,
					status: "visited",
				})
			).rejects.toThrow(/organization/i);
		});
	});

	describe("task completion marks stop visited", () => {
		async function setupDailyRouteWithTask() {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propertyId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					orgId,
					clientId,
					{ latitude: 40.71, longitude: -74.01 }
				);
				return { clientId, propertyId };
			});
			const taskId = await insertTask(orgId, { clientId, propertyId });

			const result = await asUser.mutation(api.routes.seedFromSchedule, {
				date: DATE,
			});

			return { asUser, orgId, taskId, routeId: result.routeId };
		}

		it("marks the matching stop visited when the task is completed via tasks.update", async () => {
			const { asUser, taskId, routeId } = await setupDailyRouteWithTask();

			await asUser.mutation(api.tasks.update, {
				id: taskId,
				status: "completed",
			});

			const route = await asUser.query(api.routes.get, { routeId });
			const matchedStop = route!.stops.find((s) => s.taskId === taskId);
			expect(matchedStop!.status).toBe("visited");
			expect(matchedStop!.visitedAt).toBeTypeOf("number");
		});

		it("marks the matching stop visited when completed via tasks.complete", async () => {
			const { asUser, taskId, routeId } = await setupDailyRouteWithTask();

			await asUser.mutation(api.tasks.complete, { id: taskId });

			const route = await asUser.query(api.routes.get, { routeId });
			const matchedStop = route!.stops.find((s) => s.taskId === taskId);
			expect(matchedStop!.status).toBe("visited");
		});

		it("does not revert the stop when the task is later un-completed", async () => {
			const { asUser, taskId, routeId } = await setupDailyRouteWithTask();

			await asUser.mutation(api.tasks.complete, { id: taskId });
			await asUser.mutation(api.tasks.update, {
				id: taskId,
				status: "pending",
			});

			const route = await asUser.query(api.routes.get, { routeId });
			const matchedStop = route!.stops.find((s) => s.taskId === taskId);
			expect(matchedStop!.status).toBe("visited");
		});

		it("leaves visitedAt untouched when the stop is already visited", async () => {
			const { asUser, taskId, routeId } = await setupDailyRouteWithTask();

			// Pre-mark the stop visited with a known timestamp.
			const before = await asUser.query(api.routes.get, { routeId });
			const stops = before!.stops.map((s) =>
				s.taskId === taskId
					? { ...s, status: "visited" as const, visitedAt: 1111111111 }
					: s
			);
			await t.run(async (ctx) => {
				await ctx.db.patch(routeId, { stops });
			});

			await asUser.mutation(api.tasks.complete, { id: taskId });

			const route = await asUser.query(api.routes.get, { routeId });
			const matchedStop = route!.stops.find((s) => s.taskId === taskId);
			expect(matchedStop!.visitedAt).toBe(1111111111);

			// A second completion attempt throws (already completed) without
			// touching the route again.
			await expect(
				asUser.mutation(api.tasks.complete, { id: taskId })
			).rejects.toThrow(/already completed/);
		});
	});

	describe("addPropertyStop", () => {
		/** Geocoded property on its own client, in the caller's org. */
		async function setupProperty(
			orgId: Id<"organizations">,
			overrides: Record<string, unknown> = {}
		) {
			return await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					orgId,
					clientId,
					{ latitude: 40.71, longitude: -74.01, ...overrides }
				);
				return { clientId, propertyId };
			});
		}

		it("creates the daily route when none exists", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { propertyId } = await setupProperty(orgId, {
				propertyName: "North Yard",
			});

			const result = await asUser.mutation(api.routes.addPropertyStop, {
				date: DATE,
				propertyId,
			});
			expect(result).toMatchObject({
				created: true,
				added: true,
				stopCount: 1,
				label: "North Yard",
			});
			// Solo org → org-wide daily route (no assignee).
			expect(result.assigneeUserId).toBeUndefined();

			const route = await asUser.query(api.routes.get, {
				routeId: result.routeId,
			});
			expect(route).toMatchObject({
				kind: "daily",
				date: DATE,
				roundTrip: true,
				status: "draft",
			});
			expect(route!.stops).toHaveLength(1);
			expect(route!.stops[0]).toMatchObject({
				propertyId,
				label: "North Yard",
				order: 0,
				status: "pending",
			});
		});

		it("defaults the assignee to the caller in a multi-member org", async () => {
			const { clerkUserId, clerkOrgId, orgId, userId } =
				await setupOrgWithAddress();
			await t.run(
				async (ctx) => await addMemberToOrg(ctx, orgId, { role: "member" })
			);
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { propertyId } = await setupProperty(orgId);

			const result = await asUser.mutation(api.routes.addPropertyStop, {
				date: DATE,
				propertyId,
			});
			expect(result.assigneeUserId).toBe(userId);

			const route = await asUser.query(api.routes.get, {
				routeId: result.routeId,
			});
			expect(route!.assigneeUserId).toBe(userId);
		});

		it("appends to an existing daily route and clears computed fields", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { propertyId } = await setupProperty(orgId);

			const routeId = await asUser.mutation(api.routes.create, {
				name: "Daily",
				kind: "daily",
				date: DATE,
				start: START,
				roundTrip: true,
				stops: [stop(0)],
			});
			await t.run(async (ctx) => {
				await ctx.db.patch(routeId, {
					geometry: "abc123",
					totalDistanceMeters: 1000,
					computedAt: 1234567890,
				});
			});

			const result = await asUser.mutation(api.routes.addPropertyStop, {
				date: DATE,
				propertyId,
			});
			expect(result).toMatchObject({
				routeId,
				created: false,
				added: true,
				stopCount: 2,
			});

			const route = await asUser.query(api.routes.get, { routeId });
			expect(route!.stops.map((s) => s.order)).toEqual([0, 1]);
			expect(route!.stops[1].propertyId).toBe(propertyId);
			expect(route!.geometry).toBeUndefined();
			expect(route!.totalDistanceMeters).toBeUndefined();
			expect(route!.computedAt).toBeUndefined();
		});

		it("dedupes a repeat add of the same property", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { propertyId } = await setupProperty(orgId);

			const first = await asUser.mutation(api.routes.addPropertyStop, {
				date: DATE,
				propertyId,
			});
			const second = await asUser.mutation(api.routes.addPropertyStop, {
				date: DATE,
				propertyId,
			});

			expect(second).toMatchObject({
				routeId: first.routeId,
				added: false,
				created: false,
				stopCount: 1,
				label: first.label,
			});
			const route = await asUser.query(api.routes.get, {
				routeId: first.routeId,
			});
			expect(route!.stops).toHaveLength(1);
		});

		it("resolves the client's primary property when only clientId is passed", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const clientId = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgId);
				await createTestClientProperty(ctx, orgId, clientId, {
					isPrimary: true,
					propertyName: "Primary Site",
					latitude: 40.71,
					longitude: -74.01,
				});
				return clientId;
			});

			const result = await asUser.mutation(api.routes.addPropertyStop, {
				date: DATE,
				clientId,
			});
			expect(result).toMatchObject({ added: true, label: "Primary Site" });
		});

		it("throws when the client has no primary property", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const clientId = await t.run(
				async (ctx) => await createTestClient(ctx, orgId)
			);

			await expect(
				asUser.mutation(api.routes.addPropertyStop, { date: DATE, clientId })
			).rejects.toThrow(/no property to add to a route/);
		});

		it("throws when neither a property nor a client is given", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);

			await expect(
				asUser.mutation(api.routes.addPropertyStop, { date: DATE })
			).rejects.toThrow(/property or client is required/);
		});

		it("throws for an ungeocoded property", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { propertyId } = await setupProperty(orgId, {
				latitude: undefined,
				longitude: undefined,
			});

			await expect(
				asUser.mutation(api.routes.addPropertyStop, { date: DATE, propertyId })
			).rejects.toThrow(/mapped address/);
		});

		it("throws when the org has no address and no daily route exists yet", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrg();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { propertyId } = await setupProperty(orgId);

			await expect(
				asUser.mutation(api.routes.addPropertyStop, { date: DATE, propertyId })
			).rejects.toThrow(/organization's address/);
		});

		it("throws when the daily route is already at the stop cap", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { propertyId } = await setupProperty(orgId);

			await asUser.mutation(api.routes.create, {
				name: "Full daily",
				kind: "daily",
				date: DATE,
				start: START,
				roundTrip: true,
				stops: Array.from({ length: MAX_STOPS }, (_, i) => stop(i)),
			});

			await expect(
				asUser.mutation(api.routes.addPropertyStop, { date: DATE, propertyId })
			).rejects.toThrow(/at most 23/);
		});

		it("rejects a property belonging to another org", async () => {
			const { clerkUserId, clerkOrgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const foreignPropertyId = await t.run(async (ctx) => {
				const other = await createTestOrg(ctx, {
					clerkUserId: "user_other_stop",
					clerkOrgId: "org_other_stop",
				});
				const clientId = await createTestClient(ctx, other.orgId);
				return await createTestClientProperty(ctx, other.orgId, clientId, {
					latitude: 40.71,
					longitude: -74.01,
				});
			});

			await expect(
				asUser.mutation(api.routes.addPropertyStop, {
					date: DATE,
					propertyId: foreignPropertyId,
				})
			).rejects.toThrow(/organization/i);
		});

		it("rejects an assignee who isn't a member of the org", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { propertyId } = await setupProperty(orgId);
			const foreignUserId = await t.run(async (ctx) => {
				const other = await createTestOrg(ctx, {
					clerkUserId: "user_other_assignee",
					clerkOrgId: "org_other_assignee",
				});
				return other.userId;
			});

			await expect(
				asUser.mutation(api.routes.addPropertyStop, {
					date: DATE,
					propertyId,
					assigneeUserId: foreignUserId,
				})
			).rejects.toThrow(/not a member/i);
		});

		it("rejects a project belonging to another org", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { propertyId } = await setupProperty(orgId);
			const foreignProjectId = await t.run(async (ctx) => {
				const other = await createTestOrg(ctx, {
					clerkUserId: "user_other_project",
					clerkOrgId: "org_other_project",
				});
				const clientId = await createTestClient(ctx, other.orgId);
				return await createTestProject(ctx, other.orgId, clientId);
			});

			await expect(
				asUser.mutation(api.routes.addPropertyStop, {
					date: DATE,
					propertyId,
					projectId: foreignProjectId,
				})
			).rejects.toThrow(/organization/i);
		});

		it("rejects non-premium orgs", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const { propertyId } = await setupProperty(orgId);
			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			await expect(
				asUser.mutation(api.routes.addPropertyStop, { date: DATE, propertyId })
			).rejects.toThrow(/Business plan/);
		});

		it("stores projectId provenance when passed", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await setupOrgWithAddress();
			const asUser = t.withIdentity(
				createPremiumTestIdentity(clerkUserId, clerkOrgId)
			);
			const { clientId, propertyId } = await setupProperty(orgId);
			const projectId = await insertProject(orgId, clientId, { propertyId });

			const result = await asUser.mutation(api.routes.addPropertyStop, {
				date: DATE,
				propertyId,
				projectId,
			});

			const route = await asUser.query(api.routes.get, {
				routeId: result.routeId,
			});
			expect(route!.stops[0].projectId).toBe(projectId);
		});
	});
});
