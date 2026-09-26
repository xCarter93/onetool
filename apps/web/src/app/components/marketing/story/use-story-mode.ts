"use client";

import { useSyncExternalStore } from "react";

export type StoryMode = "pinned" | "stacked";

const PINNED_QUERY = "(min-width: 1024px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)";

function subscribe(callback: () => void) {
	const mq = window.matchMedia(PINNED_QUERY);
	mq.addEventListener("change", callback);
	return () => mq.removeEventListener("change", callback);
}

const getSnapshot = (): StoryMode =>
	window.matchMedia(PINNED_QUERY).matches ? "pinned" : "stacked";

// The stacked story stays readable before hydration and without JavaScript.
const getServerSnapshot = (): StoryMode => "stacked";

export function useStoryMode(): StoryMode {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
