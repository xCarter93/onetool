import { describe, expect, it } from "vitest";
import { resolvePaint, type IlloPalette } from "./paint";

const palette: IlloPalette = {
	surface: "#eceef0",
	line: "#5f646b",
	accent: "#0084d1",
	celebrate: "#0a9d6c",
	knockout: "#f6f7f8",
	destructive: "#dc2626",
};

describe("resolvePaint", () => {
	it("maps fills to the injected palette", () => {
		expect(resolvePaint("illo-surface", "md", palette)).toEqual({
			fill: "#eceef0",
		});
		expect(resolvePaint("illo-knock", "md", palette)).toEqual({
			fill: "#f6f7f8",
		});
		expect(resolvePaint("illo-accent-soft", "md", palette)).toEqual({
			fill: "#0084d1",
			opacity: 0.14,
		});
	});

	it("gives strokes fill:none and an array dasharray", () => {
		expect(resolvePaint("illo-dash", "md", palette)).toEqual({
			fill: "none",
			stroke: "#5f646b",
			strokeWidth: 1.5,
			strokeLinecap: "round",
			strokeDasharray: [4, 3.5],
			opacity: 0.55,
		});
	});

	// The .ot-illo-sm re-declares from globals.css, verified against source:
	// outline/accent-line/celebrate-line/dash 1.5→2.2, hair 0.75→1.1,
	// ground 1.5→2, bars 4→5, on-accent 1.8→1.4.
	it("re-declares stroke widths for the sm canvas", () => {
		const sw = (cls: string, size: "sm" | "md" | "hero") =>
			resolvePaint(cls, size, palette).strokeWidth;
		expect(sw("illo-outline", "sm")).toBe(2.2);
		expect(sw("illo-accent-line", "sm")).toBe(2.2);
		expect(sw("illo-celebrate-line", "sm")).toBe(2.2);
		expect(sw("illo-dash", "sm")).toBe(2.2);
		expect(sw("illo-hair", "sm")).toBe(1.1);
		expect(sw("illo-ground", "sm")).toBe(2);
		expect(sw("illo-bar", "sm")).toBe(5);
		expect(sw("illo-bar-quiet", "sm")).toBe(5);
		expect(sw("illo-bar-accent", "sm")).toBe(5);
		expect(sw("illo-on-accent", "sm")).toBe(1.4);
	});

	it("keeps base stroke widths at md and hero (no hero override block on web)", () => {
		for (const size of ["md", "hero"] as const) {
			expect(resolvePaint("illo-outline", size, palette).strokeWidth).toBe(1.5);
			expect(resolvePaint("illo-hair", size, palette).strokeWidth).toBe(0.75);
			expect(resolvePaint("illo-ground", size, palette).strokeWidth).toBe(1.5);
			expect(resolvePaint("illo-bar", size, palette).strokeWidth).toBe(4);
			expect(resolvePaint("illo-on-accent", size, palette).strokeWidth).toBe(1.8);
		}
	});

	it("merges space-separated classes with later classes winning (fill-* overrides)", () => {
		const merged = resolvePaint("illo-accent-line illo-fill-knock", "md", palette);
		expect(merged.stroke).toBe("#0084d1");
		expect(merged.fill).toBe("#f6f7f8"); // fill:none overridden by fill-knock
	});

	it("routes knockout through the palette (prop, not constant)", () => {
		const onCard = resolvePaint("illo-knock", "md", {
			...palette,
			knockout: "#ffffff",
		});
		expect(onCard.fill).toBe("#ffffff");
	});

	it("throws on unknown classes rather than silently rendering black", () => {
		expect(() => resolvePaint("illo-nope", "md", palette)).toThrow(
			/Unknown illustration class/,
		);
	});
});
