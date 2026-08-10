import { describe, expect, it } from "vitest";
import { COMMUNITY_COLOR_MODES, resolveColorMode } from "./community-theme";

describe("resolveColorMode", () => {
	it("defaults to light so a stranger sees the page the owner designed", () => {
		expect(resolveColorMode()).toBe("light");
		expect(resolveColorMode(undefined)).toBe("light");
		expect(resolveColorMode(null)).toBe("light");
	});

	it("falls back rather than trusting a value the editor never wrote", () => {
		expect(resolveColorMode("clean-professional")).toBe("light");
		expect(resolveColorMode("")).toBe("light");
	});

	it("lands the retired 'system' mode on light", () => {
		expect(resolveColorMode("system")).toBe("light");
	});

	it("keeps a stored mode", () => {
		expect(resolveColorMode("dark")).toBe("dark");
		expect(COMMUNITY_COLOR_MODES).toEqual(["light", "dark"]);
	});
});
