import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

/**
 * Mapbox Geocoding API response structure
 */
interface MapboxGeocodeResponse {
	features?: Array<{
		center?: [number, number]; // [longitude, latitude]
		place_name?: string;
	}>;
}

/**
 * Geocode an address using the Mapbox Geocoding API
 * Returns lat/lng coordinates and formatted address, or null if not found
 */
async function geocodeAddress(
	address: string,
	mapboxToken: string
): Promise<{
	latitude: number;
	longitude: number;
	formattedAddress: string;
} | null> {
	const encodedAddress = encodeURIComponent(address);
	const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&limit=1&country=US`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			console.error(`Geocoding API error: ${response.status}`);
			return null;
		}

		const data = (await response.json()) as MapboxGeocodeResponse;
		const feature = data.features?.[0];

		if (!feature || !feature.center) {
			return null;
		}

		return {
			longitude: feature.center[0],
			latitude: feature.center[1],
			formattedAddress: feature.place_name || address,
		};
	} catch (error) {
		console.error("Geocoding error:", error);
		return null;
	}
}

/**
 * Build a full address string from property fields
 */
function buildPropertyAddress(property: {
	streetAddress: string;
	city: string;
	state: string;
	zipCode: string;
	country?: string;
}): string {
	const parts = [
		property.streetAddress,
		property.city,
		property.state,
		property.zipCode,
	].filter(Boolean);

	if (property.country) {
		parts.push(property.country);
	}

	return parts.join(", ");
}

/**
 * Build a full address string from organization fields
 */
function buildOrganizationAddress(org: {
	addressStreet?: string;
	addressCity?: string;
	addressState?: string;
	addressZip?: string;
	addressCountry?: string;
	address?: string; // Legacy field
}): string | null {
	// Use structured fields if available
	if (org.addressStreet) {
		const parts = [
			org.addressStreet,
			org.addressCity,
			org.addressState,
			org.addressZip,
		].filter(Boolean);

		if (org.addressCountry) {
			parts.push(org.addressCountry);
		}

		return parts.join(", ");
	}

	// Fall back to legacy address field
	return org.address || null;
}

// ============================================================================
// Internal Mutations for Database Updates
// ============================================================================

/**
 * Update a single client property with geocode data
 */
export const updatePropertyGeocode = internalMutation({
	args: {
		propertyId: v.id("clientProperties"),
		latitude: v.number(),
		longitude: v.number(),
		formattedAddress: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.propertyId, {
			latitude: args.latitude,
			longitude: args.longitude,
			formattedAddress: args.formattedAddress,
		});
	},
});

/**
 * Update a single organization with geocode data
 */
export const updateOrganizationGeocode = internalMutation({
	args: {
		orgId: v.id("organizations"),
		latitude: v.number(),
		longitude: v.number(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.orgId, {
			latitude: args.latitude,
			longitude: args.longitude,
		});
	},
});

// ============================================================================
// Migration Actions
// ============================================================================

/**
 * Geocode client properties that don't have lat/lng data
 *
 * Usage:
 *   npx convex run migrations/geocodeAddresses:geocodeClientProperties '{"dryRun": true}'
 *   npx convex run migrations/geocodeAddresses:geocodeClientProperties '{"batchSize": 50}'
 */
export const geocodeClientProperties = internalAction({
	args: {
		batchSize: v.optional(v.number()),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 50;
		const dryRun = args.dryRun ?? false;

		const mapboxToken = process.env.MAPBOX_API_KEY;
		if (!mapboxToken) {
			throw new Error(
				"MAPBOX_API_KEY environment variable is required for geocoding"
			);
		}

		// Query all properties without lat/lng
		const allProperties = await ctx.runQuery(
			internal.migrations.geocodeAddresses.getUngecodedProperties
		);

		const propertiesToProcess = allProperties.slice(0, batchSize);

		console.log(`Found ${allProperties.length} properties without geocoding`);
		console.log(`Processing ${propertiesToProcess.length} properties (batch size: ${batchSize})`);
		if (dryRun) {
			console.log("DRY RUN - No changes will be made");
		}

		const results = {
			processed: 0,
			geocoded: 0,
			failed: 0,
			errors: [] as Array<{ propertyId: string; address: string; error: string }>,
		};

		for (const property of propertiesToProcess) {
			results.processed++;

			const address = buildPropertyAddress(property);
			console.log(`[${results.processed}/${propertiesToProcess.length}] Geocoding: ${address}`);

			const geocodeResult = await geocodeAddress(address, mapboxToken);

			if (geocodeResult) {
				console.log(`  -> Found: ${geocodeResult.latitude}, ${geocodeResult.longitude}`);

				if (!dryRun) {
					await ctx.runMutation(
						internal.migrations.geocodeAddresses.updatePropertyGeocode,
						{
							propertyId: property._id,
							latitude: geocodeResult.latitude,
							longitude: geocodeResult.longitude,
							formattedAddress: geocodeResult.formattedAddress,
						}
					);
				}
				results.geocoded++;
			} else {
				console.log(`  -> Failed to geocode`);
				results.failed++;
				results.errors.push({
					propertyId: property._id,
					address,
					error: "No geocoding result",
				});
			}

			// Rate limiting: 100ms between requests
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		console.log("\n=== Migration Results ===");
		console.log(`Total processed: ${results.processed}`);
		console.log(`Successfully geocoded: ${results.geocoded}`);
		console.log(`Failed: ${results.failed}`);
		console.log(`Remaining: ${allProperties.length - results.processed}`);

		if (results.errors.length > 0) {
			console.log("\nFailed addresses:");
			results.errors.forEach((err) => {
				console.log(`  - ${err.address} (${err.propertyId})`);
			});
		}

		return results;
	},
});

/**
 * Geocode organizations that don't have lat/lng data
 *
 * Usage:
 *   npx convex run migrations/geocodeAddresses:geocodeOrganizations '{"dryRun": true}'
 *   npx convex run migrations/geocodeAddresses:geocodeOrganizations
 */
export const geocodeOrganizations = internalAction({
	args: {
		batchSize: v.optional(v.number()),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 50;
		const dryRun = args.dryRun ?? false;

		const mapboxToken = process.env.MAPBOX_API_KEY;
		if (!mapboxToken) {
			throw new Error(
				"MAPBOX_API_KEY environment variable is required for geocoding"
			);
		}

		// Query all organizations without lat/lng that have an address
		const allOrgs = await ctx.runQuery(
			internal.migrations.geocodeAddresses.getUngecodedOrganizations
		);

		const orgsToProcess = allOrgs.slice(0, batchSize);

		console.log(`Found ${allOrgs.length} organizations without geocoding`);
		console.log(`Processing ${orgsToProcess.length} organizations (batch size: ${batchSize})`);
		if (dryRun) {
			console.log("DRY RUN - No changes will be made");
		}

		const results = {
			processed: 0,
			geocoded: 0,
			skipped: 0,
			failed: 0,
			errors: [] as Array<{ orgId: string; address: string; error: string }>,
		};

		for (const org of orgsToProcess) {
			results.processed++;

			const address = buildOrganizationAddress(org);

			if (!address) {
				console.log(`[${results.processed}/${orgsToProcess.length}] Skipping org ${org._id} - no address`);
				results.skipped++;
				continue;
			}

			console.log(`[${results.processed}/${orgsToProcess.length}] Geocoding: ${address}`);

			const geocodeResult = await geocodeAddress(address, mapboxToken);

			if (geocodeResult) {
				console.log(`  -> Found: ${geocodeResult.latitude}, ${geocodeResult.longitude}`);

				if (!dryRun) {
					await ctx.runMutation(
						internal.migrations.geocodeAddresses.updateOrganizationGeocode,
						{
							orgId: org._id,
							latitude: geocodeResult.latitude,
							longitude: geocodeResult.longitude,
						}
					);
				}
				results.geocoded++;
			} else {
				console.log(`  -> Failed to geocode`);
				results.failed++;
				results.errors.push({
					orgId: org._id,
					address,
					error: "No geocoding result",
				});
			}

			// Rate limiting: 100ms between requests
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		console.log("\n=== Migration Results ===");
		console.log(`Total processed: ${results.processed}`);
		console.log(`Successfully geocoded: ${results.geocoded}`);
		console.log(`Skipped (no address): ${results.skipped}`);
		console.log(`Failed: ${results.failed}`);
		console.log(`Remaining: ${allOrgs.length - results.processed}`);

		if (results.errors.length > 0) {
			console.log("\nFailed addresses:");
			results.errors.forEach((err) => {
				console.log(`  - ${err.address} (${err.orgId})`);
			});
		}

		return results;
	},
});

// ============================================================================
// Helper Queries
// ============================================================================

/**
 * Get client properties without geocoding data
 */
// Raw internalQuery — no factory variant exists; if exposing user-scoped data, prefer userQuery.
export const getUngecodedProperties = internalQuery({
	args: {},
	handler: async (ctx) => {
		const properties = await ctx.db.query("clientProperties").collect();

		// Filter to properties without lat/lng
		return properties.filter(
			(p) => p.latitude === undefined || p.latitude === null
		) as Array<{
			_id: Id<"clientProperties">;
			streetAddress: string;
			city: string;
			state: string;
			zipCode: string;
			country?: string;
		}>;
	},
});

/**
 * Get organizations without geocoding data that have an address
 */
// Raw internalQuery — no factory variant exists; if exposing user-scoped data, prefer userQuery.
export const getUngecodedOrganizations = internalQuery({
	args: {},
	handler: async (ctx) => {
		const organizations = await ctx.db.query("organizations").collect();

		// Filter to organizations without lat/lng that have some address info
		return organizations.filter((org) => {
			const hasNoGeocode = org.latitude === undefined || org.latitude === null;
			const hasAddress = org.addressStreet || org.address;
			return hasNoGeocode && hasAddress;
		}) as Array<{
			_id: Id<"organizations">;
			addressStreet?: string;
			addressCity?: string;
			addressState?: string;
			addressZip?: string;
			addressCountry?: string;
			address?: string;
		}>;
	},
});
