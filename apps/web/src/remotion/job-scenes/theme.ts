import type { CSSProperties } from "react";

/**
 * OneTool tokens for the "What's inside" job scenes — the landing page's dark
 * palette (same oklch values as the marketing comp), scaled for video frames.
 * Fixed dark on purpose: the scenes read as product media in both page themes.
 */
export const T = {
	paper: "oklch(0.168 0.019 264.665)",
	sheet: "oklch(0.208 0.014 265)",
	ink: "oklch(0.985 0 0)",
	ink2: "oklch(0.705 0.015 286.067)",
	ink3: "oklch(0.6 0.015 286)",
	rule: "color-mix(in oklch, oklch(0.985 0 0) 12%, transparent)",
	rule2: "color-mix(in oklch, oklch(0.985 0 0) 20%, transparent)",
	accent: "oklch(0.685 0.169 237.323)",
	accentInk: "oklch(0.746 0.16 232.661)",
	accentWash: "color-mix(in srgb, oklch(0.685 0.169 237.323) 14%, oklch(0.168 0.019 264.665))",
	paid: "oklch(0.696 0.17 162.48)",
	paidWash: "color-mix(in oklch, oklch(0.596 0.145 163.225) 18%, oklch(0.168 0.019 264.665))",
	danger: "oklch(0.704 0.191 22.216)",
	shadow: "0 2px 4px rgba(0,0,0,.3), 0 24px 64px -24px rgba(0,0,0,.7)",
} as const;

/** Card geometry — one shape for all three scenes, so the set reads as a set. */
export const CARD = { width: 1180, radius: 30, pad: 44 } as const;

export const label: CSSProperties = {
	fontSize: 22,
	fontWeight: 600,
	letterSpacing: "0.14em",
	textTransform: "uppercase",
	color: T.ink3,
};
