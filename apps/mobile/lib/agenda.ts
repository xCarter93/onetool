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
	assigneeUserId?: string;
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

export type AgendaProject = {
	_id: string;
	title: string;
	status: string;
	startDate?: number;
	endDate?: number;
	/** Client name, shown as the secondary line. */
	context?: string;
	assignedUserIds?: string[];
};

/** Day-plan visibility scope: my work (default) or the whole team's. */
export type DayScope = "me" | "team";

/**
 * "Me" includes UNASSIGNED work on purpose — in a shop that doesn't assign
 * everything, an unassigned job is still yours to action, and the default tab
 * must never show a confidently empty day. A null meId (profile still loading)
 * fails open to visible rather than flashing an empty plan.
 */
export function taskInScope(
	task: Pick<AgendaTask, "assigneeUserId">,
	meId: string | null,
	scope: DayScope,
): boolean {
	if (scope === "team" || meId === null) return true;
	return task.assigneeUserId === undefined || task.assigneeUserId === meId;
}

export function projectInScope(
	project: Pick<AgendaProject, "assignedUserIds">,
	meId: string | null,
	scope: DayScope,
): boolean {
	if (scope === "team" || meId === null) return true;
	return (
		project.assignedUserIds === undefined ||
		project.assignedUserIds.length === 0 ||
		project.assignedUserIds.includes(meId)
	);
}

/**
 * Projects whose scheduled span covers `dayMs`, open ones only.
 *
 * A project carries dates but no start/end TIME, so it can never be a timeline
 * block — it is a day-level band that renders above the agenda in BOTH
 * representations, the same argument that hoisted the attention line.
 * Bounds are UTC-midnight date-ids: compare in UTC (see lib/date.ts).
 */
export function projectsForDay(
	projects: readonly AgendaProject[],
	dayMs: number,
): AgendaProject[] {
	const day = utcDayStartMs(dayMs);
	return projects
		.filter((p) => {
			if (p.startDate === undefined || isDoneStatus(p.status)) return false;
			const start = utcDayStartMs(p.startDate);
			// A project with no end date occupies its start day only.
			const end = p.endDate === undefined ? start : utcDayStartMs(p.endDate);
			return day >= start && day <= end;
		})
		.sort((a, b) => a.title.localeCompare(b.title));
}

export type DayPlan = {
	/** The day's timed tasks, in start order. */
	timed: AgendaTask[];
	/** The day's untimed tasks, title order. */
	anytime: AgendaTask[];
	/** Open spillover from earlier days, oldest first. */
	overdue: AgendaTask[];
	/** Task to emphasize as "next up"; null off-today or when the day is done. */
	nextUpId: string | null;
	/**
	 * `timed` index the now-separator renders BEFORE (== timed.length → after
	 * the last row); -1 = don't render (browsing another day, or no timed work).
	 */
	nowIndex: number;
};

/**
 * One chronological plan for the selected day — the single representation that
 * replaced the Agenda/Timeline split (an hour grid isn't glanceable at phone
 * width; every field-service app defaults techs to a list).
 *
 * Overdue is spillover anchored to *today*, not the browsed day, so it stays
 * stable while flicking through the week strip and never brands a past day's
 * own work "overdue".
 */
export function buildDayPlan(
	tasks: AgendaTask[],
	selectedDayMs: number,
	todayMs: number,
	/** Local minutes-since-midnight; only read when the selected day is today. */
	nowMinutes: number,
): DayPlan {
	const day = utcDayStartMs(selectedDayMs);
	const today = utcDayStartMs(todayMs);

	const timed: AgendaTask[] = [];
	const anytime: AgendaTask[] = [];
	const overdue: AgendaTask[] = [];

	for (const task of tasks) {
		if (task.date === undefined) continue;
		const taskDay = utcDayStartMs(task.date);
		if (taskDay === day) {
			(minutesFromHHMM(task.startTime) === null ? anytime : timed).push(task);
		} else if (taskDay < today && day >= today && !DONE.has(task.status ?? "")) {
			overdue.push(task);
		}
	}

	timed.sort(byStartTime);
	anytime.sort((a, b) => a.title.localeCompare(b.title));
	// Oldest first — the thing you've ignored longest leads.
	overdue.sort((a, b) => (a.date ?? 0) - (b.date ?? 0));

	let nowIndex = -1;
	let nextUpId: string | null = null;
	if (day === today && timed.length > 0) {
		const firstUpcoming = timed.findIndex(
			(t) => (minutesFromHHMM(t.startTime) ?? 0) >= nowMinutes,
		);
		nowIndex = firstUpcoming === -1 ? timed.length : firstUpcoming;
		// Next up = the first upcoming task still open; a done row isn't "next".
		nextUpId =
			timed.slice(nowIndex).find((t) => !DONE.has(t.status ?? ""))?._id ?? null;
	}

	return { timed, anytime, overdue, nextUpId, nowIndex };
}

/**
 * Width fraction (0-1) for a day's workload bar, scaled against the busiest day
 * in view. Relative rather than absolute so the strip reads as a shape for any
 * shop size — 2 jobs is a full bar for someone whose peak is 2.
 *
 * A day with work never returns less than MIN_BAR: a 1-of-12 day must still be
 * visibly non-empty, which is the whole signal.
 */
export const MIN_WORKLOAD_BAR = 0.28;

export function workloadBar(count: number, maxCount: number): number {
	if (count <= 0 || maxCount <= 0) return 0;
	return Math.max(MIN_WORKLOAD_BAR, Math.min(1, count / maxCount));
}

/** Task counts keyed by UTC-midnight ms, for the week strip's bars. */
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
