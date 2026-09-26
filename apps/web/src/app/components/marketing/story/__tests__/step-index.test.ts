import { describe, expect, it } from "vitest";
import { stepIndex } from "../step-index";

describe("stepIndex", () => {
	it("enters a chapter at its scheduled clock time", () => {
		expect(stepIndex(3, 3.999)).toBe(3);
		expect(stepIndex(3, 4)).toBe(4);
		expect(stepIndex(3, 4.3)).toBe(4);
	});

	it("retreats only once the position clears the band below a boundary", () => {
		expect(stepIndex(4, 3.95)).toBe(4);
		expect(stepIndex(4, 3.919)).toBe(3);
		expect(stepIndex(4, 3.5)).toBe(3);
	});

	it("never flips inside the sticky band", () => {
		for (const x of [3.93, 3.97, 3.999]) {
			expect(stepIndex(3, x)).toBe(3);
			expect(stepIndex(4, x)).toBe(4);
		}
	});

	it("lands on the right scene after a fast jump across several boundaries", () => {
		expect(stepIndex(0, 7.5)).toBe(7);
		expect(stepIndex(9, 1.2)).toBe(1);
	});

	it("clamps to the scene range", () => {
		expect(stepIndex(11, 14)).toBe(11);
		expect(stepIndex(0, -1)).toBe(0);
	});
});
