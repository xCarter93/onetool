import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DayScope } from "@/lib/agenda";

const VALID: readonly DayScope[] = ["me", "team"];

// Single source of the storage key — only the non-sensitive scope string is
// ever written here (never org/financial data). Distinct from the retired
// `today.viewMode` key, so a stale agenda/timeline value can't be rehydrated.
export const DAY_SCOPE_STORAGE_KEY = "today.dayScope";

/** Persisted Me | Team scope for Today's day plan. Defaults to "me". */
export function useDayScope(): {
	scope: DayScope;
	setScope: (s: DayScope) => void;
	hydrated: boolean;
} {
	const [scope, setScopeState] = useState<DayScope>("me");
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		let active = true;
		AsyncStorage.getItem(DAY_SCOPE_STORAGE_KEY)
			.then((stored) => {
				if (!active) return;
				if (VALID.includes(stored as DayScope)) {
					setScopeState(stored as DayScope);
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

	const setScope = useCallback((next: DayScope) => {
		setScopeState(next);
		// Fire-and-forget persist; surface failures in dev only, never block UI.
		AsyncStorage.setItem(DAY_SCOPE_STORAGE_KEY, next).catch((e) => {
			if (__DEV__) console.warn("useDayScope persist failed", e);
		});
	}, []);

	return { scope, setScope, hydrated };
}
