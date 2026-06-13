import { describe, expect, it } from "vitest";
import {
	CEILING_MS,
	FLOOR_MS,
	computeDismiss,
	shouldForceDismiss,
} from "./launch-gate";

// Pure unit test of the Phase 27 launch dismissal gate. Locks the truth table
// Plan 02's animated overlay consumes: dismiss only when resources are ready AND
// the brand-beat floor has elapsed, with a hard CEILING_MS deadlock override.

describe("computeDismiss(ready, floorElapsed)", () => {
	it("returns false when neither condition is met", () => {
		expect(computeDismiss(false, false)).toBe(false);
	});

	it("returns false when ready early but the floor has not elapsed", () => {
		expect(computeDismiss(true, false)).toBe(false);
	});

	it("returns false when the floor elapsed but resources are not ready", () => {
		expect(computeDismiss(false, true)).toBe(false);
	});

	it("returns true only when both ready and floorElapsed", () => {
		expect(computeDismiss(true, true)).toBe(true);
	});
});

describe("dismissal constants", () => {
	it("FLOOR_MS is the progress-completion floor (3350)", () => {
		expect(FLOOR_MS).toBe(3350);
	});

	it("CEILING_MS is the hard deadlock guard (8000)", () => {
		expect(CEILING_MS).toBe(8000);
	});
});

describe("shouldForceDismiss(elapsedMs)", () => {
	it("forces dismissal at the ceiling boundary", () => {
		expect(shouldForceDismiss(8000)).toBe(true);
	});

	it("forces dismissal past the ceiling", () => {
		expect(shouldForceDismiss(9000)).toBe(true);
	});

	it("does not force dismissal just below the ceiling", () => {
		expect(shouldForceDismiss(7999)).toBe(false);
	});

	it("does not force dismissal at the floor", () => {
		expect(shouldForceDismiss(3350)).toBe(false);
	});
});
