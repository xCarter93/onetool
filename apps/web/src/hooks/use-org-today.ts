"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { localTodayUtcMidnight } from "@onetool/backend/convex/lib/schedule";
import { localDateToUtcMidnightMs } from "@/lib/dates";

const ROLLOVER_POLL_MS = 60_000;

function orgDay(now: number, timezone: string | undefined): number {
	return timezone
		? localTodayUtcMidnight(now, timezone)
		: localDateToUtcMidnightMs(new Date(now));
}

/**
 * UTC-midnight epoch of the org's current calendar day — the clock every
 * lateness check compares against, matching what the overdue sweep persists.
 * Falls back to the browser's calendar day until the org query resolves.
 */
export function useOrgToday(): number {
	const organization = useQuery(api.organizations.get);
	const timezone = organization?.timezone;
	const [now, setNow] = useState(() => Date.now());

	// A tab left open past org-local midnight would report yesterday until it
	// remounted. Polling (rather than a timer to the boundary) survives DST and
	// a timezone change; returning `prev` unchanged skips the re-render.
	useEffect(() => {
		const id = setInterval(() => {
			setNow((prev) =>
				orgDay(prev, timezone) === orgDay(Date.now(), timezone)
					? prev
					: Date.now()
			);
		}, ROLLOVER_POLL_MS);
		return () => clearInterval(id);
	}, [timezone]);

	return orgDay(now, timezone);
}
