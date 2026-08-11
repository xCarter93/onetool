import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Day = the anchored day's timeline. List = a rolling 14-day agenda. */
export type ScheduleView = "day" | "list";

const VALID: readonly ScheduleView[] = ["day", "list"];

// New key, not the retired `today.viewMode` — that one held the old
// agenda/timeline split, and a stale value there must never rehydrate here.
export const SCHEDULE_VIEW_STORAGE_KEY = "today.scheduleView";

/** Persisted Day | List switch for Today's schedule. Defaults to "day". */
export function useScheduleView(): {
	view: ScheduleView;
	setView: (v: ScheduleView) => void;
	hydrated: boolean;
} {
	const [view, setViewState] = useState<ScheduleView>("day");
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		let active = true;
		AsyncStorage.getItem(SCHEDULE_VIEW_STORAGE_KEY)
			.then((stored) => {
				if (!active) return;
				if (VALID.includes(stored as ScheduleView)) {
					setViewState(stored as ScheduleView);
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

	const setView = useCallback((next: ScheduleView) => {
		setViewState(next);
		AsyncStorage.setItem(SCHEDULE_VIEW_STORAGE_KEY, next).catch((e) => {
			if (__DEV__) console.warn("useScheduleView persist failed", e);
		});
	}, []);

	return { view, setView, hydrated };
}
