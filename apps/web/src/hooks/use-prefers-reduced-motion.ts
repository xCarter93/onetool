"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
	const mediaQuery = window.matchMedia(QUERY);
	mediaQuery.addEventListener("change", onChange);
	return () => mediaQuery.removeEventListener("change", onChange);
}

/**
 * Reads the OS reduced-motion setting, staying live if it changes.
 *
 * Uses useSyncExternalStore rather than an effect so the value is available on
 * the first client render and never triggers a cascading setState-in-effect.
 * On the server it reports `true` — the safe default is no motion until we
 * actually know the user's preference.
 */
export function usePrefersReducedMotion(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => window.matchMedia(QUERY).matches,
		() => true
	);
}
