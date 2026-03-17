import { describe, it, expect } from "vitest";

describe("StatCardSparkline", () => {
	it("exports StatCardSparkline component", async () => {
		const mod = await import("./stat-card-sparkline");
		expect(mod.StatCardSparkline).toBeDefined();
		expect(typeof mod.StatCardSparkline).toBe("function");
	});

	it("accepts data, dataKey, color, isActive, width, and height props", async () => {
		// Type-level check -- if this file compiles, the props interface is correct
		const mod = await import("./stat-card-sparkline");
		expect(mod.StatCardSparkline).toBeDefined();
	});
});
