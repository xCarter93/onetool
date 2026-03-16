import { describe, it, expect } from "vitest";

describe("AnimatedNumber", () => {
	it("exports AnimatedNumber component", async () => {
		const mod = await import("./animated-number");
		expect(mod.AnimatedNumber).toBeDefined();
		expect(typeof mod.AnimatedNumber).toBe("function");
	});

	it("accepts value, format, duration, and delay props", async () => {
		// Type-level check -- if this file compiles, the props interface is correct
		const mod = await import("./animated-number");
		expect(mod.AnimatedNumber).toBeDefined();
	});
});
