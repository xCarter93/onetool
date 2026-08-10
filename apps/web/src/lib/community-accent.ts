import type { CommunityColorMode } from "./community-theme";

/**
 * The owner's brand colour on the public community page.
 *
 * Stored raw — whatever hex the owner picked — and corrected at render time
 * against the background their colour mode actually produces. Storing the raw
 * pick means a published page inherits any later improvement to the solver, and
 * that an owner who switches light to dark does not have to re-choose.
 *
 * The corrected pair is written onto the page wrapper as `--primary` and
 * `--primary-fg`. Those are the two variables every `bg-primary` / `text-primary`
 * / `border-primary` utility on the page resolves through, because the token
 * block is declared with `@theme inline` (the utility emits `var(--primary)`
 * rather than a copy captured at `:root`).
 */

/** WCAG 2.1 AA for normal text. The page uses the accent for links and small labels. */
const CONTRAST_TARGET = 4.5;

/** OneTool blue, the `--primary` every page had before this control existed. */
export const DEFAULT_COMMUNITY_ACCENT = "#00a6f4";

/**
 * Eight starting points, not a colour theory exercise. They are shown corrected
 * for the page's colour mode, so these raw values only have to be recognisable.
 */
export const COMMUNITY_ACCENT_PRESETS: ReadonlyArray<{
	name: string;
	hex: string;
}> = [
	{ name: "Ocean", hex: DEFAULT_COMMUNITY_ACCENT },
	{ name: "Indigo", hex: "#4f46e5" },
	{ name: "Violet", hex: "#7c3aed" },
	{ name: "Pine", hex: "#059669" },
	{ name: "Lime", hex: "#65a30d" },
	{ name: "Amber", hex: "#d97706" },
	{ name: "Ember", hex: "#dc2626" },
	{ name: "Slate", hex: "#475569" },
];

/**
 * The page background each colour mode renders, copied verbatim from the `--bg`
 * declarations in `app/globals.css`. The solver needs a number and CSS is not
 * readable at runtime, so `community-accent.test.ts` reads globals.css and fails
 * if either of these strings drifts from the stylesheet.
 */
export const COMMUNITY_PAGE_BACKGROUND: Record<CommunityColorMode, string> = {
	light: "oklch(0.97 0 0)",
	dark: "oklch(0.168 0.019 264.665)",
};

type Rgb = readonly [number, number, number];

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** True only for a value safe to serialize into a style attribute. */
export function isAccentHex(value: string): boolean {
	return HEX_PATTERN.test(value.trim());
}

/** Any accepted form to `#rrggbb` lowercase; anything else to the default. */
export function normalizeAccent(stored?: string | null): string {
	const raw = stored?.trim().toLowerCase() ?? "";
	if (!HEX_PATTERN.test(raw)) return DEFAULT_COMMUNITY_ACCENT;
	if (raw.length === 4) {
		return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
	}
	return raw;
}

function hexToRgb(hex: string): Rgb {
	const n = normalizeAccent(hex);
	return [
		parseInt(n.slice(1, 3), 16),
		parseInt(n.slice(3, 5), 16),
		parseInt(n.slice(5, 7), 16),
	];
}

function rgbToHex([r, g, b]: Rgb): string {
	const part = (c: number) =>
		Math.round(Math.min(255, Math.max(0, c)))
			.toString(16)
			.padStart(2, "0");
	return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG relative luminance. */
export function relativeLuminance([r, g, b]: Rgb): number {
	const channel = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return (
		0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
	);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	return la > lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

/**
 * `oklch(L C H)` to sRGB. Only the space globals.css writes its tokens in, and
 * only the three-number form — this is a reader for our own stylesheet, not a
 * general CSS colour parser.
 */
export function oklchToRgb(css: string): Rgb {
	const match = css
		.trim()
		.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i);
	if (!match) throw new Error(`Not an oklch() colour: ${css}`);
	const L = Number(match[1]);
	const C = Number(match[2]);
	const hue = (Number(match[3]) * Math.PI) / 180;

	const a = C * Math.cos(hue);
	const b = C * Math.sin(hue);
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	const encoded = linear.map((c) => {
		const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
		return Math.round(Math.min(1, Math.max(0, v)) * 255);
	});
	return [encoded[0], encoded[1], encoded[2]];
}

function round([r, g, b]: Rgb): Rgb {
	return [Math.round(r), Math.round(g), Math.round(b)];
}

function mix(from: Rgb, to: Rgb, t: number): Rgb {
	return [
		from[0] + (to[0] - from[0]) * t,
		from[1] + (to[1] - from[1]) * t,
		from[2] + (to[2] - from[2]) * t,
	];
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

/**
 * The smallest move toward black (on a light page) or white (on a dark one)
 * that clears the contrast target. Mixing toward either endpoint is monotonic
 * in luminance, so the binary search is exact; and because black clears 19:1 on
 * the light background and white clears 19:1 on the dark one, a solution always
 * exists.
 *
 * The search tests the rounded colour, not the continuous one. A mix that
 * clears 4.5:1 in floating point can fall to 4.49 once its channels are
 * quantized to bytes, and the byte is what the browser paints — so the walk at
 * the end steps past any such landing, one 8-bit increment at a time.
 */
function correctForBackground(accent: Rgb, background: Rgb): Rgb {
	if (contrastRatio(round(accent), background) >= CONTRAST_TARGET) {
		return round(accent);
	}

	const target = relativeLuminance(background) > 0.5 ? BLACK : WHITE;
	const clears = (t: number) =>
		contrastRatio(round(mix(accent, target, t)), background) >= CONTRAST_TARGET;

	let low = 0;
	let high = 1;
	for (let i = 0; i < 16; i += 1) {
		const mid = (low + high) / 2;
		if (clears(mid)) high = mid;
		else low = mid;
	}
	while (high < 1 && !clears(high)) high = Math.min(1, high + 1 / 255);
	return round(mix(accent, target, high));
}

export interface ResolvedAccent {
	/** Corrected brand colour; the value written to `--primary`. */
	primary: string;
	/** Readable on `primary`; the value written to `--primary-fg`. */
	primaryFg: string;
	/** True when the owner's pick had to be darkened or lightened to be legible. */
	adjusted: boolean;
}

/**
 * The owner's colour, made legible on the page they chose.
 *
 * Two guarantees, both asserted in the tests: the returned `primary` clears
 * 4.5:1 against that mode's background, and `primaryFg` clears 4.5:1 against
 * `primary`. Every returned string is re-serialized from numbers, so nothing an
 * owner typed can reach a style attribute verbatim.
 */
export function resolveAccent(
	stored: string | null | undefined,
	mode: CommunityColorMode,
): ResolvedAccent {
	const accent = hexToRgb(normalizeAccent(stored));
	const background = oklchToRgb(COMMUNITY_PAGE_BACKGROUND[mode]);
	const corrected = correctForBackground(accent, background);
	const primary = rgbToHex(corrected);
	const onWhite = contrastRatio(corrected, WHITE);
	const onBlack = contrastRatio(corrected, BLACK);
	return {
		primary,
		primaryFg: onWhite >= onBlack ? "#ffffff" : "#000000",
		adjusted: primary !== normalizeAccent(stored),
	};
}
