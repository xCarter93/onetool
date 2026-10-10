"use client";

import { useSyncExternalStore } from "react";

const subscribeTheme = (notify: () => void) => {
	const observer = new MutationObserver(notify);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
	return () => observer.disconnect();
};

const read = (names: string[]) => {
	const landing = document.querySelector(".dc-landing");
	if (!landing) return "";
	const style = getComputedStyle(landing);
	return names.map((name) => style.getPropertyValue(name).trim()).join("|");
};

/** Landing color tokens as plain values for canvases, which can't read CSS variables; re-read on a theme switch, empty before mount. */
export function useLandingTokens(...names: string[]): string[] {
	const key = useSyncExternalStore(subscribeTheme, () => read(names), () => "");
	return key ? key.split("|") : [];
}
