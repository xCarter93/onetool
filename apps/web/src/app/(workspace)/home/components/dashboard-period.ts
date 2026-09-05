"use client";

import { useMemo, useState } from "react";
import {
	endOfDay,
	startOfISOWeek,
	startOfMonth,
	startOfYear,
	subDays,
	subMonths,
	subYears,
} from "date-fns";

export type DashboardPeriod = "week" | "month" | "year";

export const DASHBOARD_PERIODS: Array<{
	value: DashboardPeriod;
	label: string;
}> = [
	{ value: "week", label: "Week" },
	{ value: "month", label: "Month" },
	{ value: "year", label: "Year" },
];

export interface PeriodRange {
	startDate: number;
	endDate: number;
	/** Equal-length window immediately before `startDate`, for period-over-period deltas. */
	previous: { startDate: number; endDate: number };
	granularity: "day" | "month";
}

/**
 * Current-period-to-date: start of the ISO week / month / year through now.
 * The previous window is the same calendar period one step back, truncated to
 * the same elapsed length so the comparison is like-for-like.
 */
export function resolvePeriodRange(
	period: DashboardPeriod,
	now: number
): PeriodRange {
	const reference = new Date(now);
	const start =
		period === "week"
			? startOfISOWeek(reference)
			: period === "month"
				? startOfMonth(reference)
				: startOfYear(reference);
	const startDate = start.getTime();
	const endDate = endOfDay(reference).getTime();

	const shift = (date: Date) =>
		period === "week"
			? subDays(date, 7)
			: period === "month"
				? subMonths(date, 1)
				: subYears(date, 1);

	return {
		startDate,
		endDate,
		previous: {
			startDate: shift(start).getTime(),
			// Day-rounded like `endDate`: a millisecond-precision bound gives every
			// re-render a fresh args object, so the query never hits the cache.
			endDate: endOfDay(shift(reference)).getTime(),
		},
		granularity: period === "year" ? "month" : "day",
	};
}

export function periodLabel(period: DashboardPeriod): string {
	return period === "week"
		? "this week"
		: period === "month"
			? "this month"
			: "this year";
}

export function previousPeriodLabel(period: DashboardPeriod): string {
	return period === "week"
		? "vs. last week"
		: period === "month"
			? "vs. last month"
			: "vs. last year";
}

/**
 * Dense oldest→newest bucket keys ("YYYY-MM-DD" or "YYYY-MM") covering the
 * range, so sparse backend rows still chart as a full-width line.
 */
export function bucketDatesForRange(range: PeriodRange): string[] {
	const keys: string[] = [];
	const cursor = new Date(range.startDate);
	const end = new Date(range.endDate);
	if (range.granularity === "month") {
		cursor.setDate(1);
		while (cursor <= end) {
			keys.push(
				`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
			);
			cursor.setMonth(cursor.getMonth() + 1);
		}
		return keys;
	}
	while (cursor <= end) {
		keys.push(
			`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`
		);
		cursor.setDate(cursor.getDate() + 1);
	}
	return keys;
}

/**
 * Range for the currently selected period. "Now" is snapshotted per mount so a
 * re-render never produces new query arguments.
 */
export function usePeriodRange(period: DashboardPeriod): PeriodRange {
	const [now] = useState(() => Date.now());
	return useMemo(() => resolvePeriodRange(period, now), [period, now]);
}
