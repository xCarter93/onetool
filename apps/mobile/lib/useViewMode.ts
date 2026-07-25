import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Today's two representations of the selected day. The week strip picks the
 * DATE; this picks the REPRESENTATION — the two controls are orthogonal, which
 * is why they coexist.
 */
export type ViewMode = "agenda" | "timeline";

const VALID: readonly ViewMode[] = ["agenda", "timeline"];

// Single source of the storage key — only the non-sensitive viewMode string is
// ever written here (never org/financial data). Distinct from the retired
// `home.viewMode` key, so a stale dashboard/calendar value can't be rehydrated.
export const VIEW_MODE_STORAGE_KEY = "today.viewMode";

export function useViewMode(): {
	viewMode: ViewMode;
	setViewMode: (m: ViewMode) => void;
	hydrated: boolean;
} {
	const [viewMode, setViewModeState] = useState<ViewMode>("agenda");
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		let active = true;
		AsyncStorage.getItem(VIEW_MODE_STORAGE_KEY)
			.then((stored) => {
				if (!active) return;
				if (VALID.includes(stored as ViewMode)) {
					setViewModeState(stored as ViewMode);
				}
				setHydrated(true);
			})
			.catch(() => {
				if (active) setHydrated(true);
			});
		return () => {
			active = false;
		};
	}, []);

	const setViewMode = useCallback((next: ViewMode) => {
		setViewModeState(next);
		// Fire-and-forget persist; surface failures in dev only, never block UI.
		AsyncStorage.setItem(VIEW_MODE_STORAGE_KEY, next).catch((e) => {
			if (__DEV__) console.warn("useViewMode persist failed", e);
		});
	}, []);

	return { viewMode, setViewMode, hydrated };
}
