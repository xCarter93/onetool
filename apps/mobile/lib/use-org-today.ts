import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { localTodayUtcMidnight } from "@onetool/backend/convex/lib/schedule";

/**
 * UTC-midnight epoch of the org's current calendar day — the clock every
 * lateness check compares against, matching what the overdue sweep persists.
 * Falls back to the device's calendar day until the org query resolves.
 */
export function useOrgToday(): number {
	const org = useQuery(api.organizations.get);
	// Seeded once: react-hooks/purity forbids Date.now() during render, and a
	// day-granularity value gains nothing from re-reading the clock.
	const [now] = useState(() => Date.now());
	const timezone = org?.timezone;
	if (timezone) return localTodayUtcMidnight(now, timezone);
	const device = new Date(now);
	return Date.UTC(device.getFullYear(), device.getMonth(), device.getDate());
}
