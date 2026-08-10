import { describe, expect, it } from "vitest";
import {
	DEFAULT_PAGE_LAYOUT,
	PAGE_LAYOUTS,
	resolvePageLayout,
} from "./community-layouts";

describe("resolvePageLayout", () => {
	it("defaults to the layout every existing page already renders", () => {
		expect(DEFAULT_PAGE_LAYOUT).toBe("showcase");
		expect(resolvePageLayout()).toBe("showcase");
		expect(resolvePageLayout(undefined)).toBe("showcase");
		expect(resolvePageLayout(null)).toBe("showcase");
	});

	it("maps the legacy Phase 8 theme names to Showcase", () => {
		expect(resolvePageLayout("clean-professional")).toBe("showcase");
		expect(resolvePageLayout("bold-modern")).toBe("showcase");
		expect(resolvePageLayout("warm-friendly")).toBe("showcase");
	});

	it("falls back rather than trusting anything unrecognised", () => {
		expect(resolvePageLayout("")).toBe("showcase");
		expect(resolvePageLayout("Storefront")).toBe("showcase");
	});

	it("keeps a stored layout", () => {
		for (const layout of PAGE_LAYOUTS) {
			expect(resolvePageLayout(layout)).toBe(layout);
		}
	});
});
