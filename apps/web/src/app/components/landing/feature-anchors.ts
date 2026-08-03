import type { FeatureKey } from "./feature-animation";

/**
 * Anchor id for a feature chapter. Shared by the chapters (which render the
 * ids) and the navbar's Features flyout (which deep-links to them) — kept in
 * its own module so the client navbar doesn't pull the chapter tree into its
 * bundle.
 */
export const chapterAnchor = (key: FeatureKey) => `feature-${key}`;
