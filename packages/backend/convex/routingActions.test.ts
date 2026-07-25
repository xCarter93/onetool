import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import type { FunctionArgs } from "convex/server";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestIdentity,
	createPremiumTestIdentity,
} from "./test.helpers";

const START = {
	kind: "org" as const,
	label: "HQ",
	latitude: 40.7,
	longitude: -74.0,
};

const stop = (n: number) => ({
	label: `Stop ${n}`,
	latitude: 40.7 + n * 0.01,
	longitude: -74 - n * 0.01,
	order: n,
});

const directionsResponse = {
	code: "Ok",
	routes: [
		{
			geometry: "dir_geom",
			distance: 8000,
			duration: 1200,
			legs: [
				{ distance: 4000, duration: 600 },
				{ distance: 4000, duration: 600 },
			],
		},
	],
};

function jsonResponse(body: unknown) {
	return { ok: true, json: async () => body } as unknown as Response;
}

describe("routingActions", () => {
	let t: ReturnType<typeof convexTest>;
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.stubEnv("MAPBOX_API_KEY", "test-token");
		fetchSpy = vi.fn(async () => jsonResponse(directionsResponse));
		vi.stubGlobal("fetch", fetchSpy);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	async function setupRoute(
		stops: FunctionArgs<typeof api.routes.create>["stops"] = [
			stop(0),
			stop(1),
			stop(2),
		]
	) {
		const { clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => await createTestOrg(ctx)
		);
		const asUser = t.withIdentity(
			createPremiumTestIdentity(clerkUserId, clerkOrgId)
		);
		const routeId = await asUser.mutation(api.routes.create, {
			name: "Test route",
			start: START,
			roundTrip: false,
			stops,
		});
		return { asUser, routeId, clerkUserId, clerkOrgId };
	}

	describe("computeRoute", () => {
		it("persists an optimized order from Optimization v1", async () => {
			const { asUser, routeId } = await setupRoute();
			// Input coords: [start, stop0, stop1, stop2]. Optimizer says the
			// trip visits stop1 first, then stop2, then stop0.
			fetchSpy.mockResolvedValueOnce(
				jsonResponse({
					code: "Ok",
					waypoints: [
						{ waypoint_index: 0 },
						{ waypoint_index: 3 },
						{ waypoint_index: 1 },
						{ waypoint_index: 2 },
					],
					trips: [
						{
							geometry: "opt_geom",
							distance: 5000,
							duration: 900,
							legs: [
								{ distance: 2000, duration: 300 },
								{ distance: 1500, duration: 300 },
								{ distance: 1500, duration: 300 },
							],
						},
					],
				})
			);

			const result = await asUser.action(api.routingActions.computeRoute, {
				routeId,
				optimize: true,
			});

			expect(result).toMatchObject({
				applied: true,
				optimized: true,
				approximate: false,
				totalDistanceMeters: 5000,
				totalDurationSeconds: 900,
			});
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			expect(String(fetchSpy.mock.calls[0][0])).toContain(
				"optimized-trips/v1/mapbox/driving-traffic"
			);

			const route = await asUser.query(api.routes.get, { routeId });
			expect(route!.stops.map((s) => s.label)).toEqual([
				"Stop 1",
				"Stop 2",
				"Stop 0",
			]);
			expect(route!.stops.map((s) => s.order)).toEqual([0, 1, 2]);
			expect(route!.geometry).toBe("opt_geom");
			expect(route!.legs).toHaveLength(3);
			expect(route!.computedAt).toBeDefined();
		});

		it("keeps manual order when optimize=false", async () => {
			const { asUser, routeId } = await setupRoute();

			const result = await asUser.action(api.routingActions.computeRoute, {
				routeId,
				optimize: false,
			});

			expect(result).toMatchObject({
				applied: true,
				optimized: false,
				approximate: false,
			});
			expect(String(fetchSpy.mock.calls[0][0])).toContain("directions/v5");

			const route = await asUser.query(api.routes.get, { routeId });
			expect(route!.stops.map((s) => s.label)).toEqual([
				"Stop 0",
				"Stop 1",
				"Stop 2",
			]);
			expect(route!.geometry).toBe("dir_geom");
		});

		it("applies results for stops carrying seed/completion fields", async () => {
			// Regression: applyRouteResult's validator once lacked taskId/projectId/
			// status, so any seeded or tracked stop failed the write-back.
			const { asUser, routeId } = await setupRoute([
				{ ...stop(0), status: "pending" as const },
				{ ...stop(1), status: "visited" as const, visitedAt: 123 },
			]);

			const result = await asUser.action(api.routingActions.computeRoute, {
				routeId,
				optimize: false,
			});

			expect(result).toMatchObject({ applied: true });
			const route = await asUser.query(api.routes.get, { routeId });
			expect(route!.stops.map((s) => s.status)).toEqual([
				"pending",
				"visited",
			]);
			expect(route!.stops[1].visitedAt).toBe(123);
		});

		it("falls back to the local heuristic when v1 is unsupported", async () => {
			const { asUser, routeId } = await setupRoute();
			fetchSpy
				.mockResolvedValueOnce(jsonResponse({ code: "NotImplemented" }))
				.mockResolvedValueOnce(jsonResponse(directionsResponse));

			const result = await asUser.action(api.routingActions.computeRoute, {
				routeId,
				optimize: true,
			});

			expect(result).toMatchObject({
				applied: true,
				optimized: true,
				approximate: true,
			});
			expect(fetchSpy).toHaveBeenCalledTimes(2);
			expect(String(fetchSpy.mock.calls[1][0])).toContain("directions/v5");
		});

		it("flags unreachable stops via a Matrix probe on NoRoute", async () => {
			const { asUser, routeId } = await setupRoute();
			fetchSpy
				.mockResolvedValueOnce(jsonResponse({ code: "NoRoute" }))
				// Matrix row: [start, stop0, stop1, stop2] — stop1 unreachable.
				.mockResolvedValueOnce(
					jsonResponse({ code: "Ok", durations: [[0, 100, null, 200]] })
				);

			const error = await asUser
				.action(api.routingActions.computeRoute, {
					routeId,
					optimize: false,
				})
				.then(
					() => null,
					(e: unknown) => e
				);

			expect(error).toBeInstanceOf(ConvexError);
			// convex-test surfaces ConvexError data as its JSON serialization.
			const data: unknown = (error as ConvexError<string>).data;
			expect(typeof data === "string" ? JSON.parse(data) : data).toMatchObject({
				code: "unreachable_stops",
				stopIndices: [1],
			});
			expect(String(fetchSpy.mock.calls[1][0])).toContain(
				"directions-matrix/v1/mapbox/driving"
			);
		});

		it("rethrows the original error when the probe finds every stop reachable", async () => {
			const { asUser, routeId } = await setupRoute();
			fetchSpy
				.mockResolvedValueOnce(jsonResponse({ code: "NoRoute" }))
				.mockResolvedValueOnce(
					jsonResponse({ code: "Ok", durations: [[0, 100, 150, 200]] })
				);

			await expect(
				asUser.action(api.routingActions.computeRoute, {
					routeId,
					optimize: false,
				})
			).rejects.toThrow(/No drivable route/);
		});

		it("rejects non-premium users", async () => {
			const { routeId, clerkUserId, clerkOrgId } = await setupRoute();
			const asFreeUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			await expect(
				asFreeUser.action(api.routingActions.computeRoute, {
					routeId,
					optimize: true,
				})
			).rejects.toThrow(/Business plan/);
			expect(fetchSpy).not.toHaveBeenCalled();
		});
	});

	describe("applyRouteResult", () => {
		it("skips stale writes when inputs changed mid-compute", async () => {
			const { asUser, routeId } = await setupRoute();

			const result = await t.mutation(
				internal.routingActions.applyRouteResult,
				{
					routeId,
					inputsFingerprint: "stale-fingerprint",
					stops: [stop(0)],
					optimized: true,
					approximate: false,
					geometry: "stale_geom",
					totalDistanceMeters: 1,
					totalDurationSeconds: 1,
					legs: [{ distanceMeters: 1, durationSeconds: 1 }],
				}
			);

			expect(result).toEqual({ applied: false });
			const route = await asUser.query(api.routes.get, { routeId });
			expect(route!.geometry).toBeUndefined();
			expect(route!.stops).toHaveLength(3);
		});
	});

	describe("searchGasAlongRoute", () => {
		it("requires a computed route", async () => {
			const { asUser, routeId } = await setupRoute();
			await expect(
				asUser.action(api.routingActions.searchGasAlongRoute, {
					routeId,
					timeDeviationMinutes: 5,
				})
			).rejects.toThrow(/Compute the route/);
		});

		it("returns mapped stations along the computed route", async () => {
			const { asUser, routeId } = await setupRoute();
			await asUser.action(api.routingActions.computeRoute, {
				routeId,
				optimize: false,
			});

			fetchSpy.mockResolvedValueOnce(
				jsonResponse({
					type: "FeatureCollection",
					features: [
						{
							geometry: { coordinates: [-74.01, 40.71], type: "Point" },
							properties: {
								name: "Shell",
								full_address: "1 Main St, New York, NY",
							},
						},
						{
							geometry: { coordinates: [-74.02, 40.72], type: "Point" },
							properties: { name: "BP" },
						},
					],
				})
			);

			const stations = await asUser.action(
				api.routingActions.searchGasAlongRoute,
				{ routeId, timeDeviationMinutes: 10 }
			);

			expect(stations).toEqual([
				{
					name: "Shell",
					address: "1 Main St, New York, NY",
					latitude: 40.71,
					longitude: -74.01,
				},
				{ name: "BP", address: null, latitude: 40.72, longitude: -74.02 },
			]);

			const sarCall = String(fetchSpy.mock.calls.at(-1)![0]);
			expect(sarCall).toContain("category/gas_station");
			expect(sarCall).toContain("sar_type=isochrone");
			expect(sarCall).toContain("time_deviation=10");
		});
	});
});
