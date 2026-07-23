import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
	optionalUserQuery,
	userMutation,
	type UserMutationCtx,
} from "./lib/factories";
import { hasPremiumAccess } from "./lib/permissions";
import { emptyListResult } from "./lib/queries";

/**
 * Planned multi-stop routes (Routing page).
 *
 * Reads gate on clients:view (routes expose client property addresses);
 * writes additionally require the premium plan. Route computation against
 * Mapbox lives in routingActions.ts — mutations here clear stale computed
 * results whenever route inputs change.
 */

const PREMIUM_REQUIRED_MESSAGE =
	"Route planning is available on the Business plan. Upgrade to use it.";

/** Directions API allows 25 coordinates: start + stops + return-to-start. */
export const MAX_STOPS = 23;

const startValidator = v.object({
	kind: v.union(v.literal("org"), v.literal("manual")),
	label: v.string(),
	latitude: v.number(),
	longitude: v.number(),
});

const stopValidator = v.object({
	propertyId: v.optional(v.id("clientProperties")),
	label: v.string(),
	latitude: v.number(),
	longitude: v.number(),
	order: v.number(),
});

type RouteStop = {
	propertyId?: Id<"clientProperties">;
	label: string;
	latitude: number;
	longitude: number;
	order: number;
};

type RouteStart = {
	kind: "org" | "manual";
	label: string;
	latitude: number;
	longitude: number;
};

function assertValidCoordinate(latitude: number, longitude: number): void {
	if (
		!Number.isFinite(latitude) ||
		!Number.isFinite(longitude) ||
		latitude < -90 ||
		latitude > 90 ||
		longitude < -180 ||
		longitude > 180
	) {
		throw new Error("Invalid coordinates");
	}
}

async function assertValidStops(
	ctx: UserMutationCtx,
	stops: RouteStop[]
): Promise<void> {
	if (stops.length > MAX_STOPS) {
		throw new Error(`A route can have at most ${MAX_STOPS} stops`);
	}
	for (const stop of stops) {
		assertValidCoordinate(stop.latitude, stop.longitude);
		if (!Number.isFinite(stop.order) || stop.order < 0) {
			throw new Error("Invalid stop order");
		}
		if (stop.propertyId) {
			// Throws when the property belongs to another org.
			await ctx.orgEntity("clientProperties", stop.propertyId);
		}
	}
}

async function requirePremium(ctx: UserMutationCtx): Promise<void> {
	if (!(await hasPremiumAccess(ctx))) {
		throw new Error(PREMIUM_REQUIRED_MESSAGE);
	}
}

/** Computed-result fields, reset whenever route inputs change. */
const CLEARED_COMPUTED_FIELDS = {
	optimized: undefined,
	approximate: undefined,
	geometry: undefined,
	totalDistanceMeters: undefined,
	totalDurationSeconds: undefined,
	legs: undefined,
	computedAt: undefined,
} as const;

// ============================================================================
// Queries
// ============================================================================

export const list = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<Doc<"routes">[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("clients", "view");

		const routes = await ctx.db
			.query("routes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		return routes.sort((a, b) => b._creationTime - a._creationTime);
	},
});

export const get = optionalUserQuery({
	args: { routeId: v.id("routes") },
	handler: async (ctx, args): Promise<Doc<"routes"> | null> => {
		if (!ctx.orgId) return null;
		await ctx.requireLevel("clients", "view");

		// Plain get: orgEntity throws on deleted docs, but a viewer holding a
		// stale id should just see null.
		const route = await ctx.db.get(args.routeId);
		if (!route || route.orgId !== ctx.orgId) return null;
		return route;
	},
});

// ============================================================================
// Mutations
// ============================================================================

export const create = userMutation({
	args: {
		name: v.string(),
		date: v.optional(v.number()),
		start: startValidator,
		roundTrip: v.boolean(),
		stops: v.array(stopValidator),
	},
	handler: async (ctx, args): Promise<Id<"routes">> => {
		await requirePremium(ctx);
		await ctx.requireLevel("clients", "view");

		const name = args.name.trim();
		if (!name) throw new Error("Route name is required");
		assertValidCoordinate(args.start.latitude, args.start.longitude);
		await assertValidStops(ctx, args.stops);

		return await ctx.db.insert("routes", {
			orgId: ctx.orgId,
			name,
			date: args.date,
			status: "draft",
			start: args.start,
			roundTrip: args.roundTrip,
			stops: args.stops,
			createdBy: ctx.user._id,
		});
	},
});

export const update = userMutation({
	args: {
		routeId: v.id("routes"),
		name: v.optional(v.string()),
		date: v.optional(v.number()),
		status: v.optional(v.union(v.literal("draft"), v.literal("finalized"))),
		start: v.optional(startValidator),
		roundTrip: v.optional(v.boolean()),
		stops: v.optional(v.array(stopValidator)),
	},
	handler: async (ctx, args): Promise<void> => {
		await requirePremium(ctx);
		await ctx.requireLevel("clients", "view");

		const route = await ctx.orgEntity("routes", args.routeId);

		const updates: Partial<Doc<"routes">> = {};
		if (args.name !== undefined) {
			const name = args.name.trim();
			if (!name) throw new Error("Route name is required");
			updates.name = name;
		}
		if (args.date !== undefined) updates.date = args.date;
		if (args.status !== undefined) updates.status = args.status;
		if (args.start !== undefined) {
			assertValidCoordinate(args.start.latitude, args.start.longitude);
			updates.start = args.start as RouteStart;
		}
		if (args.roundTrip !== undefined) updates.roundTrip = args.roundTrip;
		if (args.stops !== undefined) {
			await assertValidStops(ctx, args.stops);
			updates.stops = args.stops;
		}

		if (Object.keys(updates).length === 0) {
			throw new Error("No updates provided");
		}

		// Any input change invalidates the previously computed route.
		const inputsChanged =
			args.start !== undefined ||
			args.roundTrip !== undefined ||
			args.stops !== undefined;

		await ctx.db.patch(route._id, {
			...updates,
			...(inputsChanged ? CLEARED_COMPUTED_FIELDS : {}),
		});
	},
});

export const remove = userMutation({
	args: { routeId: v.id("routes") },
	handler: async (ctx, args): Promise<void> => {
		await requirePremium(ctx);
		await ctx.requireLevel("clients", "view");

		const route = await ctx.orgEntity("routes", args.routeId);
		await ctx.db.delete(route._id);
	},
});
