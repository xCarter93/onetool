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

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(now: number): number {
	return Math.floor(now / DAY_MS) * DAY_MS;
}

/**
 * UTC midnight of the current UTC date — the value the server defaults `today`
 * to (`DateUtils.startOfDay` runs in Convex's UTC runtime). Passed as a query
 * arg so every tab shares one cache key while mobile keeps the server default.
 */
export function useUtcToday(): number {
	const [today, setToday] = useState(() => utcDay(Date.now()));
	useEffect(() => {
		const id = setInterval(() => {
			setToday((prev) => {
				const next = utcDay(Date.now());
				return next === prev ? prev : next;
			});
		}, ROLLOVER_POLL_MS);
		return () => clearInterval(id);
	}, []);
	return today;
}
