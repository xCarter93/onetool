import { useEffect, useRef, type RefObject } from "react";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

// Module-level, not per-list: only one screen is visible at a time, so one active
// swipe row app-wide is always the right answer and needs no context/provider.
let active: SwipeableMethods | null = null;

/** Closes whichever row is currently open before this one takes its place. */
export function registerSwipeOpen(methods: SwipeableMethods): void {
	if (active && active !== methods) active.close();
	active = methods;
}

export function clearSwipeActive(methods: SwipeableMethods): void {
	if (active === methods) active = null;
}

/** Open/close handlers for one row; unmounting while open also releases the slot. */
export function useExclusiveSwipe(ref: RefObject<SwipeableMethods | null>) {
	// Captured on open: the Swipeable ref is already null when unmount cleanup runs.
	const opened = useRef<SwipeableMethods | null>(null);
	useEffect(
		() => () => {
			if (opened.current) clearSwipeActive(opened.current);
		},
		[],
	);
	return {
		onOpen: () => {
			const methods = ref.current;
			if (!methods) return;
			opened.current = methods;
			registerSwipeOpen(methods);
		},
		onClose: () => {
			if (opened.current) clearSwipeActive(opened.current);
			opened.current = null;
		},
	};
}
