// Pure route-run math for the native Routes map screen. No RN/Convex imports —
// unit-testable in the node vitest environment.
//
// Geometry is a Mapbox encoded polyline at precision 5 (routingActions.ts
// requests `geometries=polyline`); decoder ported from apps/web/src/lib/polyline.ts.
// legs[i] is the leg ARRIVING at ordered stop i (leg[0] = start→first stop);
// when roundTrip there is one extra final leg back to start, so
// legs.length === stops.length + (roundTrip ? 1 : 0).

export type RouteStopStatus = "pending" | "visited" | "skipped";

export type RouteStop = {
	label: string;
	latitude: number;
	longitude: number;
	order: number;
	status?: RouteStopStatus;
	visitedAt?: number;
};

export type RouteLeg = {
	distanceMeters: number;
	durationSeconds: number;
};

export type RouteRun = {
	stops: RouteStop[];
	roundTrip: boolean;
	legs?: RouteLeg[];
};

export type LngLat = [number, number];

/** Decode an encoded polyline into GeoJSON-ordered [lng, lat] pairs. */
export function decodePolyline(encoded: string, precision: 5 | 6): LngLat[] {
	const factor = 10 ** precision;
	const coordinates: LngLat[] = [];
	let index = 0;
	let lat = 0;
	let lng = 0;

	while (index < encoded.length) {
		let result = 0;
		let shift = 0;
		let byte: number;
		do {
			byte = encoded.charCodeAt(index++) - 63;
			result |= (byte & 0x1f) << shift;
			shift += 5;
		} while (byte >= 0x20);
		lat += result & 1 ? ~(result >> 1) : result >> 1;

		result = 0;
		shift = 0;
		do {
			byte = encoded.charCodeAt(index++) - 63;
			result |= (byte & 0x1f) << shift;
			shift += 5;
		} while (byte >= 0x20);
		lng += result & 1 ? ~(result >> 1) : result >> 1;

		coordinates.push([lng / factor, lat / factor]);
	}

	return coordinates;
}

export type RouteLineFeature = {
	type: "Feature";
	properties: Record<string, never>;
	geometry: { type: "LineString"; coordinates: LngLat[] };
};

/** GeoJSON Feature for a ShapeSource, at the backend's precision 5. */
export function routeLineFeature(encoded: string): RouteLineFeature {
	return {
		type: "Feature",
		properties: {},
		geometry: { type: "LineString", coordinates: decodePolyline(encoded, 5) },
	};
}

/** Bounding box for Camera.fitBounds; null when there are no coordinates. */
export function boundsFor(
	coords: LngLat[],
): { ne: LngLat; sw: LngLat } | null {
	if (coords.length === 0) return null;
	let minLng = Infinity;
	let minLat = Infinity;
	let maxLng = -Infinity;
	let maxLat = -Infinity;
	for (const [lng, lat] of coords) {
		if (lng < minLng) minLng = lng;
		if (lng > maxLng) maxLng = lng;
		if (lat < minLat) minLat = lat;
		if (lat > maxLat) maxLat = lat;
	}
	return { ne: [maxLng, maxLat], sw: [minLng, minLat] };
}

/** Sorted copy by `order` (order values may be sparse — sort, don't index). */
export function stopsInOrder<T extends { order: number }>(stops: T[]): T[] {
	return [...stops].sort((a, b) => a.order - b.order);
}

/** Lowest-order stop still pending (absent status = pending); null when done. */
export function nextPendingStop(stops: RouteStop[]): RouteStop | null {
	return (
		stopsInOrder(stops).find(
			(s) => s.status === undefined || s.status === "pending",
		) ?? null
	);
}

/** Run progress: skipped counts as done — the run moved past that stop. */
export function runProgress(stops: RouteStop[]): { done: number; total: number } {
	const done = stops.filter(
		(s) => s.status === "visited" || s.status === "skipped",
	).length;
	return { done, total: stops.length };
}

/**
 * Remaining distance/time from the leg arriving at `currentStopOrder` through
 * the end (incl. the roundTrip return leg). Null when legs are missing or
 * stale (length must be stops + return leg) or the stop isn't found.
 */
export function remainingFromLegs(
	route: RouteRun,
	currentStopOrder: number,
): { distanceMeters: number; durationSeconds: number } | null {
	const { legs, stops, roundTrip } = route;
	if (!legs || legs.length !== stops.length + (roundTrip ? 1 : 0)) return null;
	const index = stopsInOrder(stops).findIndex(
		(s) => s.order === currentStopOrder,
	);
	if (index === -1) return null;
	let distanceMeters = 0;
	let durationSeconds = 0;
	for (const leg of legs.slice(index)) {
		distanceMeters += leg.distanceMeters;
		durationSeconds += leg.durationSeconds;
	}
	return { distanceMeters, durationSeconds };
}

/** The leg ARRIVING at the given stop ("X mi from previous"); null when legs are stale. */
export function legForStop(
	route: RouteRun,
	stopOrder: number,
): RouteLeg | null {
	const { legs, stops, roundTrip } = route;
	if (!legs || legs.length !== stops.length + (roundTrip ? 1 : 0)) return null;
	const index = stopsInOrder(stops).findIndex((s) => s.order === stopOrder);
	return index === -1 ? null : legs[index];
}

// Formatting mirrors the web routing page (stop-list-panel.tsx).

export function formatDistance(meters: number): string {
	return `${(meters / 1609.344).toFixed(1)} mi`;
}

export function formatDuration(seconds: number): string {
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	return `${hours} hr ${minutes % 60} min`;
}

// Turn-by-turn deep links (driving mode).

export function appleMapsUrl(lat: number, lng: number): string {
	return `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
}

/** Same handoff for records that have an address but no geocode yet. */
export function appleMapsAddressUrl(address: string): string {
	return `http://maps.apple.com/?daddr=${encodeURIComponent(address)}&dirflg=d`;
}

// Google's directions URL caps intermediary waypoints at 9 (documented limit);
// origin and destination ride on top of that.
const MAX_GOOGLE_WAYPOINTS = 9;

/**
 * Whole-route handoff to the Google Maps app via the cross-platform directions
 * URL (the comgooglemaps:// scheme has no waypoints support). Only PENDING
 * stops are sent, nearest-first; overflow beyond the waypoint cap is dropped
 * from the tail and reported so the UI can say so. Null when nothing is left
 * to drive.
 */
export function googleMapsRouteUrl(
	start: { latitude: number; longitude: number },
	stops: RouteStop[],
	roundTrip: boolean,
): { url: string; included: number; dropped: number } | null {
	const pending = stopsInOrder(stops).filter(
		(s) => (s.status ?? "pending") === "pending",
	);
	if (pending.length === 0) return null;

	const point = (p: { latitude: number; longitude: number }): string =>
		`${p.latitude},${p.longitude}`;
	const origin = point(start);
	const destination = roundTrip ? origin : point(pending[pending.length - 1]);
	const waypointStops = roundTrip ? pending : pending.slice(0, -1);
	const kept = waypointStops.slice(0, MAX_GOOGLE_WAYPOINTS);
	const included = roundTrip ? kept.length : kept.length + 1;
	const dropped = pending.length - included;

	const params = [
		"api=1",
		`origin=${encodeURIComponent(origin)}`,
		`destination=${encodeURIComponent(destination)}`,
		kept.length > 0
			? `waypoints=${encodeURIComponent(kept.map(point).join("|"))}`
			: null,
		"travelmode=driving",
	]
		.filter(Boolean)
		.join("&");

	return {
		url: `https://www.google.com/maps/dir/?${params}`,
		included,
		dropped,
	};
}

export function googleMapsUrl(lat: number, lng: number): string {
	return `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
}
