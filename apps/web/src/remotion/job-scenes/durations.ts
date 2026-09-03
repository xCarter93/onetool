export const FPS = 30;

/** Scene lengths in frames, derived from fps so an fps change carries through. */
export const DUR = {
	clientRecord: 7 * FPS,
	weekPlan: 8 * FPS,
	threadAssistant: 10 * FPS,
} as const;

/**
 * Card-only cuts, matching the comp's card slots. Width is the display
 * geometry doubled (slot ≈ 350-400px) so type keeps the page's own ratio;
 * heights carry slack so nothing sits flush against the bottom edge.
 */
export const CARD_ONLY = {
	width: 700,
	clientRecord: 820,
	weekPlan: 850,
	threadAssistant: 1020,
} as const;
