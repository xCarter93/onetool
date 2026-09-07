import { v, type Infer } from "convex/values";

const endValidator = v.union(
	v.object({ kind: v.literal("until"), date: v.string() }),
	v.object({ kind: v.literal("count"), count: v.number() })
);

export const projectRecurrenceRuleValidator = v.object({
	frequency: v.union(
		v.literal("daily"),
		v.literal("weekly"),
		v.literal("monthly"),
		v.literal("yearly")
	),
	interval: v.number(),
	weekdays: v.optional(v.array(v.number())),
	monthDays: v.optional(v.array(v.number())),
	ordinalWeekday: v.optional(
		v.object({ ordinal: v.number(), weekday: v.number() })
	),
	months: v.optional(v.array(v.number())),
	end: v.optional(endValidator),
});

export type ProjectRecurrenceRule = Infer<
	typeof projectRecurrenceRuleValidator
>;

const DAY_MS = 86_400_000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_INTERVAL = 1_000;
const MAX_COUNT = 10_000;
const MAX_OUTPUT = 10_000;
// A Gregorian calendar repeats after 146,097 days; this also covers 10,000 sparse occurrences.
const MAX_SEARCH_PERIODS = 146_097;

type CalendarDate = { year: number; month: number; day: number };

function parseDateKey(value: string): CalendarDate {
	const match = DATE_KEY.exec(value);
	if (!match) throw new Error(`Invalid date "${value}"; expected YYYY-MM-DD`);
	const date = {
		year: Number(match[1]),
		month: Number(match[2]),
		day: Number(match[3]),
	};
	if (date.year < 1 || date.year > 9999 || date.month < 1 || date.month > 12) {
		throw new Error(`Invalid calendar date "${value}"`);
	}
	const roundTrip = new Date(utcDay(date));
	if (
		roundTrip.getUTCFullYear() !== date.year ||
		roundTrip.getUTCMonth() + 1 !== date.month ||
		roundTrip.getUTCDate() !== date.day
	) {
		throw new Error(`Invalid calendar date "${value}"`);
	}
	return date;
}

function formatDate({ year, month, day }: CalendarDate): string {
	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function utcDay(date: CalendarDate): number {
	const value = new Date(0);
	value.setUTCHours(0, 0, 0, 0);
	value.setUTCFullYear(date.year, date.month - 1, date.day);
	return value.getTime();
}

function daysInMonth(year: number, month: number): number {
	const firstOfNextMonth = new Date(0);
	firstOfNextMonth.setUTCHours(0, 0, 0, 0);
	firstOfNextMonth.setUTCFullYear(year, month, 1);
	return new Date(firstOfNextMonth.getTime() - DAY_MS).getUTCDate();
}

function weekday(date: CalendarDate): number {
	return new Date(utcDay(date)).getUTCDay();
}

export function addCalendarDays(date: string, days: number): string {
	if (!Number.isInteger(days))
		throw new Error("Calendar day offset must be an integer");
	const parsed = parseDateKey(date);
	const shifted = new Date(utcDay(parsed) + days * DAY_MS);
	const result = formatDate({
		year: shifted.getUTCFullYear(),
		month: shifted.getUTCMonth() + 1,
		day: shifted.getUTCDate(),
	});
	parseDateKey(result);
	return result;
}

// Persisted project dates are UTC-midnight encodings of a calendar day.
export function storedDateKey(timestamp: number): string {
	if (!Number.isFinite(timestamp)) throw new Error("Invalid project date");
	return new Date(timestamp).toISOString().slice(0, 10);
}

export function storedDate(date: string): number {
	return Date.parse(`${date}T00:00:00.000Z`);
}

export function calendarDayDifference(start: string, end: string): number {
	return (utcDay(parseDateKey(end)) - utcDay(parseDateKey(start))) / DAY_MS;
}

export function dateKeyFromTimestamp(
	timestamp: number,
	timeZone: string
): string {
	if (!Number.isFinite(timestamp)) throw new Error("Timestamp must be finite");
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(timestamp);
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((part) => part.type === type)?.value);
	return formatDate({
		year: get("year"),
		month: get("month"),
		day: get("day"),
	});
}

function integerInRange(value: number, min: number, max: number): boolean {
	return Number.isInteger(value) && value >= min && value <= max;
}

function validateNumberList(
	values: number[] | undefined,
	name: string,
	min: number,
	max: number,
	maxLength: number
): string | null {
	if (values === undefined) return null;
	if (values.length === 0) return `${name} must not be empty`;
	if (values.length > maxLength)
		return `${name} must contain at most ${maxLength} values`;
	if (values.some((value) => !integerInRange(value, min, max))) {
		return `${name} must contain integers from ${min} to ${max}`;
	}
	return null;
}

export function validateRecurrenceRule(
	rule: ProjectRecurrenceRule,
	anchor: string
): string | null {
	try {
		parseDateKey(anchor);
	} catch (error) {
		return error instanceof Error ? error.message : "Invalid anchor date";
	}
	if (!integerInRange(rule.interval, 1, MAX_INTERVAL)) {
		return `Interval must be an integer from 1 to ${MAX_INTERVAL}`;
	}
	const weekdayError = validateNumberList(rule.weekdays, "Weekdays", 0, 6, 7);
	if (weekdayError) return weekdayError;
	const monthDayError = validateNumberList(
		rule.monthDays,
		"Month days",
		1,
		31,
		31
	);
	if (monthDayError) return monthDayError;
	const monthError = validateNumberList(rule.months, "Months", 1, 12, 12);
	if (monthError) return monthError;
	if (rule.ordinalWeekday) {
		if (![1, 2, 3, 4, 5, -1].includes(rule.ordinalWeekday.ordinal)) {
			return "Ordinal must be 1 through 5, or -1 for last";
		}
		if (!integerInRange(rule.ordinalWeekday.weekday, 0, 6)) {
			return "Ordinal weekday must be an integer from 0 to 6";
		}
	}
	if (rule.monthDays && rule.ordinalWeekday) {
		return "Use month days or an ordinal weekday, not both";
	}
	if (
		rule.frequency === "daily" &&
		(rule.weekdays || rule.monthDays || rule.ordinalWeekday)
	) {
		return "Daily recurrence only accepts seasonal month selectors";
	}
	if (rule.frequency === "weekly" && (rule.monthDays || rule.ordinalWeekday)) {
		return "Weekly recurrence only accepts weekday and seasonal month selectors";
	}
	if (
		(rule.frequency === "monthly" || rule.frequency === "yearly") &&
		rule.weekdays
	) {
		return `${rule.frequency === "monthly" ? "Monthly" : "Yearly"} recurrence does not accept weekdays`;
	}
	if (
		rule.end?.kind === "count" &&
		!integerInRange(rule.end.count, 1, MAX_COUNT)
	) {
		return `Occurrence count must be an integer from 1 to ${MAX_COUNT}`;
	}
	if (rule.end?.kind === "until") {
		try {
			parseDateKey(rule.end.date);
		} catch (error) {
			return error instanceof Error ? error.message : "Invalid end date";
		}
		if (rule.end.date < anchor)
			return "Until date must not be before the anchor";
	}
	return null;
}

function uniqueSorted(values: number[]): number[] {
	return [...new Set(values)].sort((a, b) => a - b);
}

function monthCandidates(
	year: number,
	month: number,
	rule: ProjectRecurrenceRule,
	anchorDay: number
): string[] {
	const lastDay = daysInMonth(year, month);
	if (rule.ordinalWeekday) {
		const { ordinal, weekday: target } = rule.ordinalWeekday;
		let day: number;
		if (ordinal === -1) {
			day =
				lastDay - ((weekday({ year, month, day: lastDay }) - target + 7) % 7);
		} else {
			day =
				1 +
				((target - weekday({ year, month, day: 1 }) + 7) % 7) +
				(ordinal - 1) * 7;
		}
		return day <= lastDay ? [formatDate({ year, month, day })] : [];
	}
	return uniqueSorted(
		(rule.monthDays ?? [anchorDay]).map((day) => Math.min(day, lastDay))
	).map((day) => formatDate({ year, month, day }));
}

function mondayOf(date: string): string {
	const day = weekday(parseDateKey(date));
	return addCalendarDays(date, -((day + 6) % 7));
}

function* candidates(
	rule: ProjectRecurrenceRule,
	anchor: string,
	near: string
): Generator<string> {
	const anchorDate = parseDateKey(anchor);
	if (rule.frequency === "daily") {
		let step = Math.max(
			1,
			Math.ceil(calendarDayDifference(anchor, near) / rule.interval)
		);
		for (let searched = 0; searched < MAX_SEARCH_PERIODS; searched++, step++) {
			const candidate = addCalendarDays(anchor, step * rule.interval);
			if (!rule.months || rule.months.includes(parseDateKey(candidate).month))
				yield candidate;
		}
		return;
	}
	if (rule.frequency === "weekly") {
		const weekStart = mondayOf(anchor);
		const weekdays = uniqueSorted(
			(rule.weekdays ?? [weekday(anchorDate)]).map((day) => (day + 6) % 7)
		);
		let period = Math.max(
			0,
			Math.floor(calendarDayDifference(weekStart, near) / 7 / rule.interval)
		);
		for (
			let searched = 0;
			searched < MAX_SEARCH_PERIODS;
			searched++, period++
		) {
			const start = addCalendarDays(weekStart, period * rule.interval * 7);
			for (const offset of weekdays) {
				const candidate = addCalendarDays(start, offset);
				if (!rule.months || rule.months.includes(parseDateKey(candidate).month))
					yield candidate;
			}
		}
		return;
	}
	if (rule.frequency === "monthly") {
		const anchorIndex = anchorDate.year * 12 + anchorDate.month - 1;
		const nearDate = parseDateKey(near);
		const nearIndex = nearDate.year * 12 + nearDate.month - 1;
		let period = Math.max(
			0,
			Math.floor((nearIndex - anchorIndex) / rule.interval)
		);
		for (
			let searched = 0;
			searched < MAX_SEARCH_PERIODS;
			searched++, period++
		) {
			const index = anchorIndex + period * rule.interval;
			const year = Math.floor(index / 12);
			if (year > 9999) return;
			const month = (index % 12) + 1;
			if (!rule.months || rule.months.includes(month)) {
				yield* monthCandidates(year, month, rule, anchorDate.day);
			}
		}
		return;
	}
	const months = uniqueSorted(rule.months ?? [anchorDate.month]);
	let period = Math.max(
		0,
		Math.floor((parseDateKey(near).year - anchorDate.year) / rule.interval)
	);
	for (let searched = 0; searched < MAX_SEARCH_PERIODS; searched++, period++) {
		const year = anchorDate.year + period * rule.interval;
		if (year > 9999) return;
		for (const month of months)
			yield* monthCandidates(year, month, rule, anchorDate.day);
	}
}

function countBefore(
	rule: ProjectRecurrenceRule,
	anchor: string,
	before: string
): number {
	let count = 1;
	for (const candidate of candidates(rule, anchor, anchor)) {
		if (candidate >= before) return count;
		if (candidate > anchor) count++;
		if (count >= MAX_COUNT) return count;
	}
	return count;
}

export function listRecurrenceDates(args: {
	rule: ProjectRecurrenceRule;
	anchor: string;
	from: string;
	through: string;
	limit: number;
	includeNext?: boolean;
}): string[] {
	const { rule, anchor, from, through, includeNext = false } = args;
	const error = validateRecurrenceRule(rule, anchor);
	if (error) throw new Error(error);
	parseDateKey(from);
	parseDateKey(through);
	if (from > through)
		throw new Error("From date must not be after through date");
	if (!integerInRange(args.limit, 1, MAX_OUTPUT)) {
		throw new Error(`Limit must be an integer from 1 to ${MAX_OUTPUT}`);
	}

	const result: string[] = [];
	const finiteCount = rule.end?.kind === "count" ? rule.end.count : undefined;
	let occurrence =
		finiteCount === undefined ? 1 : countBefore(rule, anchor, from);
	if (anchor >= from && anchor <= through) result.push(anchor);
	if (includeNext && anchor > through) return [anchor];
	if (finiteCount === 1 || result.length >= args.limit) return result;

	const start = from > anchor ? from : anchor;
	for (const candidate of candidates(rule, anchor, start)) {
		if (candidate <= anchor || candidate < from) continue;
		occurrence++;
		if (finiteCount !== undefined && occurrence > finiteCount) break;
		if (rule.end?.kind === "until" && candidate > rule.end.date) break;
		if (candidate <= through) {
			result.push(candidate);
			if (result.length >= args.limit) break;
			continue;
		}
		if (includeNext && result.length === 0) result.push(candidate);
		break;
	}
	return result;
}
