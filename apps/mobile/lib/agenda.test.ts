import { describe, expect, it } from "vitest";
import {
	buildDayPlan,
	buildUpcomingAgenda,
	countScheduleByDay,
	countTasksByDay,
	dayLabel,
	formatClockLabel,
	isWeekend,
	minutesFromHHMM,
	projectInScope,
	projectsForDay,
	scopeCalendarEvents,
	selectNextUp,
	taskInScope,
	tomorrowPeek,
	weekDaysFor,
	workloadBar,
	type AgendaProject,
	type AgendaTask,
	type CalendarEvents,
	type ScopedSchedule,
} from "./agenda";
import type { ProjectEvent, TaskEvent } from "@/components/calendar/dateUtils";

const DAY = 86_400_000;
const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

// 2026-07-22 is a Wednesday.
const WED = utc(2026, 7, 22);
const SUN = utc(2026, 7, 19);
const SAT = utc(2026, 7, 25);

const task = (over: Partial<AgendaTask> & { _id: string }): AgendaTask => ({
	title: over._id,
	...over,
});

describe("weekDaysFor", () => {
	it("returns 7 UTC-midnight days, Sunday first", () => {
		const week = weekDaysFor(WED);
		expect(week).toHaveLength(7);
		expect(week[0]).toBe(SUN);
		expect(week[6]).toBe(SAT);
		expect(new Date(week[0]).getUTCDay()).toBe(0);
	});

	it("is stable for any moment inside the day", () => {
		expect(weekDaysFor(WED + 23 * 3_600_000)).toEqual(weekDaysFor(WED));
	});

	it("keeps Sunday as the first cell when the anchor IS Sunday", () => {
		expect(weekDaysFor(SUN)[0]).toBe(SUN);
	});

	it("does not drift across a month boundary", () => {
		// 2026-08-01 is a Saturday, so its week starts 2026-07-26.
		expect(weekDaysFor(utc(2026, 8, 1))[0]).toBe(utc(2026, 7, 26));
	});
});

describe("minutesFromHHMM", () => {
	it("parses valid times", () => {
		expect(minutesFromHHMM("08:00")).toBe(480);
		expect(minutesFromHHMM("8:05")).toBe(485);
		expect(minutesFromHHMM("23:59")).toBe(1439);
	});

	it("rejects junk instead of coercing it", () => {
		for (const bad of [undefined, "", "noon", "24:00", "12:60", "12", "1200"]) {
			expect(minutesFromHHMM(bad)).toBeNull();
		}
	});
});

describe("buildDayPlan", () => {
	const tasks: AgendaTask[] = [
		task({ _id: "wash", date: WED, startTime: "08:00" }),
		task({ _id: "gutter", date: WED, startTime: "09:30" }),
		task({ _id: "deep", date: WED, startTime: "13:00" }),
		task({ _id: "zuntimed", date: WED }),
		task({ _id: "auntimed", date: WED }),
		task({ _id: "old", date: WED - 2 * DAY }),
		task({ _id: "older", date: WED - 5 * DAY }),
		task({ _id: "olddone", date: WED - 3 * DAY, status: "completed" }),
		task({ _id: "nextweek", date: WED + 5 * DAY, startTime: "10:00" }),
	];
	const NOON = 12 * 60;

	it("splits the day into timed (start order), anytime (title order), overdue (oldest first)", () => {
		const plan = buildDayPlan(tasks, WED, WED, NOON);
		expect(plan.timed.map((t) => t._id)).toEqual(["wash", "gutter", "deep"]);
		expect(plan.anytime.map((t) => t._id)).toEqual(["auntimed", "zuntimed"]);
		expect(plan.overdue.map((t) => t._id)).toEqual(["older", "old"]);
	});

	it("places the now separator before the first task at/after now", () => {
		expect(buildDayPlan(tasks, WED, WED, NOON).nowIndex).toBe(2);
		expect(buildDayPlan(tasks, WED, WED, 7 * 60).nowIndex).toBe(0);
		// 08:00 exactly counts as upcoming, not past.
		expect(buildDayPlan(tasks, WED, WED, 8 * 60).nowIndex).toBe(0);
	});

	it("puts the separator after the last row once the day is behind you", () => {
		const plan = buildDayPlan(tasks, WED, WED, 23 * 60);
		expect(plan.nowIndex).toBe(plan.timed.length);
	});

	it("has no now separator when browsing another day", () => {
		expect(buildDayPlan(tasks, WED + 2 * DAY, WED, NOON).nowIndex).toBe(-1);
	});

	it("has no now separator when the day has no timed work", () => {
		const plan = buildDayPlan([task({ _id: "a", date: WED })], WED, WED, NOON);
		expect(plan.nowIndex).toBe(-1);
	});

	it("excludes completed/cancelled work from overdue", () => {
		const ids = buildDayPlan(tasks, WED, WED, NOON).overdue.map((t) => t._id);
		expect(ids).not.toContain("olddone");
	});

	it("hides overdue when browsing a PAST day", () => {
		expect(buildDayPlan(tasks, WED - DAY, WED, NOON).overdue).toEqual([]);
	});

	it("anchors overdue to today, not to the browsed future day", () => {
		// Browsing Friday should still show work overdue as of today (Wednesday),
		// and must not call Wednesday's own tasks overdue.
		const plan = buildDayPlan(tasks, WED + 2 * DAY, WED, NOON);
		expect(plan.overdue.map((t) => t._id)).toEqual(["older", "old"]);
	});

	it("is unaffected by the time-of-day component of the day arguments", () => {
		const noonInstant = WED + 12 * 3_600_000;
		expect(buildDayPlan(tasks, noonInstant, noonInstant, NOON)).toEqual(
			buildDayPlan(tasks, WED, WED, NOON),
		);
	});

	it("ignores tasks with no date", () => {
		const plan = buildDayPlan([task({ _id: "floating" })], WED, WED, NOON);
		expect(plan.timed).toEqual([]);
		expect(plan.anytime).toEqual([]);
	});
});

describe("selectNextUp", () => {
	const NOON = 12 * 60;
	const day: AgendaTask[] = [
		task({ _id: "wash", date: WED, startTime: "08:00" }),
		task({ _id: "gutter", date: WED, startTime: "13:00" }),
		task({ _id: "deep", date: WED, startTime: "15:00" }),
	];
	const none = new Set<string>();

	it("lifts the first open upcoming task out of the timeline", () => {
		const split = selectNextUp(buildDayPlan(day, WED, WED, NOON), none);
		expect(split.next?._id).toBe("gutter");
		expect(split.timed.map((t) => t._id)).toEqual(["wash", "deep"]);
	});

	it("advances past an OPTIMISTICALLY completed row before the server agrees", () => {
		const plan = buildDayPlan(day, WED, WED, NOON);
		const split = selectNextUp(plan, new Set(["gutter"]));
		expect(split.next?._id).toBe("deep");
		expect(split.timed.map((t) => t._id)).toEqual(["wash", "gutter"]);
	});

	it("skips rows the server already calls done", () => {
		const withDone = [
			task({ _id: "did", date: WED, startTime: "13:00", status: "completed" }),
			task({ _id: "next", date: WED, startTime: "15:00" }),
		];
		expect(selectNextUp(buildDayPlan(withDone, WED, WED, NOON), none).next?._id).toBe(
			"next",
		);
	});

	it("keeps the now separator's position on the shortened timeline", () => {
		// now = 07:00, so nowIndex is 0 and the lead is the first row.
		const split = selectNextUp(buildDayPlan(day, WED, WED, 7 * 60), none);
		expect(split.next?._id).toBe("wash");
		expect(split.nowIndex).toBe(0);
		// Everything after now is done → separator clamps to the shortened end.
		const late = selectNextUp(
			buildDayPlan(day, WED, WED, 14 * 60),
			new Set(["deep"]),
		);
		expect(late.next).toBeNull();
		expect(late.nowIndex).toBe(2);
	});

	it("clamps the separator when the lead was the only row left", () => {
		const one = [task({ _id: "solo", date: WED, startTime: "15:00" })];
		const split = selectNextUp(buildDayPlan(one, WED, WED, NOON), none);
		expect(split.next?._id).toBe("solo");
		expect(split.timed).toEqual([]);
		expect(split.nowIndex).toBe(0);
	});

	it("yields no card when browsing another day, or when the day is done", () => {
		const elsewhere = selectNextUp(buildDayPlan(day, WED + DAY, WED, NOON), none);
		expect(elsewhere.next).toBeNull();
		expect(elsewhere.nowIndex).toBe(-1);

		const finished = buildDayPlan(day, WED, WED, NOON);
		const allDone = selectNextUp(finished, new Set(["wash", "gutter", "deep"]));
		expect(allDone.next).toBeNull();
		expect(allDone.timed).toBe(finished.timed);
	});
});

describe("scope filters", () => {
	it("me = mine or unassigned; team = everything", () => {
		expect(taskInScope({ assigneeUserId: "u1" }, "u1", "me")).toBe(true);
		expect(taskInScope({ assigneeUserId: "u2" }, "u1", "me")).toBe(false);
		expect(taskInScope({}, "u1", "me")).toBe(true);
		expect(taskInScope({ assigneeUserId: "u2" }, "u1", "team")).toBe(true);
	});

	it("fails open while the profile is still loading", () => {
		// A null meId must never flash an empty day.
		expect(taskInScope({ assigneeUserId: "u2" }, null, "me")).toBe(true);
		expect(projectInScope({ assignedUserIds: ["u2"] }, null, "me")).toBe(true);
	});

	it("projects match when I am ANY of the assignees, or none are set", () => {
		expect(projectInScope({ assignedUserIds: ["u2", "u1"] }, "u1", "me")).toBe(
			true,
		);
		expect(projectInScope({ assignedUserIds: ["u2"] }, "u1", "me")).toBe(false);
		expect(projectInScope({}, "u1", "me")).toBe(true);
		expect(projectInScope({ assignedUserIds: [] }, "u1", "me")).toBe(true);
		expect(projectInScope({ assignedUserIds: ["u2"] }, "u1", "team")).toBe(true);
	});
});

describe("countTasksByDay", () => {
	it("counts open work per UTC day and skips finished work", () => {
		const counts = countTasksByDay([
			task({ _id: "a", date: WED }),
			task({ _id: "b", date: WED + 3_600_000 }),
			task({ _id: "c", date: WED, status: "completed" }),
			task({ _id: "d", date: SAT }),
			task({ _id: "e" }),
		]);
		expect(counts.get(WED)).toBe(2);
		expect(counts.get(SAT)).toBe(1);
		expect(counts.size).toBe(2);
	});
});

describe("tomorrowPeek", () => {
	it("summarises tomorrow's open work and earliest start", () => {
		const peek = tomorrowPeek(
			[
				task({ _id: "late", date: WED + DAY, startTime: "14:00" }),
				task({ _id: "early", date: WED + DAY, startTime: "08:30" }),
				task({ _id: "untimed", date: WED + DAY }),
				task({ _id: "done", date: WED + DAY, status: "completed" }),
				task({ _id: "today", date: WED, startTime: "07:00" }),
			],
			WED,
		);
		expect(peek).toEqual({ count: 3, firstStart: "08:30" });
	});

	it("reports an empty tomorrow without a start time", () => {
		expect(tomorrowPeek([task({ _id: "today", date: WED })], WED)).toEqual({
			count: 0,
			firstStart: undefined,
		});
	});
});

describe("formatClockLabel", () => {
	it("renders morning and afternoon times in 12-hour form", () => {
		expect(formatClockLabel("08:00")).toBe("8:00 AM");
		expect(formatClockLabel("8:05")).toBe("8:05 AM");
		expect(formatClockLabel("13:30")).toBe("1:30 PM");
		expect(formatClockLabel("17:45")).toBe("5:45 PM");
	});

	// The two hours where 12-hour arithmetic normally breaks.
	it("renders both midnights as 12, not 0", () => {
		expect(formatClockLabel("00:00")).toBe("12:00 AM");
		expect(formatClockLabel("00:30")).toBe("12:30 AM");
		expect(formatClockLabel("12:00")).toBe("12:00 PM");
		expect(formatClockLabel("12:59")).toBe("12:59 PM");
	});

	it("crosses noon at the right minute", () => {
		expect(formatClockLabel("11:59")).toBe("11:59 AM");
		expect(formatClockLabel("23:59")).toBe("11:59 PM");
	});

	// Undefined (not a broken string) so callers can fall back to "Anytime".
	it("returns undefined for untimed or unparseable input", () => {
		expect(formatClockLabel(undefined)).toBeUndefined();
		expect(formatClockLabel("")).toBeUndefined();
		expect(formatClockLabel("noon")).toBeUndefined();
		expect(formatClockLabel("24:00")).toBeUndefined();
		expect(formatClockLabel("12:60")).toBeUndefined();
		expect(formatClockLabel("8")).toBeUndefined();
	});
});

describe("projectsForDay", () => {
	const proj = (
		over: Partial<AgendaProject> & { _id: string },
	): AgendaProject => ({
		title: "P",
		status: "planned",
		...over,
	});

	it("includes a project whose span covers the day, at both ends", () => {
		const p = [proj({ _id: "a", startDate: WED, endDate: SAT })];
		expect(projectsForDay(p, WED).map((x) => x._id)).toEqual(["a"]);
		expect(projectsForDay(p, SAT).map((x) => x._id)).toEqual(["a"]);
		expect(projectsForDay(p, WED + 2 * DAY).map((x) => x._id)).toEqual(["a"]);
	});

	it("excludes days outside the span", () => {
		const p = [proj({ _id: "a", startDate: WED, endDate: SAT })];
		expect(projectsForDay(p, SUN)).toEqual([]);
		expect(projectsForDay(p, SAT + DAY)).toEqual([]);
	});

	it("treats a missing endDate as a single-day project", () => {
		// Otherwise an open-ended project would leak onto every later day.
		const p = [proj({ _id: "a", startDate: WED })];
		expect(projectsForDay(p, WED).map((x) => x._id)).toEqual(["a"]);
		expect(projectsForDay(p, WED + DAY)).toEqual([]);
	});

	it("drops projects with no startDate — unscheduled is not today", () => {
		expect(projectsForDay([proj({ _id: "a" })], WED)).toEqual([]);
	});

	it("drops completed and cancelled projects", () => {
		// The agenda is work still to do; a finished project is not that.
		const p = [
			proj({ _id: "done", startDate: WED, status: "completed" }),
			proj({ _id: "gone", startDate: WED, status: "cancelled" }),
			proj({ _id: "live", startDate: WED, status: "in-progress" }),
		];
		expect(projectsForDay(p, WED).map((x) => x._id)).toEqual(["live"]);
	});

	it("buckets on the UTC day, so an afternoon instant still matches", () => {
		// Stored dates are UTC-midnight date-ids; a caller may pass an instant.
		const p = [proj({ _id: "a", startDate: WED })];
		expect(projectsForDay(p, WED + 18 * 3_600_000).map((x) => x._id)).toEqual([
			"a",
		]);
	});

	it("sorts by title so the band has a stable order", () => {
		const p = [
			proj({ _id: "b", title: "Beta", startDate: WED }),
			proj({ _id: "a", title: "Alpha", startDate: WED }),
		];
		expect(projectsForDay(p, WED).map((x) => x._id)).toEqual(["a", "b"]);
	});
});

describe("workloadBar", () => {
	it("scales against the busiest day in view", () => {
		expect(workloadBar(4, 4)).toBe(1);
		expect(workloadBar(2, 4)).toBe(0.5);
	});

	it("gives an empty day no bar at all", () => {
		expect(workloadBar(0, 6)).toBe(0);
	});

	it("keeps a busy day visible when the peak dwarfs it", () => {
		// 1-of-12 would round to a 3% sliver; the point of the bar is that a day
		// with work never looks empty.
		expect(workloadBar(1, 12)).toBe(0.28);
	});

	it("never exceeds a full bar, even on inconsistent input", () => {
		expect(workloadBar(9, 4)).toBe(1);
	});

	it("returns 0 when there is no scale to measure against", () => {
		// An empty week: dividing by a zero max would be NaN and paint nothing
		// predictable.
		expect(workloadBar(3, 0)).toBe(0);
	});
});

describe("scopeCalendarEvents", () => {
	const taskEvent = (over: Partial<TaskEvent> & { id: string }): TaskEvent => ({
		type: "task",
		title: over.id,
		startDate: WED,
		status: "pending",
		clientName: "Internal Task",
		...over,
	});
	const projectEvent = (
		over: Partial<ProjectEvent> & { id: string },
	): ProjectEvent => ({
		type: "project",
		title: over.id,
		startDate: WED,
		status: "in-progress",
		clientId: "c1",
		clientName: "Acme",
		...over,
	});

	const events: CalendarEvents = {
		tasks: [
			taskEvent({ id: "mine", assigneeUserId: "u1", startTime: "09:00" }),
			taskEvent({ id: "theirs", assigneeUserId: "u2" }),
			taskEvent({ id: "loose" }),
			taskEvent({ id: "withClient", clientId: "c1", clientName: "Acme" }),
		],
		projects: [
			projectEvent({ id: "pmine", assignedUserIds: ["u1"] }),
			projectEvent({ id: "ptheirs", assignedUserIds: ["u2"] }),
		],
	};

	it("adapts calendar events onto the agenda shapes", () => {
		const s = scopeCalendarEvents(events, "u1", "team");
		const mine = s.tasks.find((t) => t._id === "mine")!;
		expect(mine.date).toBe(WED);
		expect(mine.startTime).toBe("09:00");
		expect(s.projects.find((p) => p._id === "pmine")?.context).toBe("Acme");
	});

	it("drops the backend's placeholder client name for clientless tasks", () => {
		// "Internal Task"/"Unknown Client" are backend fillers — a row with no
		// client must show nothing rather than a fabricated line.
		const s = scopeCalendarEvents(events, "u1", "team");
		expect(s.tasks.find((t) => t._id === "loose")?.context).toBeUndefined();
		expect(s.tasks.find((t) => t._id === "withClient")?.context).toBe("Acme");
	});

	it("applies the scope helpers, keeping unassigned work in Me", () => {
		const me = scopeCalendarEvents(events, "u1", "me");
		expect(me.tasks.map((t) => t._id)).toEqual(["mine", "loose", "withClient"]);
		expect(me.projects.map((p) => p._id)).toEqual(["pmine"]);
		const team = scopeCalendarEvents(events, "u1", "team");
		expect(team.tasks).toHaveLength(4);
		expect(team.projects).toHaveLength(2);
	});

	it("returns an empty schedule while the query is still loading", () => {
		expect(scopeCalendarEvents(undefined, "u1", "me")).toEqual({
			projects: [],
			tasks: [],
		});
	});
});

describe("countScheduleByDay", () => {
	const week = weekDaysFor(WED);
	const proj = (
		over: Partial<AgendaProject> & { _id: string },
	): AgendaProject => ({ title: over._id, status: "in-progress", ...over });

	it("counts tasks AND project spans on each day in view", () => {
		const counts = countScheduleByDay(
			[task({ _id: "a", date: WED }), task({ _id: "b", date: WED })],
			[proj({ _id: "p", startDate: WED, endDate: WED + DAY })],
			week,
		);
		expect(counts.get(WED)).toBe(3);
		expect(counts.get(WED + DAY)).toBe(1);
	});

	it("counts a multi-day project on every day it spans", () => {
		const counts = countScheduleByDay(
			[],
			[proj({ _id: "p", startDate: SUN, endDate: SAT })],
			week,
		);
		expect([...counts.values()]).toEqual([1, 1, 1, 1, 1, 1, 1]);
	});

	it("skips finished work of both kinds", () => {
		const counts = countScheduleByDay(
			[task({ _id: "a", date: WED, status: "completed" })],
			[proj({ _id: "p", startDate: WED, status: "cancelled" })],
			week,
		);
		expect(counts.size).toBe(0);
	});

	it("is bounded to the days passed — the strip's scale is its own week", () => {
		// A task two weeks out must not set the bar scale for the visible week.
		const counts = countScheduleByDay(
			[task({ _id: "far", date: WED + 14 * DAY })],
			[],
			week,
		);
		expect(counts.size).toBe(0);
	});
});

describe("buildUpcomingAgenda", () => {
	const proj = (
		over: Partial<AgendaProject> & { _id: string },
	): AgendaProject => ({ title: over._id, status: "in-progress", ...over });
	const schedule = (over: Partial<ScopedSchedule>): ScopedSchedule => ({
		projects: [],
		tasks: [],
		...over,
	});

	it("groups by day, all-day work apart from timed, empty days omitted", () => {
		const days = buildUpcomingAgenda(
			schedule({
				tasks: [
					task({ _id: "late", date: WED, startTime: "15:00" }),
					task({ _id: "early", date: WED, startTime: "08:00" }),
					task({ _id: "zloose", date: WED }),
					task({ _id: "aloose", date: WED }),
					task({ _id: "far", date: WED + 3 * DAY, startTime: "10:00" }),
				],
				projects: [proj({ _id: "p", startDate: WED + DAY })],
			}),
			WED,
			5,
		);
		expect(days.map((d) => d.dayMs)).toEqual([WED, WED + DAY, WED + 3 * DAY]);
		expect(days[0].timed.map((t) => t._id)).toEqual(["early", "late"]);
		expect(days[0].anytime.map((t) => t._id)).toEqual(["aloose", "zloose"]);
		expect(days[1].projects.map((p) => p._id)).toEqual(["p"]);
	});

	it("includes a project that starts BEFORE the window and ends inside it", () => {
		const days = buildUpcomingAgenda(
			schedule({
				projects: [proj({ _id: "p", startDate: SUN, endDate: WED })],
			}),
			WED,
			3,
		);
		expect(days.map((d) => d.dayMs)).toEqual([WED]);
	});

	it("includes a project that runs past the end of the window", () => {
		const days = buildUpcomingAgenda(
			schedule({
				projects: [proj({ _id: "p", startDate: WED, endDate: WED + 90 * DAY })],
			}),
			WED,
			3,
		);
		expect(days).toHaveLength(3);
		expect(days.every((d) => d.projects.length === 1)).toBe(true);
	});

	it("puts a single-day project on exactly one day", () => {
		const days = buildUpcomingAgenda(
			schedule({ projects: [proj({ _id: "p", startDate: WED + DAY })] }),
			WED,
			5,
		);
		expect(days.map((d) => d.dayMs)).toEqual([WED + DAY]);
	});

	it("crosses week and month boundaries by whole UTC days", () => {
		// Anchor on a Saturday: the 14-day window rolls through two week starts
		// and a month boundary without drifting.
		const anchor = utc(2026, 7, 25); // Saturday
		const days = buildUpcomingAgenda(
			schedule({
				tasks: [
					task({ _id: "sun", date: utc(2026, 7, 26) }),
					task({ _id: "aug", date: utc(2026, 8, 1) }),
					task({ _id: "last", date: utc(2026, 8, 7) }),
					task({ _id: "past", date: utc(2026, 8, 8) }),
				],
			}),
			anchor,
			14,
		);
		expect(days.map((d) => d.dayMs)).toEqual([
			utc(2026, 7, 26),
			utc(2026, 8, 1),
			utc(2026, 8, 7),
		]);
	});

	it("is DST-immune — a spring-forward span steps whole UTC days", () => {
		// 2026-03-08 is the US spring-forward Sunday. Stepping DAY_MS on a
		// UTC-midnight date-id must land on 03-09, not 03-08T23:00.
		const anchor = utc(2026, 3, 7);
		const days = buildUpcomingAgenda(
			schedule({
				tasks: [
					task({ _id: "sat", date: utc(2026, 3, 7) }),
					task({ _id: "sun", date: utc(2026, 3, 8) }),
					task({ _id: "mon", date: utc(2026, 3, 9) }),
				],
			}),
			anchor,
			4,
		);
		expect(days.map((d) => d.dayMs)).toEqual([
			utc(2026, 3, 7),
			utc(2026, 3, 8),
			utc(2026, 3, 9),
		]);
	});

	it("is DST-immune across fall-back too", () => {
		// 2026-11-01 is the US fall-back Sunday (a 25-hour local day).
		const days = buildUpcomingAgenda(
			schedule({
				tasks: [
					task({ _id: "sun", date: utc(2026, 11, 1) }),
					task({ _id: "mon", date: utc(2026, 11, 2) }),
				],
			}),
			utc(2026, 10, 31),
			4,
		);
		expect(days.map((d) => d.dayMs)).toEqual([
			utc(2026, 11, 1),
			utc(2026, 11, 2),
		]);
	});

	it("buckets on the UTC day when handed an instant as the anchor", () => {
		// Callers may pass an afternoon instant; date-ids are UTC-midnight.
		const days = buildUpcomingAgenda(
			schedule({ tasks: [task({ _id: "a", date: WED })] }),
			WED + 18 * 3_600_000,
			2,
		);
		expect(days.map((d) => d.dayMs)).toEqual([WED]);
	});

	it("ignores work before the anchor and past the window", () => {
		const days = buildUpcomingAgenda(
			schedule({
				tasks: [
					task({ _id: "before", date: WED - DAY }),
					task({ _id: "after", date: WED + 5 * DAY }),
				],
			}),
			WED,
			3,
		);
		expect(days).toEqual([]);
	});

	it("carries the scope filter through from scopeCalendarEvents", () => {
		const scoped = scopeCalendarEvents(
			{
				tasks: [
					{
						id: "mine",
						type: "task",
						title: "mine",
						startDate: WED,
						status: "pending",
						clientName: "Acme",
						clientId: "c1",
						assigneeUserId: "u1",
					},
					{
						id: "theirs",
						type: "task",
						title: "theirs",
						startDate: WED,
						status: "pending",
						clientName: "Acme",
						clientId: "c1",
						assigneeUserId: "u2",
					},
				],
				projects: [],
			},
			"u1",
			"me",
		);
		const days = buildUpcomingAgenda(scoped, WED, 2);
		expect(days[0].anytime.map((t) => t._id)).toEqual(["mine"]);
	});
});

describe("dayLabel", () => {
	it("names today and tomorrow rather than dating them", () => {
		expect(dayLabel(WED, WED)).toBe("Today");
		expect(dayLabel(WED + DAY, WED)).toBe("Tomorrow");
	});

	it("dates every other day with its weekday", () => {
		expect(dayLabel(SAT, WED)).toBe("Saturday, Jul 25");
		expect(dayLabel(SUN, WED)).toBe("Sunday, Jul 19");
	});

	it("reads the UTC calendar, so an instant inside the day still matches", () => {
		expect(dayLabel(WED + 20 * 3_600_000, WED)).toBe("Today");
	});
});

describe("isWeekend", () => {
	it("is true only for Saturday and Sunday", () => {
		expect(isWeekend(SUN)).toBe(true);
		expect(isWeekend(SAT)).toBe(true);
		expect(isWeekend(WED)).toBe(false);
	});
});
