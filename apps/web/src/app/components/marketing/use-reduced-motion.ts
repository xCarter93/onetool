"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
	const mq = window.matchMedia(QUERY);
	mq.addEventListener("change", callback);
	return () => mq.removeEventListener("change", callback);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;

// Server (and first paint) assume reduced: the static fallback is always the
// safe render, and capable clients upgrade immediately after hydration.
const getServerSnapshot = () => true;

/** Live `prefers-reduced-motion`, reacting to mid-session OS changes. */
export function usePrefersReducedMotion(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
