"use client";

import { useSyncExternalStore } from "react";

const KEY = "onetool:landing-motion-paused";
const listeners = new Set<() => void>();
let paused: boolean | undefined;

/** The visitor's "Pause animations" choice for the landing page's looping motion (WCAG 2.2.2). */
export function isMotionPaused(): boolean {
	if (paused === undefined) {
		try {
			paused = sessionStorage.getItem(KEY) === "1";
		} catch {
			paused = false;
		}
	}
	return paused;
}

export function setMotionPaused(next: boolean) {
	paused = next;
	try {
		if (next) sessionStorage.setItem(KEY, "1");
		else sessionStorage.removeItem(KEY);
	} catch {}
	listeners.forEach((notify) => notify());
}

export function subscribeMotionPaused(notify: () => void) {
	listeners.add(notify);
	return () => {
		listeners.delete(notify);
	};
}

export function useMotionPaused(): boolean {
	return useSyncExternalStore(subscribeMotionPaused, isMotionPaused, () => false);
}
