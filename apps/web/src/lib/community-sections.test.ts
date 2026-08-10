import { describe, expect, it } from "vitest";
import {
	COMMUNITY_SECTION_IDS,
	hasRichTextContent,
	resolveSectionConfig,
	resolveSectionLayout,
	sectionLayoutMap,
	visibleSectionIds,
} from "./community-sections";

describe("resolveSectionConfig", () => {
	it("returns every section in default order when there is no config", () => {
		expect(resolveSectionConfig()).toEqual([
			{ id: "bio", visible: true },
			{ id: "services", visible: true },
			{ id: "pricing", visible: true, layout: "tiers" },
			{ id: "gallery", visible: true, layout: "carousel" },
			{ id: "faq", visible: true },
			{ id: "team", visible: true },
		]);
	});

	it("keeps the stored order and appends anything the config predates", () => {
		expect(
			resolveSectionConfig([
				{ id: "gallery", visible: true },
				{ id: "bio", visible: false },
			]),
		).toEqual([
			{ id: "gallery", visible: true, layout: "carousel" },
			{ id: "bio", visible: false },
			{ id: "services", visible: true },
			{ id: "pricing", visible: true, layout: "tiers" },
			{ id: "faq", visible: true },
			{ id: "team", visible: true },
		]);
	});

	it("drops unknown ids and repeats rather than rendering them", () => {
		const resolved = resolveSectionConfig([
			{ id: "reviews", visible: true },
			{ id: "bio", visible: false },
			{ id: "bio", visible: true },
		]);
		expect(resolved.filter((entry) => entry.id === "bio")).toEqual([
			{ id: "bio", visible: false },
		]);
		expect(resolved).toHaveLength(COMMUNITY_SECTION_IDS.length);
	});
	it("keeps a stored layout and falls back when it is not on offer", () => {
		expect(
			resolveSectionConfig([
				{ id: "gallery", visible: true, layout: "grid" },
				{ id: "pricing", visible: true, layout: "carousel" },
				{ id: "bio", visible: true, layout: "grid" },
			]),
		).toEqual([
			{ id: "gallery", visible: true, layout: "grid" },
			{ id: "pricing", visible: true, layout: "tiers" },
			{ id: "bio", visible: true },
			{ id: "services", visible: true },
			{ id: "faq", visible: true },
			{ id: "team", visible: true },
		]);
	});
});

describe("resolveSectionLayout", () => {
	it("defaults to the layout that shipped before the field existed", () => {
		expect(resolveSectionLayout("gallery")).toBe("carousel");
		expect(resolveSectionLayout("pricing")).toBe("tiers");
	});

	it("has nothing to resolve for a section with one presentation", () => {
		expect(resolveSectionLayout("bio", "grid")).toBeUndefined();
	});
});

describe("sectionLayoutMap", () => {
	it("answers for every section, configured or not", () => {
		expect(sectionLayoutMap([{ id: "gallery", visible: true, layout: "grid" }]))
			.toEqual({
				bio: undefined,
				services: undefined,
				pricing: "tiers",
				gallery: "grid",
				faq: undefined,
				team: undefined,
			});
	});
});

describe("visibleSectionIds", () => {
	it("drops hidden sections but keeps the order", () => {
		expect(
			visibleSectionIds([
				{ id: "pricing", visible: true },
				{ id: "bio", visible: false },
				{ id: "services", visible: true },
				{ id: "gallery", visible: false },
				{ id: "faq", visible: false },
				{ id: "team", visible: false },
			]),
		).toEqual(["pricing", "services"]);
	});
});

describe("hasRichTextContent", () => {
	it("treats an untouched editor doc as empty", () => {
		expect(
			hasRichTextContent({ type: "doc", content: [{ type: "paragraph" }] }),
		).toBe(false);
	});

	it("treats whitespace as empty and an image as content", () => {
		expect(
			hasRichTextContent({
				type: "doc",
				content: [
					{ type: "paragraph", content: [{ type: "text", text: "   " }] },
				],
			}),
		).toBe(false);
		expect(
			hasRichTextContent({ type: "doc", content: [{ type: "image" }] }),
		).toBe(true);
	});
});
