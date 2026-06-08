import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ViewMode = "dashboard" | "calendar";

// Single source of the storage key — only the non-sensitive viewMode string is
// ever written here (never org/financial data).
export const VIEW_MODE_STORAGE_KEY = "home.viewMode";

export function useViewMode(): {
	viewMode: ViewMode;
	setViewMode: (m: ViewMode) => void;
	hydrated: boolean;
} {
	const [viewMode, setViewModeState] = useState<ViewMode>("dashboard");
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		let active = true;
		AsyncStorage.getItem(VIEW_MODE_STORAGE_KEY)
			.then((stored) => {
				if (!active) return;
				if (stored === "calendar" || stored === "dashboard") {
					setViewModeState(stored);
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
