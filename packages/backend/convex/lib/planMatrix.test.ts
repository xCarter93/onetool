import { describe, it, expect } from "vitest";
import { DISPLAY_ONLY_MATRIX_KEYS, PLAN_MATRIX } from "./planMatrix";
import { FEATURES, METERS, type FeatureKey, type MeterKey } from "./entitlements";

const DISPLAY_ONLY = new Set<string>(DISPLAY_ONLY_MATRIX_KEYS);

/**
 * PLAN_MATRIX is the advertised copy; FEATURES/METERS are enforcement truth.
 * Every matrix row whose key names a map row must agree with it — this is the
 * "copy can never drift from enforcement" invariant (PRD §4).
 */
describe("PLAN_MATRIX ↔ entitlement map consistency", () => {
	it("every row is map-backed or on the display-only allowlist", () => {
		for (const row of PLAN_MATRIX) {
			if (DISPLAY_ONLY.has(row.key)) continue;
			const backed =
				FEATURES[row.key as FeatureKey] !== undefined ||
				METERS[row.key as MeterKey] !== undefined;
			expect(backed, `advertised row "${row.key}" has no enforcement-map row`).toBe(
				true
			);
		}
	});

	it("switch-backed rows mirror the map's booleans", () => {
		for (const row of PLAN_MATRIX) {
			const feature = FEATURES[row.key as FeatureKey];
			if (!feature) continue;
			expect(row.free, row.key).toBe(feature.free);
			expect(row.business, row.key).toBe(feature.business);
		}
	});

	it("meter-backed rows mirror the map's limits", () => {
		for (const row of PLAN_MATRIX) {
			const meter = METERS[row.key as MeterKey];
			if (!meter) continue;
			expect(row.free, row.key).toBe(
				meter.free === null ? "Unlimited" : String(meter.free)
			);
			expect(row.business, row.key).toBe(
				meter.business === null ? "Unlimited" : String(meter.business)
			);
		}
	});

	it("every advertised meter appears in the matrix", () => {
		const keys = new Set(PLAN_MATRIX.map((row) => row.key));
		for (const [key, meter] of Object.entries(METERS)) {
			if (meter.advertised) {
				expect(keys.has(key), key).toBe(true);
			}
		}
	});

	it("rows keep unique keys and non-empty labels", () => {
		const keys = PLAN_MATRIX.map((row) => row.key);
		expect(new Set(keys).size).toBe(keys.length);
		for (const row of PLAN_MATRIX) {
			expect(row.label.length).toBeGreaterThan(0);
		}
	});
});
