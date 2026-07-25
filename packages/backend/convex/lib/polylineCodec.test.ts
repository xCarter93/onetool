import { describe, it, expect } from "vitest";
import {
	decodePolyline5,
	encodePolyline5,
	downsample,
	shrinkPolylineForQuery,
	type LngLat,
} from "./polylineCodec";

function syntheticRoute(points: number): LngLat[] {
	// Wiggly line across eastern Massachusetts.
	return Array.from({ length: points }, (_, i) => [
		-71.1 + i * 0.0004 + Math.sin(i / 7) * 0.0002,
		42.3 + i * 0.0003 + Math.cos(i / 11) * 0.0002,
	]);
}

describe("polylineCodec", () => {
	it("round-trips encode/decode within precision-5 tolerance", () => {
		const points = syntheticRoute(50);
		const decoded = decodePolyline5(encodePolyline5(points));
		expect(decoded).toHaveLength(50);
		for (let i = 0; i < points.length; i++) {
			expect(decoded[i][0]).toBeCloseTo(points[i][0], 4);
			expect(decoded[i][1]).toBeCloseTo(points[i][1], 4);
		}
	});

	it("decodes the canonical Google example", () => {
		// "_p~iF~ps|U_ulLnnqC_mqNvxq`@" ↔ (38.5,-120.2) (40.7,-120.95) (43.252,-126.453)
		const decoded = decodePolyline5("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
		expect(decoded).toEqual([
			[-120.2, 38.5],
			[-120.95, 40.7],
			[-126.453, 43.252],
		]);
	});

	it("downsample keeps endpoints and respects the budget", () => {
		const points = syntheticRoute(1000);
		const sampled = downsample(points, 100);
		expect(sampled).toHaveLength(100);
		expect(sampled[0]).toEqual(points[0]);
		expect(sampled.at(-1)).toEqual(points.at(-1));
		expect(downsample(points, 2000)).toBe(points);
	});

	it("shrinkPolylineForQuery caps encoded length and preserves endpoints", () => {
		const points = syntheticRoute(8000);
		const encoded = encodePolyline5(points);
		expect(encoded.length).toBeGreaterThan(4000);

		const shrunk = shrinkPolylineForQuery(encoded, 4000);
		expect(shrunk.length).toBeLessThanOrEqual(4000);

		const decoded = decodePolyline5(shrunk);
		expect(decoded[0][0]).toBeCloseTo(points[0][0], 4);
		expect(decoded.at(-1)![1]).toBeCloseTo(points.at(-1)![1], 4);
	});

	it("leaves short polylines untouched", () => {
		const encoded = encodePolyline5(syntheticRoute(20));
		expect(shrinkPolylineForQuery(encoded, 4000)).toBe(encoded);
	});
});
