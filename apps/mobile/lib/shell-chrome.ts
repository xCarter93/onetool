import { useEffect, useRef, useSyncExternalStore } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useIsFocused, useRoute } from "expo-router";

// Screens inside the phone frame publish record actions for the bottom
// accessory. Entries are keyed by route key because inactive tabs stay mounted;
// the accessory reads only the focused screen's entry.

export interface TrayAction {
	key: string;
	label: string;
	icon: LucideIcon;
	onPress: () => void;
	/** Shown but inert; tapping explains why (e.g. offline). */
	disabledReason?: string;
}

export interface ScreenChrome {
	/** First action is the filled primary. */
	tray?: TrayAction[];
}

const entries = new Map<string, ScreenChrome>();
const listeners = new Set<() => void>();
let version = 0;
let focusedKey: string | undefined;

function emit() {
	version++;
	for (const l of listeners) l();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

// Only what the accessory renders counts as a change; fresh onPress closures
// every render must not re-render it.
function visibleShape(chrome: ScreenChrome | undefined): string {
	if (!chrome) return "";
	return JSON.stringify(chrome.tray?.map((a) => [a.key, a.label, a.disabledReason ?? ""]));
}

export function useScreenChrome(chrome: ScreenChrome | null) {
	const { key } = useRoute();
	const focused = useIsFocused();
	useEffect(() => {
		if (!focused) return;
		focusedKey = key;
		emit();
		return () => {
			if (focusedKey !== key) return;
			focusedKey = undefined;
			emit();
		};
	}, [focused, key]);
	useEffect(() => {
		const prev = entries.get(key);
		if (!chrome) {
			if (prev) {
				entries.delete(key);
				emit();
			}
			return;
		}
		const changed = visibleShape(prev) !== visibleShape(chrome);
		entries.set(key, chrome);
		if (changed) emit();
	});

	useEffect(
		() => () => {
			if (entries.delete(key)) emit();
		},
		[key],
	);
}

export function useFocusedChrome(): { key: string; chrome: ScreenChrome } | undefined {
	useSyncExternalStore(subscribe, () => version);
	const chrome = focusedKey ? entries.get(focusedKey) : undefined;
	return focusedKey && chrome ? { key: focusedKey, chrome } : undefined;
}

/** Runs the action's latest closure; the accessory's render may hold a stale one. */
export function runTrayAction(routeKey: string, actionKey: string) {
	entries.get(routeKey)?.tray?.find((a) => a.key === actionKey)?.onPress();
}

type TabBarMinimize = "onScrollDown" | "never";
let tabBarMinimize: TabBarMinimize = "onScrollDown";

export function useTabBarMinimize(): TabBarMinimize {
	return useSyncExternalStore(subscribe, () => tabBarMinimize);
}

// iOS reopens a minimized bar only after a long upward scroll, which a short page can't give;
// flipping the behavior to "never" and back forces it open.
export function reopenTabBar() {
	if (tabBarMinimize === "never") return;
	tabBarMinimize = "never";
	emit();
	setTimeout(() => {
		tabBarMinimize = "onScrollDown";
		emit();
	}, 300);
}

/** onScroll for a screen's main scroll view (pair with scrollEventThrottle): reopens the bar on reaching the top. */
export function useReopenTabBarAtTop() {
	const atTop = useRef(true);
	return (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		const top = e.nativeEvent.contentOffset.y <= 0;
		if (top && !atTop.current) reopenTabBar();
		atTop.current = top;
	};
}
