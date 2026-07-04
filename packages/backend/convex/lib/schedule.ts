import type { AutomationSchedule } from "./workflowTypes";

/**
 * Pure schedule math for scheduled workflow automations.
 *
 * Timezone handling uses Intl.DateTimeFormat only (no libraries, no
 * ./_generated imports) so this stays usable from any context, including the
 * web app via @onetool/backend.
 *
 * DST semantics (see schedule.test.ts DST matrix):
 * - A local time skipped by spring-forward (e.g. 02:30 America/New_York on the
 *   March boundary) fires after the gap at the shifted wall time (03:30 EDT).
 * - A local time repeated by fall-back fires exactly once, at whichever
 *   occurrence the offset iteration converges to (the first for zones west of
 *   UTC); both candidates show the requested wall time.
 */

const MAX_SEARCH_DAYS = 62;

type WallDate = { year: number; month: number; day: number };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
	let fmt = formatterCache.get(timezone);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		formatterCache.set(timezone, fmt);
	}
	return fmt;
}

function getWallParts(ms: number, timezone: string) {
	const parts = getFormatter(timezone).formatToParts(ms);
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((p) => p.type === type)?.value ?? NaN);
	return {
		year: get("year"),
		month: get("month"),
		day: get("day"),
		hour: get("hour"),
		minute: get("minute"),
		second: get("second"),
	};
}

/** UTC offset of `timezone` at instant `ms`, in milliseconds (negative = west). */
function offsetAt(ms: number, timezone: string): number {
	const p = getWallParts(ms, timezone);
	const wallAsUtc = Date.UTC(
		p.year,
		p.month - 1,
		p.day,
		p.hour,
		p.minute,
		p.second
	);
	return wallAsUtc - ms;
}

/**
 * Convert a wall-clock time in `timezone` to a UTC instant.
 *
 * Skipped times (DST gap) resolve to the instant after the gap; repeated
 * times (DST overlap) resolve deterministically to one occurrence.
 */
function wallTimeToUtc(
	wall: WallDate,
	hour: number,
	minute: number,
	timezone: string
): number {
	const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, hour, minute);
	const first = asUtc - offsetAt(asUtc, timezone);
	const second = asUtc - offsetAt(first, timezone);
	const p = getWallParts(second, timezone);
	const matches =
		p.year === wall.year &&
		p.month === wall.month &&
		p.day === wall.day &&
		p.hour === hour &&
		p.minute === minute;
	if (matches) return second;
	// The wall time does not exist (spring-forward gap): the two offset guesses
	// disagree; the larger instant is the one past the transition.
	return Math.max(first, second);
}

function addDays(wall: WallDate, days: number): WallDate {
	const d = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days));
	return {
		year: d.getUTCFullYear(),
		month: d.getUTCMonth() + 1,
		day: d.getUTCDate(),
	};
}

/** Calendar weekday of a wall date: 0 (Sunday) – 6 (Saturday). */
function weekdayOf(wall: WallDate): number {
	return new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export const DEFAULT_SCHEDULE_TIME = "09:00";

function parseTime(time: string): { hour: number; minute: number } {
	const match = TIME_PATTERN.exec(time);
	if (!match) throw new Error(`Invalid schedule time "${time}"`);
	return { hour: Number(match[1]), minute: Number(match[2]) };
}

function isValidTimezone(timezone: string): boolean {
	try {
		getFormatter(timezone);
		return true;
	} catch {
		return false;
	}
}

/**
 * Validate a schedule for saving. Returns an error message, or null if valid.
 */
export function validateSchedule(schedule: AutomationSchedule): string | null {
	if (!isValidTimezone(schedule.timezone)) {
		return `Invalid timezone "${schedule.timezone}"`;
	}
	if (schedule.time !== undefined && !TIME_PATTERN.test(schedule.time)) {
		return `Invalid time "${schedule.time}" — expected HH:MM (24-hour)`;
	}
	if (schedule.frequency === "weekly") {
		const d = schedule.dayOfWeek;
		if (d === undefined || !Number.isInteger(d) || d < 0 || d > 6) {
			return "Weekly schedules require a day of week (0–6)";
		}
	}
	if (schedule.frequency === "monthly") {
		const d = schedule.dayOfMonth;
		if (d === undefined || !Number.isInteger(d) || d < 1 || d > 31) {
			return "Monthly schedules require a day of month (1–31)";
		}
	}
	return null;
}

function matchesFrequency(wall: WallDate, schedule: AutomationSchedule): boolean {
	switch (schedule.frequency) {
		case "daily":
			return true;
		case "weekly":
			return weekdayOf(wall) === schedule.dayOfWeek;
		case "monthly": {
			const target = Math.min(
				schedule.dayOfMonth ?? 1,
				daysInMonth(wall.year, wall.month)
			);
			return wall.day === target;
		}
	}
}

/**
 * Next run instant strictly after `fromMs`.
 *
 * Throws on malformed schedules (invalid timezone/time, missing dayOfWeek/
 * dayOfMonth) — callers persist schedules through validateSchedule, and the
 * dispatcher catches per-automation.
 */
export function computeNextRunAt(
	schedule: AutomationSchedule,
	fromMs: number
): number {
	const error = validateSchedule(schedule);
	if (error) throw new Error(error);
	const { hour, minute } = parseTime(schedule.time ?? DEFAULT_SCHEDULE_TIME);
	const startWall = (() => {
		const p = getWallParts(fromMs, schedule.timezone);
		return { year: p.year, month: p.month, day: p.day };
	})();
	for (let i = 0; i <= MAX_SEARCH_DAYS; i++) {
		const wall = addDays(startWall, i);
		if (!matchesFrequency(wall, schedule)) continue;
		const candidate = wallTimeToUtc(wall, hour, minute, schedule.timezone);
		if (candidate > fromMs) return candidate;
	}
	// Unreachable: every frequency recurs within 62 days.
	throw new Error("No next run found within the search window");
}

const WEEKDAY_LABELS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;

function ordinal(n: number): string {
	const rem100 = n % 100;
	if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
	const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
	return `${n}${suffix}`;
}

function formatTimeLabel(time: string): string {
	const { hour, minute } = parseTime(time);
	const period = hour >= 12 ? "PM" : "AM";
	const h12 = hour % 12 === 0 ? 12 : hour % 12;
	return `${h12}:${String(minute).padStart(2, "0")} ${period}`;
}

/** Short timezone label, e.g. "ET" for America/New_York; falls back to the IANA id. */
export function timezoneLabel(timezone: string, refMs: number): string {
	try {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			timeZoneName: "shortGeneric",
		}).formatToParts(refMs);
		const name = parts.find((p) => p.type === "timeZoneName")?.value;
		if (name) return name.replace(/ Time$/, "");
	} catch {
		// fall through to the IANA id
	}
	return timezone;
}

/**
 * Human summary for trigger cards, e.g. "Weekly on Monday, 9:00 AM ET".
 * `refMs` anchors the timezone label (which can vary across DST).
 */
export function describeSchedule(
	schedule: AutomationSchedule,
	refMs: number
): string {
	const time = formatTimeLabel(schedule.time ?? DEFAULT_SCHEDULE_TIME);
	const tz = timezoneLabel(schedule.timezone, refMs);
	switch (schedule.frequency) {
		case "daily":
			return `Daily at ${time} ${tz}`;
		case "weekly": {
			const day = WEEKDAY_LABELS[schedule.dayOfWeek ?? 0] ?? "Sunday";
			return `Weekly on ${day}, ${time} ${tz}`;
		}
		case "monthly":
			return `Monthly on the ${ordinal(schedule.dayOfMonth ?? 1)}, ${time} ${tz}`;
	}
}
