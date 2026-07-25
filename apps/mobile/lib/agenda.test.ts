import { describe, expect, it } from "vitest";
import {
	buildDayPlan,
	countTasksByDay,
	formatClockLabel,
	minutesFromHHMM,
	projectInScope,
	projectsForDay,
	taskInScope,
	tomorrowPeek,
	weekDaysFor,
	workloadBar,
	type AgendaProject,
	type AgendaTask,
} from "./agenda";

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
		expect(plan.nextUpId).toBeNull();
	});

	it("marks the first OPEN upcoming task as next up, skipping done rows", () => {
		expect(buildDayPlan(tasks, WED, WED, NOON).nextUpId).toBe("deep");
		const withDone = [
			task({ _id: "did", date: WED, startTime: "13:00", status: "completed" }),
			task({ _id: "next", date: WED, startTime: "15:00" }),
		];
		expect(buildDayPlan(withDone, WED, WED, NOON).nextUpId).toBe("next");
	});

	it("has no now separator or next-up when browsing another day", () => {
		const plan = buildDayPlan(tasks, WED + 2 * DAY, WED, NOON);
		expect(plan.nowIndex).toBe(-1);
		expect(plan.nextUpId).toBeNull();
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
