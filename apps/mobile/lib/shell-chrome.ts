import { useEffect, useSyncExternalStore } from "react";
import type { TextInput } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useRoute } from "expo-router";

// Screens inside the phone frame publish what the persistent rail shows for
// them: record actions for the tray, or the search binding for the composer.
// Entries are keyed by route key because inactive tabs stay mounted; the frame
// reads only the focused leaf's entry.

export interface TrayAction {
	key: string;
	label: string;
	icon: LucideIcon;
	onPress: () => void;
	/** Shown but inert; tapping explains why (e.g. offline). */
	disabledReason?: string;
}

export interface ComposerSearch {
	value: string;
	onChangeText: (text: string) => void;
	placeholder?: string;
}

export interface ScreenChrome {
	/** First action is the filled primary. */
	tray?: TrayAction[];
	search?: ComposerSearch;
}

const entries = new Map<string, ScreenChrome>();
const listeners = new Set<() => void>();
let version = 0;

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

// Only what the rail renders counts as a change; fresh onPress closures every
// render must not re-render the frame.
function visibleShape(chrome: ScreenChrome | undefined): string {
	if (!chrome) return "";
	return JSON.stringify({
		tray: chrome.tray?.map((a) => [a.key, a.label, a.disabledReason ?? ""]),
		search: chrome.search ? [chrome.search.value, chrome.search.placeholder ?? ""] : null,
	});
}

export function useScreenChrome(chrome: ScreenChrome | null) {
	const { key } = useRoute();
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

export function useChromeFor(routeKey: string | undefined): ScreenChrome | undefined {
	useSyncExternalStore(subscribe, () => version);
	return routeKey ? entries.get(routeKey) : undefined;
}

/** Runs the action's latest closure; the frame's render may hold a stale one. */
export function runTrayAction(routeKey: string, actionKey: string) {
	entries.get(routeKey)?.tray?.find((a) => a.key === actionKey)?.onPress();
}

/** Latest search binding, for the same reason. */
export function composerSearchFor(routeKey: string): ComposerSearch | undefined {
	return entries.get(routeKey)?.search;
}

let composerInput: TextInput | null = null;
// Work asks for focus before its binding reaches the frame, so the field may not exist yet.
let focusPending = false;

export function registerComposerInput(input: TextInput | null) {
	composerInput = input;
	if (input && focusPending) {
		focusPending = false;
		input.focus();
	}
}

/** Focus the composer's search field (used when Work opens with a pending search focus). */
export function focusComposer() {
	if (composerInput) composerInput.focus();
	else focusPending = true;
}
