"use client";

import { useSyncExternalStore } from "react";

export type StoryMode = "pinned" | "stacked";

// Keep this query aligned with the story media query in landing.css.
const PINNED_QUERY = "(min-width: 1024px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)";

function subscribe(callback: () => void) {
	const mq = window.matchMedia(PINNED_QUERY);
	mq.addEventListener("change", callback);
	return () => mq.removeEventListener("change", callback);
}

const getSnapshot = (): StoryMode =>
	window.matchMedia(PINNED_QUERY).matches ? "pinned" : "stacked";

// CSS chooses the server-rendered layout before hydration.
const getServerSnapshot = (): StoryMode => "stacked";

export function useStoryMode(): StoryMode {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
