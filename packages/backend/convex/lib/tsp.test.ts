import { describe, it, expect } from "vitest";
import { haversineMeters, solveStopOrder, type LatLng } from "./tsp";

const p = (latitude: number, longitude: number): LatLng => ({
	latitude,
	longitude,
});

function orderedLength(
	start: LatLng,
	stops: LatLng[],
	order: number[],
	roundTrip: boolean
): number {
	let total = 0;
	let prev = start;
	for (const idx of order) {
		total += haversineMeters(prev, stops[idx]);
		prev = stops[idx];
	}
	if (roundTrip) total += haversineMeters(prev, start);
	return total;
}

describe("haversineMeters", () => {
	it("returns 0 for identical points", () => {
		expect(haversineMeters(p(40, -74), p(40, -74))).toBe(0);
	});

	it("computes a known distance (1 degree of latitude ≈ 111.2 km)", () => {
		const d = haversineMeters(p(40, -74), p(41, -74));
		expect(d).toBeGreaterThan(110_000);
		expect(d).toBeLessThan(112_500);
	});

	it("is symmetric", () => {
		const a = p(42.36, -71.06);
		const b = p(40.71, -74.01);
		expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
	});
});

describe("solveStopOrder", () => {
	it("handles empty and single-stop inputs", () => {
		expect(solveStopOrder(p(0, 0), [], false)).toEqual([]);
		expect(solveStopOrder(p(0, 0), [p(1, 1)], false)).toEqual([0]);
	});

	it("returns a permutation of all stop indices", () => {
		const stops = [p(1, 0), p(2, 0), p(0.5, 0.5), p(3, 1), p(1.5, -1)];
		const order = solveStopOrder(p(0, 0), stops, true);
		expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
	});

	it("orders stops along a line from the start", () => {
		// Start at origin; stops strung northward. Optimal visiting order is
		// nearest-to-farthest for an open route.
		const stops = [p(3, 0), p(1, 0), p(4, 0), p(2, 0)];
		const order = solveStopOrder(p(0, 0), stops, false);
		expect(order).toEqual([1, 3, 0, 2]);
	});

	it("beats a deliberately bad order", () => {
		const stops = [p(5, 0), p(1, 0), p(4, 0), p(2, 0), p(3, 0)];
		const solved = solveStopOrder(p(0, 0), stops, false);
		const worst = [0, 1, 2, 3, 4]; // 5,1,4,2,3 — zig-zag
		expect(orderedLength(p(0, 0), stops, solved, false)).toBeLessThan(
			orderedLength(p(0, 0), stops, worst, false)
		);
	});

	it("2-opt uncrosses a route nearest-neighbor gets wrong", () => {
		// Square-ish layout where greedy NN from the start produces a crossing
		// tour; 2-opt must recover the perimeter order for the round trip.
		const start = p(0, 0);
		const stops = [p(0, 1), p(1, 1), p(1, 0), p(0.4, 0.5)];
		const order = solveStopOrder(start, stops, true);
		const len = orderedLength(start, stops, order, true);

		// Brute-force optimum over all 24 permutations.
		const perms: number[][] = [];
		const permute = (arr: number[], cur: number[]) => {
			if (arr.length === 0) perms.push(cur);
			arr.forEach((x, i) =>
				permute(arr.filter((_, j) => j !== i), [...cur, x])
			);
		};
		permute([0, 1, 2, 3], []);
		const best = Math.min(
			...perms.map((o) => orderedLength(start, stops, o, true))
		);
		expect(len).toBeCloseTo(best, 6);
	});

	it("round-trip and open routes can differ", () => {
		const stops = [p(1, 0), p(2, 0), p(3, 0)];
		const open = solveStopOrder(p(0, 0), stops, false);
		expect(open).toEqual([0, 1, 2]); // farthest last when not returning
	});
});
