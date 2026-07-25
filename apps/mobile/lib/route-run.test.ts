import { describe, expect, it } from "vitest";
import {
	appleMapsUrl,
	legForStop,
	boundsFor,
	decodePolyline,
	formatDistance,
	formatDuration,
	googleMapsRouteUrl,
	googleMapsUrl,
	nextPendingStop,
	remainingFromLegs,
	routeLineFeature,
	runProgress,
	stopsInOrder,
	type RouteRun,
	type RouteStop,
} from "./route-run";

// Reference encoder (Google polyline algorithm) to build round-trip fixtures.
function encodePolyline(latLngs: [number, number][], precision: number): string {
	const factor = 10 ** precision;
	let out = "";
	let prevLat = 0;
	let prevLng = 0;
	const encodeValue = (delta: number) => {
		let v = delta < 0 ? ~(delta << 1) : delta << 1;
		let chunk = "";
		while (v >= 0x20) {
			chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
			v >>= 5;
		}
		return chunk + String.fromCharCode(v + 63);
	};
	for (const [lat, lng] of latLngs) {
		const latE = Math.round(lat * factor);
		const lngE = Math.round(lng * factor);
		out += encodeValue(latE - prevLat) + encodeValue(lngE - prevLng);
		prevLat = latE;
		prevLng = lngE;
	}
	return out;
}

const stop = (over: Partial<RouteStop> & { order: number }): RouteStop => ({
	label: `Stop ${over.order}`,
	latitude: 40 + over.order,
	longitude: -70 - over.order,
	...over,
});

describe("decodePolyline", () => {
	// Canonical Google test vector, precision 5 (lat,lng): (38.5,-120.2),
	// (40.7,-120.95), (43.252,-126.453).
	const CLASSIC = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

	it("decodes the published precision-5 vector as [lng, lat]", () => {
		expect(decodePolyline(CLASSIC, 5)).toEqual([
			[-120.2, 38.5],
			[-120.95, 40.7],
			[-126.453, 43.252],
		]);
	});

	it("round-trips a hand-encoded precision-5 fixture", () => {
		const latLngs: [number, number][] = [
			[42.35843, -71.05977],
			[42.36, -71.06],
			[42.4, -71.1],
		];
		const decoded = decodePolyline(encodePolyline(latLngs, 5), 5);
		decoded.forEach(([lng, lat], i) => {
			expect(lat).toBeCloseTo(latLngs[i][0], 5);
			expect(lng).toBeCloseTo(latLngs[i][1], 5);
		});
	});

	it("respects precision 6", () => {
		const latLngs: [number, number][] = [[42.358431, -71.059773]];
		const [[lng, lat]] = decodePolyline(encodePolyline(latLngs, 6), 6);
		expect(lat).toBeCloseTo(42.358431, 6);
		expect(lng).toBeCloseTo(-71.059773, 6);
	});

	it("returns [] for an empty string", () => {
		expect(decodePolyline("", 5)).toEqual([]);
	});
});

describe("routeLineFeature", () => {
	it("wraps the precision-5 decode in a GeoJSON LineString Feature", () => {
		const feature = routeLineFeature("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
		expect(feature.type).toBe("Feature");
		expect(feature.geometry.type).toBe("LineString");
		expect(feature.geometry.coordinates[0]).toEqual([-120.2, 38.5]);
		expect(feature.geometry.coordinates).toHaveLength(3);
	});
});

describe("boundsFor", () => {
	it("returns null for no coordinates", () => {
		expect(boundsFor([])).toBeNull();
	});

	it("collapses a single point to a zero-size box", () => {
		expect(boundsFor([[-71, 42]])).toEqual({ ne: [-71, 42], sw: [-71, 42] });
	});

	it("spans all points", () => {
		expect(
			boundsFor([
				[-71, 42],
				[-70, 41],
				[-72, 43],
			]),
		).toEqual({ ne: [-70, 43], sw: [-72, 41] });
	});
});

describe("stopsInOrder", () => {
	it("sorts a copy by order without mutating the input", () => {
		const stops = [stop({ order: 2 }), stop({ order: 0 }), stop({ order: 1 })];
		const sorted = stopsInOrder(stops);
		expect(sorted.map((s) => s.order)).toEqual([0, 1, 2]);
		expect(stops.map((s) => s.order)).toEqual([2, 0, 1]);
	});
});

describe("nextPendingStop", () => {
	it("treats an absent status as pending", () => {
		expect(nextPendingStop([stop({ order: 0 })])?.order).toBe(0);
	});

	it("skips visited AND skipped stops", () => {
		const stops = [
			stop({ order: 0, status: "visited" }),
			stop({ order: 1, status: "skipped" }),
			stop({ order: 2, status: "pending" }),
		];
		expect(nextPendingStop(stops)?.order).toBe(2);
	});

	it("picks the lowest order regardless of array position", () => {
		const stops = [stop({ order: 3 }), stop({ order: 1 })];
		expect(nextPendingStop(stops)?.order).toBe(1);
	});

	it("returns null when every stop is visited or skipped", () => {
		const stops = [
			stop({ order: 0, status: "visited" }),
			stop({ order: 1, status: "skipped" }),
		];
		expect(nextPendingStop(stops)).toBeNull();
	});
});

describe("runProgress", () => {
	it("counts visited and skipped as done", () => {
		const stops = [
			stop({ order: 0, status: "visited" }),
			stop({ order: 1, status: "skipped" }),
			stop({ order: 2, status: "pending" }),
			stop({ order: 3 }),
		];
		expect(runProgress(stops)).toEqual({ done: 2, total: 4 });
	});

	it("handles an empty run", () => {
		expect(runProgress([])).toEqual({ done: 0, total: 0 });
	});
});

describe("remainingFromLegs", () => {
	const legs = [
		{ distanceMeters: 100, durationSeconds: 60 },
		{ distanceMeters: 200, durationSeconds: 120 },
		{ distanceMeters: 300, durationSeconds: 180 },
	];
	const stops = [stop({ order: 0 }), stop({ order: 1 }), stop({ order: 2 })];

	it("sums from the leg arriving at the current stop through the end", () => {
		const route: RouteRun = { stops, roundTrip: false, legs };
		expect(remainingFromLegs(route, 1)).toEqual({
			distanceMeters: 500,
			durationSeconds: 300,
		});
	});

	it("includes the return leg on a round trip", () => {
		const route: RouteRun = {
			stops: [stop({ order: 0 }), stop({ order: 1 })],
			roundTrip: true,
			legs, // 2 stops + 1 return leg
		};
		expect(remainingFromLegs(route, 1)).toEqual({
			distanceMeters: 500,
			durationSeconds: 300,
		});
	});

	it("returns null when legs are missing", () => {
		expect(remainingFromLegs({ stops, roundTrip: false }, 0)).toBeNull();
	});

	it("returns null when legs are stale (length mismatch)", () => {
		const route: RouteRun = { stops, roundTrip: true, legs }; // expects 4
		expect(remainingFromLegs(route, 0)).toBeNull();
	});

	it("returns null for an unknown stop order", () => {
		const route: RouteRun = { stops, roundTrip: false, legs };
		expect(remainingFromLegs(route, 9)).toBeNull();
	});
});

describe("formatDistance", () => {
	it("formats zero", () => {
		expect(formatDistance(0)).toBe("0.0 mi");
	});

	it("formats under a mile with one decimal", () => {
		expect(formatDistance(804.672)).toBe("0.5 mi");
	});

	it("formats miles", () => {
		expect(formatDistance(1609.344)).toBe("1.0 mi");
		expect(formatDistance(16093.44)).toBe("10.0 mi");
	});
});

describe("formatDuration", () => {
	it("formats zero", () => {
		expect(formatDuration(0)).toBe("0 min");
	});

	it("rounds sub-minute values", () => {
		expect(formatDuration(29)).toBe("0 min");
		expect(formatDuration(31)).toBe("1 min");
	});

	it("formats minutes under an hour", () => {
		expect(formatDuration(59 * 60)).toBe("59 min");
	});

	it("formats hours and minutes", () => {
		expect(formatDuration(3600)).toBe("1 hr 0 min");
		expect(formatDuration(2 * 3600 + 5 * 60)).toBe("2 hr 5 min");
	});
});

describe("deep links", () => {
	it("builds the Apple Maps driving URL", () => {
		expect(appleMapsUrl(42.36, -71.06)).toBe(
			"http://maps.apple.com/?daddr=42.36,-71.06&dirflg=d",
		);
	});

	it("builds the Google Maps driving URL", () => {
		expect(googleMapsUrl(42.36, -71.06)).toBe(
			"comgooglemaps://?daddr=42.36,-71.06&directionsmode=driving",
		);
	});
});

describe("legForStop", () => {
	const stops = [
		{ label: "A", latitude: 1, longitude: 1, order: 0 },
		{ label: "B", latitude: 2, longitude: 2, order: 1 },
	];
	const legs = [
		{ distanceMeters: 100, durationSeconds: 60 },
		{ distanceMeters: 200, durationSeconds: 120 },
		{ distanceMeters: 300, durationSeconds: 180 },
	];

	it("returns the arriving leg by sorted position", () => {
		expect(legForStop({ stops, roundTrip: true, legs }, 1)).toEqual({
			distanceMeters: 200,
			durationSeconds: 120,
		});
	});

	it("null when legs are stale or the order is unknown", () => {
		expect(legForStop({ stops, roundTrip: false, legs }, 0)).toBeNull();
		expect(legForStop({ stops, roundTrip: true, legs }, 9)).toBeNull();
		expect(legForStop({ stops, roundTrip: true }, 0)).toBeNull();
	});
});

describe("googleMapsRouteUrl", () => {
	const start = { latitude: 42.1, longitude: -71.1 };
	const stop = (order: number, status?: "pending" | "visited" | "skipped") => ({
		label: `S${order}`,
		latitude: 42 + order,
		longitude: -71 - order,
		order,
		status,
	});

	it("round trip: destination is the start, pending stops are waypoints", () => {
		const r = googleMapsRouteUrl(start, [stop(0), stop(1)], true);
		expect(r).not.toBeNull();
		expect(r!.url).toContain(`origin=${encodeURIComponent("42.1,-71.1")}`);
		expect(r!.url).toContain(`destination=${encodeURIComponent("42.1,-71.1")}`);
		expect(r!.url).toContain(
			`waypoints=${encodeURIComponent("42,-71|43,-72")}`
		);
		expect(r!.included).toBe(2);
		expect(r!.dropped).toBe(0);
	});

	it("one-way: last pending stop becomes the destination", () => {
		const r = googleMapsRouteUrl(start, [stop(0), stop(1)], false);
		expect(r!.url).toContain(`destination=${encodeURIComponent("43,-72")}`);
		expect(r!.url).toContain(`waypoints=${encodeURIComponent("42,-71")}`);
		expect(r!.included).toBe(2);
	});

	it("skips visited/skipped stops and returns null when none pending", () => {
		const r = googleMapsRouteUrl(
			start,
			[stop(0, "visited"), stop(1), stop(2, "skipped")],
			false
		);
		expect(r!.url).not.toContain("waypoints=");
		expect(r!.url).toContain(`destination=${encodeURIComponent("43,-72")}`);
		expect(
			googleMapsRouteUrl(start, [stop(0, "visited")], true)
		).toBeNull();
	});

	it("caps waypoints at 9 and reports the overflow", () => {
		const many = Array.from({ length: 12 }, (_, i) => stop(i));
		const round = googleMapsRouteUrl(start, many, true);
		expect(round!.included).toBe(9);
		expect(round!.dropped).toBe(3);
		const oneWay = googleMapsRouteUrl(start, many, false);
		expect(oneWay!.included).toBe(10);
		expect(oneWay!.dropped).toBe(2);
	});
});
