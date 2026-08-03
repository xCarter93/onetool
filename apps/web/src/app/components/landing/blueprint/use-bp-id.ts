"use client";

import { useId } from "react";

/**
 * A document-unique, CSS-safe SVG fragment id.
 *
 * Tier 2 of the id-collision fix (tier 1 is the global <BlueprintDefs/> sprite).
 * Use it for per-instance defs that cannot be hoisted because they depend on the
 * instance's own geometry: clipPath, mask, <title>/<desc> ids.
 *
 * React 19 emits ids containing guillemets (React 18 used colons). Both are
 * legal inside `url(#…)` but break `document.querySelector('#' + id)` and CSS
 * `url()` in stylesheets, so sanitize once here rather than at every call site.
 *
 * useId is SSR-stable, so no hydration mismatch under RSC streaming. Never use
 * Math.random() or a module-level counter — both desync server and client.
 */
export function useBpId(name: string): string {
	const raw = useId();
	return `${name}-${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
