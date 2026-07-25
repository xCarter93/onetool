import { describe, expect, it } from "vitest";
import { mapWebPathToMobileRoute } from "@/lib/assistant-nav";

describe("mapWebPathToMobileRoute", () => {
	it("maps home variants to the tabs root", () => {
		expect(mapWebPathToMobileRoute("/home")).toBe("/(tabs)");
		expect(mapWebPathToMobileRoute("/")).toBe("/(tabs)");
	});

	it("maps list pages to the Work tab", () => {
		expect(mapWebPathToMobileRoute("/projects")).toBe("/(tabs)/work");
		expect(mapWebPathToMobileRoute("/clients")).toBe("/(tabs)/work");
		expect(mapWebPathToMobileRoute("/quotes")).toBe("/(tabs)/work");
		expect(mapWebPathToMobileRoute("/invoices")).toBe("/(tabs)/work");
	});

	it("maps routing to the mobile Routes tab", () => {
		expect(mapWebPathToMobileRoute("/routing")).toBe("/(tabs)/routes");
	});

	it("maps client and project detail ids into the tabs group", () => {
		expect(mapWebPathToMobileRoute("/clients/abc123")).toBe("/(tabs)/clients/abc123");
		expect(mapWebPathToMobileRoute("/projects/xyz_789")).toBe("/(tabs)/projects/xyz_789");
	});

	it("maps quote and invoice detail ids to their top-level detail routes", () => {
		expect(mapWebPathToMobileRoute("/quotes/q1")).toBe("/quote/q1");
		expect(mapWebPathToMobileRoute("/invoices/i1")).toBe("/invoice/i1");
	});

	it("returns null for unmapped paths", () => {
		expect(mapWebPathToMobileRoute("/reports/new")).toBeNull();
		expect(mapWebPathToMobileRoute("/automations")).toBeNull();
		expect(mapWebPathToMobileRoute("/subscription")).toBeNull();
		expect(mapWebPathToMobileRoute("/organization/profile")).toBeNull();
		expect(mapWebPathToMobileRoute("/clients/import")).toBeNull();
	});

	it("returns null for unknown ids under otherwise-mapped prefixes", () => {
		expect(mapWebPathToMobileRoute("/clients")).not.toBeNull();
		expect(mapWebPathToMobileRoute("/clients/")).toBeNull();
	});
});
