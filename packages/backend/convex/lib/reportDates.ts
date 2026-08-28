/**
 * Server-side resolution of report date-range presets into absolute ms bounds.
 *
 * Lands with R4a of PRD-reports-redesign: report runs happen on the server, so
 * the calendar math that the web `getDateRange`
 * (apps/web/src/app/(workspace)/reports/report-config.ts) does in the browser's
 * local zone has to be redone in the org's IANA timezone. Semantics mirror that
 * function exactly — only the zone the calendar day is measured in differs.
 */
import { type DateRangePreset } from "./reportConfig";

type CalendarDate = { year: number; month: number; day: number };

function resolveFormatter(timezone: string | undefined): Intl.DateTimeFormat {
	const options: Intl.DateTimeFormatOptions = {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	};

	if (timezone) {
		try {
			return new Intl.DateTimeFormat("en-US", {
				...options,
				timeZone: timezone,
			});
		} catch {
			// Invalid timezone: fall back to UTC, same convention as DateUtils.toLocalDateString.
		}
	}

	return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
}

function wallClockAt(
	timestamp: number,
	formatter: Intl.DateTimeFormat
): { date: CalendarDate; utcEquivalent: number } {
	const parts = formatter.formatToParts(new Date(timestamp));
	const read = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((part) => part.type === type)?.value);

	const date = { year: read("year"), month: read("month"), day: read("day") };
	return {
		date,
		utcEquivalent: Date.UTC(
			date.year,
			date.month - 1,
			date.day,
			read("hour"),
			read("minute"),
			read("second")
		),
	};
}

function offsetAt(timestamp: number, formatter: Intl.DateTimeFormat): number {
	const { utcEquivalent } = wallClockAt(timestamp, formatter);
	return utcEquivalent - Math.floor(timestamp / 1000) * 1000;
}

function toTimestamp(
	date: CalendarDate,
	hour: number,
	minute: number,
	second: number,
	millisecond: number,
	formatter: Intl.DateTimeFormat
): number {
	const guess = Date.UTC(
		date.year,
		date.month - 1,
		date.day,
		hour,
		minute,
		second,
		millisecond
	);
	// Two-pass: the offset measured at the guess can itself be the wrong side of a DST shift.
	const firstPass = guess - offsetAt(guess, formatter);
	const settled = offsetAt(firstPass, formatter);
	return guess - settled;
}

function startOfDay(
	date: CalendarDate,
	formatter: Intl.DateTimeFormat
): number {
	return toTimestamp(date, 0, 0, 0, 0, formatter);
}

function endOfDay(date: CalendarDate, formatter: Intl.DateTimeFormat): number {
	return toTimestamp(date, 23, 59, 59, 999, formatter);
}

function calendarDate(
	year: number,
	monthIndex: number,
	day: number
): CalendarDate {
	const normalized = new Date(Date.UTC(year, monthIndex, day));
	return {
		year: normalized.getUTCFullYear(),
		month: normalized.getUTCMonth() + 1,
		day: normalized.getUTCDate(),
	};
}

function addDays(date: CalendarDate, days: number): CalendarDate {
	return calendarDate(date.year, date.month - 1, date.day + days);
}

function dayOfWeek(date: CalendarDate): number {
	return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/** Absolute ms anchors of one YYYY-MM-DD day on the org calendar (UTC fallback). */
export function resolveDayAnchors(
	date: string,
	timezone: string | undefined
): { start: number; end: number; noon: number } {
	const [year, month, day] = date.split("-").map(Number);
	const calendar = { year, month, day };
	const formatter = resolveFormatter(timezone);
	return {
		start: toTimestamp(calendar, 0, 0, 0, 0, formatter),
		end: toTimestamp(calendar, 23, 59, 59, 999, formatter),
		noon: toTimestamp(calendar, 12, 0, 0, 0, formatter),
	};
}

/**
 * Absolute ms bounds for a preset, measured on the calendar of `timezone`
 * (undefined or invalid falls back to UTC). `all_time` has no bounds.
 */
export function resolveDateRangePreset(
	preset: DateRangePreset,
	timezone: string | undefined,
	now: number = Date.now()
): { start: number; end: number } | undefined {
	const formatter = resolveFormatter(timezone);
	const today = wallClockAt(now, formatter).date;
	const endOfToday = endOfDay(today, formatter);

	const rollingWindow = (days: number) => ({
		start: startOfDay(addDays(today, -(days - 1)), formatter),
		end: endOfToday,
	});

	const fullYear = (year: number) => ({
		start: startOfDay(calendarDate(year, 0, 1), formatter),
		end: endOfDay(calendarDate(year, 11, 31), formatter),
	});

	switch (preset) {
		case "today":
			return { start: startOfDay(today, formatter), end: endOfToday };
		case "this_week": {
			const startOfWeek = addDays(today, -dayOfWeek(today));
			return {
				start: startOfDay(startOfWeek, formatter),
				end: endOfDay(addDays(startOfWeek, 6), formatter),
			};
		}
		case "this_month":
			return {
				start: startOfDay(
					calendarDate(today.year, today.month - 1, 1),
					formatter
				),
				end: endOfDay(calendarDate(today.year, today.month, 0), formatter),
			};
		case "this_quarter": {
			const quarter = Math.floor((today.month - 1) / 3);
			return {
				start: startOfDay(calendarDate(today.year, quarter * 3, 1), formatter),
				end: endOfDay(calendarDate(today.year, (quarter + 1) * 3, 0), formatter),
			};
		}
		case "this_year":
			return fullYear(today.year);
		case "last_year":
			return fullYear(today.year - 1);
		case "last_7_days":
			return rollingWindow(7);
		case "last_30_days":
			return rollingWindow(30);
		case "last_90_days":
			return rollingWindow(90);
		case "all_time":
			return undefined;
		default:
			// A new DATE_RANGE_PRESETS member must be handled here, not fall through.
			return preset satisfies never;
	}
}
