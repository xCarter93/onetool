/**
 * Local stop-ordering heuristic (nearest-neighbor + 2-opt) used when a route
 * exceeds the Mapbox Optimization v1 coordinate cap. Distances are haversine
 * (straight-line), so results are labeled "approximate" — road geometry still
 * comes from a Directions call afterward.
 */

export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(b.latitude - a.latitude);
	const dLng = toRad(b.longitude - a.longitude);
	const lat1 = toRad(a.latitude);
	const lat2 = toRad(b.latitude);

	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	// Clamp: float rounding can push h past 1 for antipodal points → NaN.
	return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Distance matrix over [start, ...stops]; index 0 is the start. */
function buildMatrix(points: LatLng[]): number[][] {
	const n = points.length;
	const m: number[][] = Array.from({ length: n }, () => new Array<number>(n));
	for (let i = 0; i < n; i++) {
		m[i][i] = 0;
		for (let j = i + 1; j < n; j++) {
			const d = haversineMeters(points[i], points[j]);
			m[i][j] = d;
			m[j][i] = d;
		}
	}
	return m;
}

/** Total length of a route [0, ...stopIndices], optionally returning to 0. */
function routeLength(
	matrix: number[][],
	order: number[],
	roundTrip: boolean
): number {
	let total = 0;
	let prev = 0;
	for (const idx of order) {
		total += matrix[prev][idx];
		prev = idx;
	}
	if (roundTrip) total += matrix[prev][0];
	return total;
}

const MAX_TWO_OPT_PASSES = 50;

/**
 * Order stops to minimize travel from a fixed start (index 0 internally).
 * Returns a permutation of stop indices (0-based into `stops`).
 */
export function solveStopOrder(
	start: LatLng,
	stops: LatLng[],
	roundTrip: boolean
): number[] {
	if (stops.length <= 1) return stops.map((_, i) => i);

	const matrix = buildMatrix([start, ...stops]);
	const n = stops.length;

	// Nearest-neighbor construction from the start.
	const unvisited = new Set<number>(
		Array.from({ length: n }, (_, i) => i + 1)
	);
	const order: number[] = [];
	let current = 0;
	while (unvisited.size > 0) {
		let best = -1;
		let bestDist = Infinity;
		for (const idx of unvisited) {
			if (matrix[current][idx] < bestDist) {
				bestDist = matrix[current][idx];
				best = idx;
			}
		}
		unvisited.delete(best);
		order.push(best);
		current = best;
	}

	// 2-opt improvement: reverse segments while it shortens the route.
	// n is small (≤ ~25 stops), so full-length recompute per candidate is fine.
	let bestLength = routeLength(matrix, order, roundTrip);
	for (let pass = 0; pass < MAX_TWO_OPT_PASSES; pass++) {
		let improved = false;
		for (let i = 0; i < order.length - 1; i++) {
			for (let k = i + 1; k < order.length; k++) {
				const candidate = order
					.slice(0, i)
					.concat(order.slice(i, k + 1).reverse(), order.slice(k + 1));
				const candidateLength = routeLength(matrix, candidate, roundTrip);
				if (candidateLength < bestLength - 1e-9) {
					order.splice(0, order.length, ...candidate);
					bestLength = candidateLength;
					improved = true;
				}
			}
		}
		if (!improved) break;
	}

	// Matrix indices are offset by 1 (0 = start); map back to stop indices.
	return order.map((idx) => idx - 1);
}
