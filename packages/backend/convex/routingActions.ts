import { ConvexError, v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import { hasPremiumAccess, requireLevel } from "./lib/permissions";
import { rateLimiter } from "./rateLimits";
import { solveStopOrder, type LatLng } from "./lib/tsp";
import { stopValidator } from "./routes";
import { shrinkPolylineForQuery } from "./lib/polylineCodec";

/**
 * Mapbox route computation + gas-station search for the Routing page.
 *
 * Request shapes verified against docs.mapbox.com 2026-07-23:
 * - Directions v5: GET /directions/v5/{profile}/{lng,lat;...} — max 25 coords,
 *   legs carry distance (m) / duration (s), geometry polyline5 by default.
 * - Optimization v1: GET /optimized-trips/v1/{profile}/{coords} — max 12
 *   coords; response waypoints[i].waypoint_index = input coord i's position in
 *   the optimized trip. Not every source/destination/roundtrip combination is
 *   implemented, so any non-Ok code falls back to the local heuristic.
 * - Search Box: GET /search/searchbox/v1/category/gas_station with
 *   route (polyline5) + sar_type=isochrone + time_deviation (minutes).
 */

const DIRECTIONS_PROFILE = "mapbox/driving-traffic";
const OPTIMIZATION_MAX_COORDS = 12;
const PREMIUM_REQUIRED_MESSAGE =
	"Route planning is available on the Business plan. Upgrade to use it.";

function getMapboxApiKey(): string {
	const key = process.env.MAPBOX_API_KEY;
	if (!key) {
		throw new Error(
			"MAPBOX_API_KEY is not configured. Set it in the Convex dashboard."
		);
	}
	return key;
}

type RouteLeg = { distanceMeters: number; durationSeconds: number };

type ComputeRouteResult = {
	applied: boolean;
	optimized: boolean;
	approximate: boolean;
	totalDistanceMeters: number;
	totalDurationSeconds: number;
};

type GasStation = {
	name: string;
	address: string | null;
	latitude: number;
	longitude: number;
};

/** Stable snapshot of the inputs a computation was based on. */
function fingerprintInputs(route: {
	start: { latitude: number; longitude: number };
	roundTrip: boolean;
	stops: Array<{
		propertyId?: Id<"clientProperties">;
		latitude: number;
		longitude: number;
		order: number;
	}>;
}): string {
	return JSON.stringify({
		start: [route.start.latitude, route.start.longitude],
		roundTrip: route.roundTrip,
		stops: [...route.stops]
			.sort((a, b) => a.order - b.order)
			.map((s) => [s.propertyId ?? null, s.latitude, s.longitude]),
	});
}

function coordPair(p: { latitude: number; longitude: number }): string {
	return `${p.longitude},${p.latitude}`;
}

const MAPBOX_TIMEOUT_MS = 10_000;

async function mapboxGet(url: string): Promise<Record<string, unknown>> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), MAPBOX_TIMEOUT_MS);
	let response: Response;
	try {
		response = await fetch(url, { signal: controller.signal });
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error("Route service timed out. Try again.");
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
	if (!response.ok) {
		const body = await response.text();
		console.error(`Mapbox request failed (${response.status}): ${body}`);
		throw new Error(
			response.status === 429
				? "Mapbox rate limit reached. Try again in a minute."
				: "Route service request failed. Try again."
		);
	}
	return (await response.json()) as Record<string, unknown>;
}

type DirectionsRoute = {
	geometry: string;
	distance: number;
	duration: number;
	legs: Array<{ distance: number; duration: number }>;
};

/** Directions/Optimization non-Ok response, with the Mapbox code preserved. */
class MapboxRouteError extends Error {
	constructor(
		public readonly code: string,
		message: string
	) {
		super(message);
	}
}

async function fetchDirections(
	coords: string[],
	token: string
): Promise<DirectionsRoute> {
	const url =
		`https://api.mapbox.com/directions/v5/${DIRECTIONS_PROFILE}/` +
		coords.join(";") +
		`?overview=full&geometries=polyline&access_token=${token}`;
	const data = await mapboxGet(url);
	if (data.code !== "Ok") {
		throw new MapboxRouteError(
			String(data.code),
			data.code === "NoRoute"
				? "No drivable route found between these stops."
				: `Route computation failed (${String(data.code)}).`
		);
	}
	const route = (data.routes as DirectionsRoute[] | undefined)?.[0];
	if (!route) throw new Error("Route computation returned no routes.");
	return route;
}

/**
 * Best-effort diagnosis of which stops the road network can't reach from the
 * start. One Matrix API call (mapbox/driving — 25-coord cap vs 10 for
 * driving-traffic); null durations mark unreachable coordinates. Returns
 * indices into the order-sorted stops array; [] when diagnosis fails.
 */
async function findUnreachableStops(
	start: { latitude: number; longitude: number },
	stops: Array<{ latitude: number; longitude: number }>,
	token: string
): Promise<number[]> {
	try {
		const coords = [coordPair(start), ...stops.map(coordPair)];
		const url =
			`https://api.mapbox.com/directions-matrix/v1/mapbox/driving/` +
			coords.join(";") +
			`?sources=0&annotations=duration&access_token=${token}`;
		const data = await mapboxGet(url);
		if (data.code !== "Ok") return [];
		const row = (data.durations as Array<Array<number | null>> | undefined)?.[0];
		if (!row) return [];
		return stops.flatMap((_, i) => (row[i + 1] == null ? [i] : []));
	} catch (error) {
		console.warn("Unreachable-stop diagnosis failed", error);
		return [];
	}
}

type OptimizationResponse = {
	code: string;
	waypoints?: Array<{ waypoint_index: number }>;
	trips?: DirectionsRoute[];
};

/** Returns null when this coordinate combination isn't supported by v1. */
async function fetchOptimizedTrip(
	coords: string[],
	roundTrip: boolean,
	token: string
): Promise<{ trip: DirectionsRoute; stopOrder: number[] } | null> {
	// v1 only implements roundtrip=false with source=first AND destination=last;
	// omitting destination there defaults it to `any` and returns NotImplemented.
	// Round trips keep the default `any` — pinning the last stop would only
	// constrain the optimizer for no gain.
	const url =
		`https://api.mapbox.com/optimized-trips/v1/${DIRECTIONS_PROFILE}/` +
		coords.join(";") +
		`?source=first&roundtrip=${roundTrip}` +
		(roundTrip ? "" : "&destination=last") +
		`&overview=full&geometries=polyline&access_token=${token}`;
	const data = (await mapboxGet(url)) as unknown as OptimizationResponse;
	if (data.code !== "Ok" || !data.trips?.[0] || !data.waypoints) {
		console.warn(`Optimization v1 returned ${data.code}; using local heuristic`);
		return null;
	}
	// waypoints[i] is input coordinate i (0 = start); waypoint_index is its
	// position in the optimized trip. Stop i sits at waypoints[i + 1].
	const stopOrder = data.waypoints
		.slice(1)
		.map((w, stopIdx) => ({ stopIdx, tripPos: w.waypoint_index }))
		.sort((a, b) => a.tripPos - b.tripPos)
		.map((entry) => entry.stopIdx);
	return { trip: data.trips[0], stopOrder };
}

// ============================================================================
// Internal authorization + persistence
// ============================================================================

export const authorizeRoute = internalMutation({
	args: {
		routeId: v.id("routes"),
		limiter: v.union(v.literal("routeCompute"), v.literal("routeGasSearch")),
	},
	handler: async (ctx, args): Promise<Doc<"routes">> => {
		await getCurrentUserOrThrow(ctx);
		const orgId = await getCurrentUserOrgId(ctx);
		// Matches every read/write in routes.ts: route data exposes client
		// property addresses, so it gates on clients:view before premium.
		await requireLevel(ctx, "clients", "view");
		if (!(await hasPremiumAccess(ctx))) {
			throw new Error(PREMIUM_REQUIRED_MESSAGE);
		}
		const route = await ctx.db.get(args.routeId);
		if (!route || route.orgId !== orgId) {
			throw new Error("Route not found");
		}
		await rateLimiter.limit(ctx, args.limiter, { key: orgId, throws: true });
		return route;
	},
});

export const applyRouteResult = internalMutation({
	args: {
		routeId: v.id("routes"),
		inputsFingerprint: v.string(),
		stops: v.array(stopValidator),
		optimized: v.boolean(),
		approximate: v.boolean(),
		geometry: v.string(),
		totalDistanceMeters: v.number(),
		totalDurationSeconds: v.number(),
		legs: v.array(
			v.object({
				distanceMeters: v.number(),
				durationSeconds: v.number(),
			})
		),
	},
	handler: async (ctx, args): Promise<{ applied: boolean }> => {
		const route = await ctx.db.get(args.routeId);
		// Skip stale writes: the route was edited (or deleted) mid-compute.
		if (!route || fingerprintInputs(route) !== args.inputsFingerprint) {
			return { applied: false };
		}
		await ctx.db.patch(args.routeId, {
			stops: args.stops,
			optimized: args.optimized,
			approximate: args.approximate,
			geometry: args.geometry,
			totalDistanceMeters: args.totalDistanceMeters,
			totalDurationSeconds: args.totalDurationSeconds,
			legs: args.legs,
			computedAt: Date.now(),
		});
		return { applied: true };
	},
});

// ============================================================================
// Public actions
// ============================================================================

export const computeRoute = action({
	args: {
		routeId: v.id("routes"),
		optimize: v.boolean(),
	},
	handler: async (ctx, args): Promise<ComputeRouteResult> => {
		const route: Doc<"routes"> = await ctx.runMutation(
			internal.routingActions.authorizeRoute,
			{ routeId: args.routeId, limiter: "routeCompute" }
		);

		const stops = [...route.stops].sort((a, b) => a.order - b.order);
		if (stops.length === 0) {
			throw new Error("Add at least one stop before computing a route");
		}

		const token = getMapboxApiKey();
		const fingerprint = fingerprintInputs(route);
		const startPair = coordPair(route.start);

		let orderedStops = stops;
		let trip: DirectionsRoute;
		let optimized = false;
		let approximate = false;

		try {
			const coordCount = stops.length + 1;
			if (args.optimize && stops.length > 1) {
				let solved: { trip: DirectionsRoute; stopOrder: number[] } | null =
					null;
				if (coordCount <= OPTIMIZATION_MAX_COORDS) {
					solved = await fetchOptimizedTrip(
						[startPair, ...stops.map(coordPair)],
						route.roundTrip,
						token
					);
				}
				if (solved) {
					orderedStops = solved.stopOrder.map((idx) => stops[idx]);
					trip = solved.trip;
					optimized = true;
				} else {
					// Over the v1 cap (or unsupported combination): order locally,
					// then fetch geometry for that order.
					const heuristicOrder = solveStopOrder(
						route.start as LatLng,
						stops as LatLng[],
						route.roundTrip
					);
					orderedStops = heuristicOrder.map((idx) => stops[idx]);
					const coords = [startPair, ...orderedStops.map(coordPair)];
					if (route.roundTrip) coords.push(startPair);
					trip = await fetchDirections(coords, token);
					optimized = true;
					approximate = true;
				}
			} else {
				const coords = [startPair, ...stops.map(coordPair)];
				if (route.roundTrip) coords.push(startPair);
				trip = await fetchDirections(coords, token);
			}
		} catch (error) {
			// Directions can't say which coordinate broke the route; a Matrix
			// probe from the start can. Indices refer to the order-sorted stops.
			if (
				error instanceof MapboxRouteError &&
				(error.code === "NoRoute" || error.code === "NoSegment")
			) {
				const unreachable = await findUnreachableStops(
					route.start,
					stops,
					token
				);
				if (unreachable.length > 0) {
					throw new ConvexError({
						code: "unreachable_stops",
						stopIndices: unreachable,
						message:
							"Some stops can't be reached by road from the start location.",
					});
				}
			}
			throw error;
		}

		const legs: RouteLeg[] = trip.legs.map((leg) => ({
			distanceMeters: leg.distance,
			durationSeconds: leg.duration,
		}));

		const { applied } = await ctx.runMutation(
			internal.routingActions.applyRouteResult,
			{
				routeId: args.routeId,
				inputsFingerprint: fingerprint,
				stops: orderedStops.map((stop, i) => ({ ...stop, order: i })),
				optimized,
				approximate,
				geometry: trip.geometry,
				totalDistanceMeters: trip.distance,
				totalDurationSeconds: trip.duration,
				legs,
			}
		);

		return {
			applied,
			optimized,
			approximate,
			totalDistanceMeters: trip.distance,
			totalDurationSeconds: trip.duration,
		};
	},
});

export const searchGasAlongRoute = action({
	args: {
		routeId: v.id("routes"),
		timeDeviationMinutes: v.union(
			v.literal(5),
			v.literal(10),
			v.literal(15)
		),
	},
	handler: async (ctx, args): Promise<GasStation[]> => {
		const route: Doc<"routes"> = await ctx.runMutation(
			internal.routingActions.authorizeRoute,
			{ routeId: args.routeId, limiter: "routeGasSearch" }
		);
		if (!route.geometry) {
			throw new Error("Compute the route before searching for gas stations");
		}

		const token = getMapboxApiKey();
		// Full-resolution geometry can exceed URL limits (CDN 414s) — thin it.
		const queryPolyline = shrinkPolylineForQuery(route.geometry);
		const url =
			`https://api.mapbox.com/search/searchbox/v1/category/gas_station` +
			`?route=${encodeURIComponent(queryPolyline)}` +
			`&route_geometry=polyline&sar_type=isochrone` +
			`&time_deviation=${args.timeDeviationMinutes}` +
			`&limit=25&access_token=${token}`;
		const data = await mapboxGet(url);

		const features =
			(data.features as Array<{
				geometry?: { coordinates?: [number, number] };
				properties?: { name?: string; full_address?: string };
			}> | undefined) ?? [];

		return features
			.filter((f) => Array.isArray(f.geometry?.coordinates))
			.map((f) => ({
				name: f.properties?.name ?? "Gas station",
				address: f.properties?.full_address ?? null,
				longitude: f.geometry!.coordinates![0],
				latitude: f.geometry!.coordinates![1],
			}));
	},
});
