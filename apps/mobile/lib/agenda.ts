// Agenda + week-strip math for the Today tab. Pure functions only (no RN, no
// Convex) so they are unit-testable in the node vitest environment.
//
// Task dates are stored as Date.UTC ms (see backend tasks.ts) — every day
// boundary here is a UTC boundary. Never use local getFullYear/getMonth/getDate
// on a task date. `startTime`/`endTime` are "HH:MM" wall-clock strings.

import { DAY_MS } from "@/components/calendar/dateUtils";
import { utcDayStartMs } from "@/lib/date";

/** Sunday-start, matching the mockup's `Sun Mon Tue Wed Thu Fri Sat` strip. */
export const WEEK_STARTS_ON = 0;

export type AgendaTask = {
	_id: string;
	title: string;
	date?: number;
	startTime?: string;
	endTime?: string;
	status?: string;
	/** Client / project line shown under the title. */
	context?: string;
};

export type AgendaGroupKey =
	| "morning"
	| "afternoon"
	| "evening"
	| "anytime"
	| "overdue";

export type AgendaGroup = {
	key: AgendaGroupKey;
	label: string;
	tasks: AgendaTask[];
};

const GROUP_LABEL: Record<AgendaGroupKey, string> = {
	morning: "Morning",
	afternoon: "Afternoon",
	evening: "Evening",
	anytime: "Anytime",
	overdue: "Overdue",
};

/**
 * The 7 UTC-midnight timestamps of the week containing `anchorMs`.
 * Sunday first — a field crew reads a calendar week, not an ISO week.
 */
export function weekDaysFor(anchorMs: number): number[] {
	const start = utcDayStartMs(anchorMs);
	const dow = new Date(start).getUTCDay(); // 0 = Sunday
	const sunday = start - ((dow - WEEK_STARTS_ON + 7) % 7) * DAY_MS;
	return Array.from({ length: 7 }, (_, i) => sunday + i * DAY_MS);
}

/** Minutes since midnight for an "HH:MM" string; null when unparseable. */
export function minutesFromHHMM(time?: string): number | null {
	if (!time) return null;
	const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
	if (!m) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h > 23 || min > 59) return null;
	return h * 60 + min;
}

/**
 * "HH:MM" → a 12-hour label ("8:00 AM"). Returns undefined for untimed or
 * unparseable input so callers can fall back to "Anytime" rather than printing
 * a broken time.
 */
export function formatClockLabel(time?: string): string | undefined {
	const mins = minutesFromHHMM(time);
	if (mins === null) return undefined;
	const h24 = Math.floor(mins / 60);
	const m = mins % 60;
	const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
	return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

function slotFor(task: AgendaTask): Exclude<AgendaGroupKey, "overdue"> {
	const mins = minutesFromHHMM(task.startTime);
	if (mins === null) return "anytime";
	if (mins < 12 * 60) return "morning";
	if (mins < 17 * 60) return "afternoon";
	return "evening";
}

function byStartTime(a: AgendaTask, b: AgendaTask): number {
	const am = minutesFromHHMM(a.startTime);
	const bm = minutesFromHHMM(b.startTime);
	if (am === null && bm === null) return a.title.localeCompare(b.title);
	if (am === null) return 1;
	if (bm === null) return -1;
	return am - bm || a.title.localeCompare(b.title);
}

const DONE = new Set(["completed", "cancelled"]);

/** Single source of "this task is finished" — statuses that end a task's life. */
export function isDoneStatus(status?: string): boolean {
	return DONE.has(status ?? "");
}

/**
 * Group one day's tasks into the Today feed's sections.
 *
 * Overdue is spillover, so it sorts LAST (after the day's own work) and only
 * appears when the selected day is today or later — looking back at Monday
 * should not show Monday's work as "overdue".
 */
export function buildAgenda(
	tasks: AgendaTask[],
	selectedDayMs: number,
	todayMs: number,
): AgendaGroup[] {
	const day = utcDayStartMs(selectedDayMs);
	const today = utcDayStartMs(todayMs);

	const onDay: AgendaTask[] = [];
	const overdue: AgendaTask[] = [];

	for (const task of tasks) {
		if (task.date === undefined) continue;
		const taskDay = utcDayStartMs(task.date);
		if (taskDay === day) {
			onDay.push(task);
		} else if (taskDay < today && day >= today && !DONE.has(task.status ?? "")) {
			// Spillover is anchored to *today*, not to the browsed day, so it stays
			// stable while flicking through the week strip.
			overdue.push(task);
		}
	}

	const slots: Record<Exclude<AgendaGroupKey, "overdue">, AgendaTask[]> = {
		morning: [],
		afternoon: [],
		evening: [],
		anytime: [],
	};
	for (const task of onDay) slots[slotFor(task)].push(task);

	const groups: AgendaGroup[] = [];
	for (const key of ["morning", "afternoon", "evening", "anytime"] as const) {
		if (slots[key].length === 0) continue;
		groups.push({
			key,
			label: GROUP_LABEL[key],
			tasks: slots[key].sort(byStartTime),
		});
	}
	if (overdue.length > 0) {
		groups.push({
			key: "overdue",
			label: GROUP_LABEL.overdue,
			// Oldest first — the thing you've ignored longest leads.
			tasks: overdue.sort((a, b) => (a.date ?? 0) - (b.date ?? 0)),
		});
	}
	return groups;
}

/**
 * Per-day workload dots for the week strip. Capped at 3 — the strip conveys
 * "light / normal / heavy", not a count (that's what the day-sheet is for).
 */
export const MAX_WORKLOAD_DOTS = 3;

export function workloadDots(taskCount: number): number {
	if (taskCount <= 0) return 0;
	if (taskCount <= 2) return 1;
	if (taskCount <= 4) return 2;
	return MAX_WORKLOAD_DOTS;
}

/** Task counts keyed by UTC-midnight ms, for the week strip's dots. */
export function countTasksByDay(tasks: AgendaTask[]): Map<number, number> {
	const counts = new Map<number, number>();
	for (const task of tasks) {
		if (task.date === undefined) continue;
		if (DONE.has(task.status ?? "")) continue;
		const day = utcDayStartMs(task.date);
		counts.set(day, (counts.get(day) ?? 0) + 1);
	}
	return counts;
}

/** One-line Tomorrow peek: "3 tasks · first stop 8:30 AM" style summary parts. */
export function tomorrowPeek(
	tasks: AgendaTask[],
	todayMs: number,
): { count: number; firstStart?: string } {
	const tomorrow = utcDayStartMs(todayMs) + DAY_MS;
	const onDay = tasks.filter(
		(t) =>
			t.date !== undefined &&
			utcDayStartMs(t.date) === tomorrow &&
			!DONE.has(t.status ?? ""),
	);
	const timed = onDay
		.map((t) => minutesFromHHMM(t.startTime))
		.filter((m): m is number => m !== null)
		.sort((a, b) => a - b);
	const first = timed[0];
	return {
		count: onDay.length,
		firstStart:
			first === undefined
				? undefined
				: `${String(Math.floor(first / 60)).padStart(2, "0")}:${String(
						first % 60,
					).padStart(2, "0")}`,
	};
}
