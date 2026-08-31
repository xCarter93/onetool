"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { localTodayUtcMidnight } from "@onetool/backend/convex/lib/schedule";
import { localDateToUtcMidnightMs } from "@/lib/dates";

/**
 * UTC-midnight epoch of the org's current calendar day — the clock every
 * lateness check compares against, matching what the overdue sweep persists.
 * Falls back to the browser's calendar day until the org query resolves.
 */
export function useOrgToday(): number {
	const organization = useQuery(api.organizations.get);
	// Captured once: hooks must be pure, and a day-granularity value has nothing
	// to gain from re-reading the clock on every render.
	const [now] = useState(() => Date.now());
	const timezone = organization?.timezone;
	return timezone
		? localTodayUtcMidnight(now, timezone)
		: localDateToUtcMidnightMs(new Date(now));
}
