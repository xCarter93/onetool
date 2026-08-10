import { describe, expect, it } from "vitest";
import {
	communityColorModeClass,
	communityColorScheme,
	resolveColorMode,
} from "./community-theme";

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

	it("keeps a stored mode", () => {
		expect(resolveColorMode("dark")).toBe("dark");
		expect(resolveColorMode("system")).toBe("system");
	});
});

describe("communityColorModeClass", () => {
	it("pins light and dark, and leaves system to the visitor", () => {
		expect(communityColorModeClass("light")).toBe("light");
		expect(communityColorModeClass("dark")).toBe("dark");
		expect(communityColorModeClass("system")).toBeUndefined();
	});
});

describe("communityColorScheme", () => {
	it("tells native controls which theme they are inside", () => {
		expect(communityColorScheme("light")).toBe("light");
		expect(communityColorScheme("dark")).toBe("dark");
		expect(communityColorScheme("system")).toBe("light dark");
	});
});
