import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createPremiumTestIdentity,
	createTestClient,
	createTestClientProperty,
	createTestOrg,
} from "./test.helpers";
import { GEOCODE_USAGE_PROPERTIES } from "./geocodeActions";

describe("import-created property geocoding", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	/** Answer any Mapbox geocoding call with one feature. */
	function stubMapbox(): string[] {
		const calls: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calls.push(String(url));
				return {
					ok: true,
					status: 200,
					json: async () => ({
						features: [
							{ center: [-97.7431, 30.2672], place_name: "1 Main St, Austin" },
						],
					}),
					text: async () => "",
				} as unknown as Response;
			})
		);
		return calls;
	}

	async function setup(suffix: string) {
		const org = await t.run(async (ctx) =>
			createTestOrg(ctx, {
				clerkUserId: `geo_user_${suffix}`,
				clerkOrgId: `geo_org_${suffix}`,
			})
		);
		const clientId = await t.run(async (ctx) =>
			createTestClient(ctx, org.orgId)
		);
		return { org, clientId };
	}

	async function propertyById(propertyId: Id<"clientProperties">) {
		return await t.run(async (ctx) => ctx.db.get(propertyId));
	}

	it("matches the mapbox_api_request usage contract", () => {
		// The dashboard SUMs `count` and splits on `service`/`platform`; this must
		// stay byte-identical to routingActions.trackMapboxUsageEvent.
		expect(GEOCODE_USAGE_PROPERTIES).toEqual({
			service: "geocoding",
			count: 1,
			platform: "backend",
		});
	});

	it("patches latitude/longitude onto an ungeocoded property", async () => {
		const { org, clientId } = await setup("patch");
		const propertyId = await t.run(async (ctx) =>
			createTestClientProperty(ctx, org.orgId, clientId, {
				streetAddress: "1 Main St",
				city: "Austin",
				state: "TX",
				zipCode: "78701",
			})
		);
		const calls = stubMapbox();
		vi.stubEnv("MAPBOX_API_KEY", "mapbox_test_key");

		const result = await t.action(
			internal.geocodeActions.geocodeClientProperty,
			{ propertyId }
		);

		expect(result).toEqual({ latitude: 30.2672, longitude: -97.7431 });
		expect(calls[0]).toContain("api.mapbox.com/geocoding");
		expect(calls[0]).toContain(encodeURIComponent("1 Main St, Austin, TX, 78701"));
		expect(await propertyById(propertyId)).toMatchObject({
			latitude: 30.2672,
			longitude: -97.7431,
			formattedAddress: "1 Main St, Austin",
		});
	});

	it("no-ops without MAPBOX_API_KEY", async () => {
		const { org, clientId } = await setup("nokey");
		const propertyId = await t.run(async (ctx) =>
			createTestClientProperty(ctx, org.orgId, clientId)
		);
		const calls = stubMapbox();
		vi.stubEnv("MAPBOX_API_KEY", "");

		const result = await t.action(
			internal.geocodeActions.geocodeClientProperty,
			{ propertyId }
		);

		expect(result).toBeNull();
		expect(calls).toHaveLength(0);
		expect((await propertyById(propertyId))?.latitude).toBeUndefined();
	});

	it("no-ops on a property that already has coordinates", async () => {
		const { org, clientId } = await setup("already");
		const propertyId = await t.run(async (ctx) =>
			createTestClientProperty(ctx, org.orgId, clientId, {
				latitude: 1,
				longitude: 2,
			})
		);
		const calls = stubMapbox();
		vi.stubEnv("MAPBOX_API_KEY", "mapbox_test_key");

		const result = await t.action(
			internal.geocodeActions.geocodeClientProperty,
			{ propertyId }
		);

		expect(result).toBeNull();
		expect(calls).toHaveLength(0);
		expect(await propertyById(propertyId)).toMatchObject({
			latitude: 1,
			longitude: 2,
		});
	});

	it("repairs a property with only one of the two coordinates", async () => {
		const { org, clientId } = await setup("partial");
		const propertyId = await t.run(async (ctx) =>
			createTestClientProperty(ctx, org.orgId, clientId, {
				streetAddress: "1 Main St",
				city: "Austin",
				state: "TX",
				zipCode: "78701",
				latitude: 1,
			})
		);
		const calls = stubMapbox();
		vi.stubEnv("MAPBOX_API_KEY", "mapbox_test_key");

		const result = await t.action(
			internal.geocodeActions.geocodeClientProperty,
			{ propertyId }
		);

		expect(result).toEqual({ latitude: 30.2672, longitude: -97.7431 });
		expect(calls).toHaveLength(1);
		expect(await propertyById(propertyId)).toMatchObject({
			latitude: 30.2672,
			longitude: -97.7431,
		});
	});

	it("schedules a geocode for every CSV-imported property", async () => {
		const org = await t.run(async (ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "geo_user_csv",
				clerkOrgId: "geo_org_csv",
			})
		);
		const asAdmin = t.withIdentity(
			createPremiumTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		stubMapbox();
		vi.stubEnv("MAPBOX_API_KEY", "mapbox_test_key");

		const results = await asAdmin.mutation(api.clients.bulkCreate, {
			clients: [
				{
					companyName: "CSV Co",
					status: "active",
					properties: [
						{
							streetAddress: "1 Main St",
							city: "Austin",
							state: "TX",
							zipCode: "78701",
						},
					],
				},
			],
		});
		expect(results[0].success).toBe(true);

		// The scheduled geocode IS the assertion here (the action itself is
		// covered above): convex-test exposes the pending job before it runs.
		const scheduled = await t.run(async (ctx) =>
			ctx.db.system.query("_scheduled_functions").collect()
		);
		expect(
			scheduled.some((job) =>
				job.name === "geocodeActions:geocodeClientProperty"
			)
		).toBe(true);

		const properties = await t.run(async (ctx) =>
			ctx.db
				.query("clientProperties")
				.withIndex("by_client", (q) => q.eq("clientId", results[0].id!))
				.collect()
		);
		expect(properties).toHaveLength(1);
		expect(properties[0].latitude).toBeUndefined();
	});
});
