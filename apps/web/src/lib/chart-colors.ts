/**
 * Shared chart color palette for consistent data visualization
 *
 * This palette uses refined blue tones that align with the app's design system,
 * avoiding excessive gradients and maintaining visual restraint.
 */

/**
 * Primary chart colors - variations of blue tones for data visualization
 * These colors are purposefully chosen to provide good contrast while maintaining
 * a cohesive, professional appearance
 */
export const CHART_COLORS = {
	/**
	 * Default palette for most charts (pie, bar, line)
	 * Ordered from primary to lighter shades for visual hierarchy
	 */
	primary: [
		"rgb(0, 166, 244)",    // Primary glass blue - main brand color
		"rgb(14, 165, 233)",   // Sky-500 - slightly darker for contrast
		"rgb(56, 189, 248)",   // Sky-400 - lighter accent
		"rgb(2, 132, 199)",    // Sky-600 - medium depth
		"rgb(125, 211, 252)",  // Sky-300 - pale accent
		"rgb(3, 105, 161)",    // Sky-700 - darker for emphasis
		"rgb(186, 230, 253)",  // Sky-200 - very light accent
		"rgb(7, 89, 133)",     // Sky-800 - deep blue for final items
	],

	/**
	 * Success/positive trend colors
	 */
	success: [
		"rgb(34, 197, 94)",    // Green-500
		"rgb(22, 163, 74)",    // Green-600
		"rgb(74, 222, 128)",   // Green-400
		"rgb(16, 185, 129)",   // Emerald-500
	],

	/**
	 * Warning/caution colors
	 */
	warning: [
		"rgb(251, 191, 36)",   // Amber-400
		"rgb(245, 158, 11)",   // Amber-500
		"rgb(253, 224, 71)",   // Yellow-300
		"rgb(234, 179, 8)",    // Yellow-500
	],

	/**
	 * Error/negative trend colors
	 */
	error: [
		"rgb(239, 68, 68)",    // Red-500
		"rgb(220, 38, 38)",    // Red-600
		"rgb(248, 113, 113)",  // Red-400
		"rgb(185, 28, 28)",    // Red-700
	],

	/**
	 * Neutral/muted colors for secondary data
	 */
	neutral: [
		"rgb(100, 116, 139)",  // Slate-500
		"rgb(148, 163, 184)",  // Slate-400
		"rgb(71, 85, 105)",    // Slate-600
		"rgb(203, 213, 225)",  // Slate-300
	],
} as const;

/**
 * Fixed-order categorical palette, validated for lightness band, chroma, CVD
 * separation, and surface contrast in BOTH light and dark modes (dataviz
 * validator, 2026-07-09). Assign hues by index in fixed order, never re-sort
 * by rank/value — >7 series wrap using the same order (see getChartColor).
 */
export const CHART_CATEGORICAL: string[] = [
	"#0284c7",
	"#059669",
	"#7c3aed",
	"#d97706",
	"#e11d48",
	"#0891b2",
	"#4f46e5",
];

/**
 * Get a color from the primary palette by index
 * Wraps around if index exceeds palette length
 */
export function getChartColor(index: number, palette: readonly string[] = CHART_COLORS.primary): string {
	return palette[index % palette.length];
}

/**
 * Get a specific color palette by name
 */
export function getChartPalette(
	type: 'primary' | 'success' | 'warning' | 'error' | 'neutral' = 'primary'
): readonly string[] {
	return CHART_COLORS[type];
}

/**
 * Generate a color array for a specific number of data points
 * Uses the primary palette by default
 */
export function generateChartColors(
	count: number,
	palette: readonly string[] = CHART_COLORS.primary
): string[] {
	return Array.from({ length: count }, (_, i) => getChartColor(i, palette));
}
