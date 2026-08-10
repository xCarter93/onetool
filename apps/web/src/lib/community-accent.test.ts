import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	COMMUNITY_ACCENT_PRESETS,
	COMMUNITY_PAGE_BACKGROUND,
	DEFAULT_COMMUNITY_ACCENT,
	contrastRatio,
	isAccentHex,
	normalizeAccent,
	oklchToRgb,
	resolveAccent,
} from "./community-accent";
import { COMMUNITY_COLOR_MODES } from "./community-theme";

const hexToRgb = (hex: string) =>
	[
		parseInt(hex.slice(1, 3), 16),
		parseInt(hex.slice(3, 5), 16),
		parseInt(hex.slice(5, 7), 16),
	] as const;

/** A spread of hues and lightnesses, including the ones that need the most correction. */
const SAMPLES = [
	"#ffffff",
	"#000000",
	"#ffff00",
	"#00ff00",
	"#00ffff",
	"#ff00ff",
	"#7f7f7f",
	"#123456",
	"#fde047",
	"#1e1b4b",
];

describe("normalizeAccent", () => {
	it("falls back to OneTool blue for anything that is not a hex colour", () => {
		expect(normalizeAccent()).toBe(DEFAULT_COMMUNITY_ACCENT);
		expect(normalizeAccent(null)).toBe(DEFAULT_COMMUNITY_ACCENT);
		expect(normalizeAccent("")).toBe(DEFAULT_COMMUNITY_ACCENT);
		expect(normalizeAccent("rebeccapurple")).toBe(DEFAULT_COMMUNITY_ACCENT);
		expect(normalizeAccent("red;background:url(x)")).toBe(
			DEFAULT_COMMUNITY_ACCENT,
		);
	});

	it("expands shorthand and lowercases", () => {
		expect(normalizeAccent("#ABC")).toBe("#aabbcc");
		expect(normalizeAccent("  #DC2626 ")).toBe("#dc2626");
	});
});

describe("isAccentHex", () => {
	it("accepts only the forms a style attribute can safely carry", () => {
		expect(isAccentHex("#00a6f4")).toBe(true);
		expect(isAccentHex("#abc")).toBe(true);
		expect(isAccentHex("blue")).toBe(false);
		expect(isAccentHex("#00a6f")).toBe(false);
		expect(isAccentHex("#00a6f4;color:red")).toBe(false);
	});
});

describe("oklchToRgb", () => {
	it("matches the two token values globals.css states in both forms", () => {
		// --primary is rgb(0, 166, 244) in light and this oklch in dark.
		expect(oklchToRgb("oklch(0.685 0.169 237.323)")).toEqual([0, 166, 244]);
		expect(oklchToRgb(COMMUNITY_PAGE_BACKGROUND.light)).toEqual([
			245, 245, 245,
		]);
	});
});

describe("COMMUNITY_PAGE_BACKGROUND", () => {
	it("still matches the --bg tokens in globals.css", () => {
		const css = readFileSync(
			join(__dirname, "..", "app", "globals.css"),
			"utf8",
		);
		const blockFor = (selector: string) => {
			const start = css.indexOf(selector);
			expect(start, `${selector} block missing from globals.css`).toBeGreaterThan(-1);
			return css.slice(start, css.indexOf("}", start));
		};
		const bgIn = (block: string) => block.match(/--bg:\s*([^;]+);/)?.[1].trim();

		expect(bgIn(blockFor(":root,\n.light {"))).toBe(
			COMMUNITY_PAGE_BACKGROUND.light,
		);
		expect(bgIn(blockFor(".dark {"))).toBe(COMMUNITY_PAGE_BACKGROUND.dark);
	});
});

describe("resolveAccent", () => {
	const candidates = [
		...COMMUNITY_ACCENT_PRESETS.map((preset) => preset.hex),
		...SAMPLES,
	];

	for (const mode of COMMUNITY_COLOR_MODES) {
		it(`keeps every colour legible on the ${mode} page`, () => {
			const background = oklchToRgb(COMMUNITY_PAGE_BACKGROUND[mode]);
			for (const hex of candidates) {
				const { primary, primaryFg } = resolveAccent(hex, mode);
				expect(
					contrastRatio(hexToRgb(primary), background),
					`${hex} on ${mode} background`,
				).toBeGreaterThanOrEqual(4.5);
				expect(
					contrastRatio(hexToRgb(primaryFg), hexToRgb(primary)),
					`${hex} label on ${mode} accent`,
				).toBeGreaterThanOrEqual(4.5);
			}
		});
	}

	it("leaves a colour alone when it is already readable", () => {
		// Ocean is the token the page shipped with, on the page it shipped on.
		const resolved = resolveAccent(DEFAULT_COMMUNITY_ACCENT, "dark");
		expect(resolved.primary).toBe(DEFAULT_COMMUNITY_ACCENT);
		expect(resolved.adjusted).toBe(false);
	});

	it("reports the correction it had to make", () => {
		const resolved = resolveAccent("#fde047", "light");
		expect(resolved.adjusted).toBe(true);
		expect(resolved.primary).not.toBe("#fde047");
	});

	it("corrects in opposite directions for the two modes", () => {
		const light = resolveAccent("#fde047", "light").primary;
		const dark = resolveAccent("#1e1b4b", "dark").primary;
		expect(light < "#fde047").toBe(true);
		expect(dark > "#1e1b4b").toBe(true);
	});

	it("only ever emits values it built itself", () => {
		const resolved = resolveAccent("#DC2626; content: 'x'", "light");
		expect(resolved.primary).toMatch(/^#[0-9a-f]{6}$/);
		expect(["#ffffff", "#000000"]).toContain(resolved.primaryFg);
	});
});
