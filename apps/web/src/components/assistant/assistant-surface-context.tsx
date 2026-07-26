"use client";

import * as React from "react";
import { AssistantOpenerContext } from "./assistant-opener-context";

// Breakpoints the assistant surface routes on: below md it rides a bottom
// Sheet; the docked (pinned, in-flow) column needs xl — the expanded sidebar
// (19rem) plus the panel (26rem) leave too little content width at lg.
const MD_BREAKPOINT = 768;
const XL_BREAKPOINT = 1280;

function subscribeBelowMd(callback: () => void) {
	const mql = window.matchMedia(`(max-width: ${MD_BREAKPOINT - 1}px)`);
	mql.addEventListener("change", callback);
	return () => mql.removeEventListener("change", callback);
}

function subscribeBelowXl(callback: () => void) {
	const mql = window.matchMedia(`(max-width: ${XL_BREAKPOINT - 1}px)`);
	mql.addEventListener("change", callback);
	return () => mql.removeEventListener("change", callback);
}

// `undefined` until the first client measurement: the docked column (whose
// mount depends on the localStorage pin) must not render during hydration.
function useBelowMd(): boolean | undefined {
	return React.useSyncExternalStore(
		subscribeBelowMd,
		() => window.innerWidth < MD_BREAKPOINT,
		() => undefined
	);
}

function useBelowXl(): boolean | undefined {
	return React.useSyncExternalStore(
		subscribeBelowXl,
		() => window.innerWidth < XL_BREAKPOINT,
		() => undefined
	);
}

export type AssistantSurface = "sheet" | "floating" | "docked";

const ASSISTANT_PINNED_KEY = "assistant-panel-pinned";

type AssistantSurfaceContextValue = {
	/** Which surface the current viewport + pin preference selects. */
	surface: AssistantSurface;
	/** Open state of whichever surface is active. */
	open: boolean;
	setOpen: (open: boolean) => void;
	pinned: boolean;
	togglePinned: () => void;
	/** xl+: the viewport can host the docked column (pinned or not). */
	canDock: boolean;
};

const AssistantSurfaceContext =
	React.createContext<AssistantSurfaceContextValue | null>(null);

export function useAssistantSurface(): AssistantSurfaceContextValue {
	const ctx = React.useContext(AssistantSurfaceContext);
	if (!ctx) {
		throw new Error(
			"useAssistantSurface must be used within AssistantSurfaceProvider"
		);
	}
	return ctx;
}

/**
 * Owns the assistant's open/pin state and routes it to a surface:
 * `sheet` below md, `docked` (in-flow column) when pinned at xl+, `floating`
 * overlay otherwise. Each width class keeps its own open state so crossing a
 * breakpoint never teleports an open panel to the other surface. Also provides
 * AssistantOpenerContext so `useAssistantOpener()` keeps working unchanged.
 */
export function AssistantSurfaceProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const belowMd = useBelowMd();
	const belowXl = useBelowXl();
	const [sheetOpen, setSheetOpen] = React.useState(false);
	const [desktopOpen, setDesktopOpen] = React.useState(false);
	// Lazy localStorage read is hydration-safe: the pin only affects the render
	// once the viewport measurement resolves (post-hydration).
	const [pinned, setPinned] = React.useState(
		() =>
			typeof window !== "undefined" &&
			localStorage.getItem(ASSISTANT_PINNED_KEY) === "true"
	);
	const togglePinned = React.useCallback(() => {
		setPinned((prev) => {
			const next = !prev;
			localStorage.setItem(ASSISTANT_PINNED_KEY, String(next));
			return next;
		});
	}, []);

	const canDock = belowMd === false && belowXl === false;
	const surface: AssistantSurface = belowMd
		? "sheet"
		: canDock && pinned
			? "docked"
			: "floating";
	const open = belowMd ? sheetOpen : desktopOpen;
	const setOpen = React.useCallback(
		(next: boolean) => (belowMd ? setSheetOpen(next) : setDesktopOpen(next)),
		[belowMd]
	);
	const openAssistant = React.useCallback(() => setOpen(true), [setOpen]);

	const value = React.useMemo(
		() => ({ surface, open, setOpen, pinned, togglePinned, canDock }),
		[surface, open, setOpen, pinned, togglePinned, canDock]
	);

	return (
		<AssistantSurfaceContext.Provider value={value}>
			<AssistantOpenerContext.Provider value={openAssistant}>
				{children}
			</AssistantOpenerContext.Provider>
		</AssistantSurfaceContext.Provider>
	);
}
