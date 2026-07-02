"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	type ReactNode,
	type RefObject,
} from "react";

/**
 * Screen-context plumbing for the assistant ("agent sees what the user sees").
 *
 * Pages publish view state via `usePublishScreenContext`; the assistant sheet
 * calls the getter from `useScreenContext` at send time and ships the snapshot
 * with the message. Rule: IDs and view parameters only — never counts or data
 * values. The model must fetch real data through tools.
 */

type ExtrasGetter = () => Record<string, unknown> | undefined;

interface ScreenContextValue {
	register: (getter: RefObject<ExtrasGetter>) => () => void;
	getters: RefObject<Set<RefObject<ExtrasGetter>>>;
}

const ScreenContextContext = createContext<ScreenContextValue | null>(null);

export function ScreenContextProvider({ children }: { children: ReactNode }) {
	const getters = useRef<Set<RefObject<ExtrasGetter>>>(new Set());
	const register = useCallback((getter: RefObject<ExtrasGetter>) => {
		getters.current.add(getter);
		return () => {
			getters.current.delete(getter);
		};
	}, []);
	const value = useMemo(() => ({ register, getters }), [register]);
	return (
		<ScreenContextContext.Provider value={value}>
			{children}
		</ScreenContextContext.Provider>
	);
}

/**
 * Publish extra view state (e.g. active view mode, visible date range) for
 * the lifetime of the calling component. Pass a plain closure — it is read
 * lazily at snapshot time, so it always sees current state.
 */
export function usePublishScreenContext(getExtras: ExtrasGetter) {
	const ctx = useContext(ScreenContextContext);
	const getterRef = useRef(getExtras);
	useEffect(() => {
		getterRef.current = getExtras;
	});
	useEffect(() => {
		if (!ctx) return;
		return ctx.register(getterRef);
	}, [ctx]);
}

// Keep in sync with SCREEN_CONTEXT_MAX_LENGTH in convex/assistantChat.ts —
// the server drops (not truncates) anything longer.
const SCREEN_CONTEXT_MAX_LENGTH = 4000;

/** Returns a stable getter that serializes the current screen snapshot. */
export function useScreenContext(): () => string | undefined {
	const ctx = useContext(ScreenContextContext);
	return useCallback(() => {
		if (typeof window === "undefined") return undefined;
		// window.location (not useSearchParams) so the value is read at send
		// time without subscribing the sheet to every route change.
		const snapshot: Record<string, unknown> = {
			path: window.location.pathname,
		};
		const search = window.location.search;
		if (search) {
			snapshot.query = Object.fromEntries(new URLSearchParams(search));
		}
		for (const getter of ctx?.getters.current ?? []) {
			try {
				Object.assign(snapshot, getter.current?.());
			} catch {
				// A broken publisher must never block sending a message.
			}
		}
		const json = JSON.stringify(snapshot);
		return json.length <= SCREEN_CONTEXT_MAX_LENGTH
			? json
			: JSON.stringify({ path: snapshot.path });
	}, [ctx]);
}
