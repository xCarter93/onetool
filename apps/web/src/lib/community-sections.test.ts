import { describe, expect, it } from "vitest";
import {
	hasRichTextContent,
	resolveSectionConfig,
	visibleSectionIds,
} from "./community-sections";

describe("resolveSectionConfig", () => {
	it("returns every section in default order when there is no config", () => {
		expect(resolveSectionConfig()).toEqual([
			{ id: "bio", visible: true },
			{ id: "services", visible: true },
			{ id: "pricing", visible: true },
			{ id: "gallery", visible: true },
		]);
	});

	it("keeps the stored order and appends anything the config predates", () => {
		expect(
			resolveSectionConfig([
				{ id: "gallery", visible: true },
				{ id: "bio", visible: false },
			]),
		).toEqual([
			{ id: "gallery", visible: true },
			{ id: "bio", visible: false },
			{ id: "services", visible: true },
			{ id: "pricing", visible: true },
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
		expect(resolved).toHaveLength(4);
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
