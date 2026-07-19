import type * as React from "react";

/**
 * sm 80x48 · md 200x120 · hero 320x192 — all 5:3, each hand-authored.
 * A missing variant falls back to md rather than scaling, so line weight
 * never drifts.
 */
export type IllustrationSize = "sm" | "md" | "hero";

/** Art returns SVG children only; the frame owns viewBox, sizing and a11y. */
export type IllustrationArt = React.FC;

export type IllustrationVariants = {
	md: IllustrationArt;
	sm?: IllustrationArt;
	hero?: IllustrationArt;
};

export const ILLUSTRATION_VIEWBOX: Record<IllustrationSize, string> = {
	sm: "0 0 80 48",
	md: "0 0 200 120",
	hero: "0 0 320 192",
};

export const ILLUSTRATION_WIDTH: Record<IllustrationSize, string> = {
	sm: "w-14",
	md: "w-[200px]",
	hero: "w-[320px]",
};
