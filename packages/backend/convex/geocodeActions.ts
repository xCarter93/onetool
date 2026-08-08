import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/triggers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { buildPropertyAddress, geocodeAddress } from "./lib/geocode";
import { SERVER_EVENTS, trackServerEvent } from "./lib/posthog";

/**
 * Geocode a single client property, out of band.
 *
 * Manual property entry gets coordinates from Mapbox address autofill in the
 * browser; every import path (QBO customers + job sites, CSV) writes addresses
 * with no coordinates at all, which leaves them invisible to the routing map.
 * Import mutations schedule this action per created property.
 *
 * Best-effort by construction: a missing MAPBOX_API_KEY, a Mapbox error, or a
 * no-match address logs and returns null. It must never fail an import.
 */

/** Mapbox billing telemetry — must match routingActions.trackMapboxUsageEvent. */
export const GEOCODE_USAGE_PROPERTIES = {
	service: "geocoding",
	count: 1,
	platform: "backend",
} as const;

// Raw internalQuery — the scheduler is the only caller and passes a property id
// already produced by an org-scoped mutation.
export const getPropertyForGeocode = internalQuery({
	args: { propertyId: v.id("clientProperties") },
	handler: async (ctx, args): Promise<Doc<"clientProperties"> | null> => {
		return await ctx.db.get(args.propertyId);
	},
});

/** Patch coordinates and record the Mapbox call in one transaction. */
export const applyPropertyGeocode = internalMutation({
	args: {
		propertyId: v.id("clientProperties"),
		latitude: v.number(),
		longitude: v.number(),
		formattedAddress: v.string(),
	},
	handler: async (ctx, args): Promise<null> => {
		const property = await ctx.db.get(args.propertyId);
		if (!property) return null;
		await ctx.db.patch(args.propertyId, {
			latitude: args.latitude,
			longitude: args.longitude,
			formattedAddress: args.formattedAddress,
		});
		await trackServerEvent(ctx, {
			event: SERVER_EVENTS.MAPBOX_API_REQUEST,
			orgId: property.orgId,
			properties: { ...GEOCODE_USAGE_PROPERTIES },
		});
		return null;
	},
});

export const geocodeClientProperty = internalAction({
	args: { propertyId: v.id("clientProperties") },
	handler: async (
		ctx,
		args
	): Promise<{ latitude: number; longitude: number } | null> => {
		const property: Doc<"clientProperties"> | null = await ctx.runQuery(
			internal.geocodeActions.getPropertyForGeocode,
			{ propertyId: args.propertyId }
		);
		if (!property) return null;
		// Already placed (autofill, an earlier run, or the backfill migration).
		if (property.latitude !== undefined && property.latitude !== null) {
			return null;
		}

		const mapboxToken = process.env.MAPBOX_API_KEY;
		if (!mapboxToken) {
			console.warn("MAPBOX_API_KEY unset; skipping property geocode");
			return null;
		}

		const address = buildPropertyAddress(property);
		if (!address.trim()) return null;

		const result = await geocodeAddress(address, mapboxToken);
		if (!result) return null;

		await ctx.runMutation(internal.geocodeActions.applyPropertyGeocode, {
			propertyId: args.propertyId as Id<"clientProperties">,
			latitude: result.latitude,
			longitude: result.longitude,
			formattedAddress: result.formattedAddress,
		});
		return { latitude: result.latitude, longitude: result.longitude };
	},
});
