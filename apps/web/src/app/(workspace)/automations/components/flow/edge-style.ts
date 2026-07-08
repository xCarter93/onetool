import type { CSSProperties } from "react";

/**
 * Shared connector styling for the automations flow. Single source of truth so
 * every edge type stays consistent. Colors resolve from design tokens (or
 * Tailwind color vars) so they read with good contrast in light and dark.
 */

/** Default sequential connector — mid-tone gray, legible on both canvases. */
export const EDGE_STYLE: CSSProperties = {
	stroke: "color-mix(in oklch, var(--muted-foreground) 60%, transparent)",
	strokeWidth: 1.5,
};

/** Loop iteration lanes (each / loop-back / after-last) — dashed orange, dark-safe. */
export const LOOP_EDGE_STYLE: CSSProperties = {
	stroke: "var(--color-orange-400)",
	strokeWidth: 1.5,
	strokeDasharray: "6 3",
};
