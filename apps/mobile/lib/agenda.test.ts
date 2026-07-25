import { describe, expect, it } from "vitest";
import {
	buildAgenda,
	countTasksByDay,
	minutesFromHHMM,
	tomorrowPeek,
	weekDaysFor,
	workloadDots,
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

describe("buildAgenda", () => {
	const tasks: AgendaTask[] = [
		task({ _id: "wash", date: WED, startTime: "08:00" }),
		task({ _id: "gutter", date: WED, startTime: "09:30" }),
		task({ _id: "deep", date: WED, startTime: "13:00" }),
		task({ _id: "walk", date: WED, startTime: "15:30" }),
		task({ _id: "restock", date: WED, startTime: "17:00" }),
		task({ _id: "untimed", date: WED }),
		task({ _id: "old", date: WED - 2 * DAY }),
		task({ _id: "olddone", date: WED - 3 * DAY, status: "completed" }),
		task({ _id: "nextweek", date: WED + 5 * DAY, startTime: "10:00" }),
	];

	it("buckets by start time and puts overdue spillover last", () => {
		const groups = buildAgenda(tasks, WED, WED);
		expect(groups.map((g) => g.key)).toEqual([
			"morning",
			"afternoon",
			"evening",
			"anytime",
			"overdue",
		]);
		expect(groups[0].tasks.map((t) => t._id)).toEqual(["wash", "gutter"]);
		expect(groups[1].tasks.map((t) => t._id)).toEqual(["deep", "walk"]);
		expect(groups[2].tasks.map((t) => t._id)).toEqual(["restock"]);
		expect(groups[3].tasks.map((t) => t._id)).toEqual(["untimed"]);
	});

	it("treats 12:00 as afternoon and 17:00 as evening (boundaries)", () => {
		const groups = buildAgenda(
			[
				task({ _id: "noon", date: WED, startTime: "12:00" }),
				task({ _id: "five", date: WED, startTime: "17:00" }),
				task({ _id: "eleven", date: WED, startTime: "11:59" }),
			],
			WED,
			WED,
		);
		expect(groups.find((g) => g.key === "morning")?.tasks[0]._id).toBe("eleven");
		expect(groups.find((g) => g.key === "afternoon")?.tasks[0]._id).toBe("noon");
		expect(groups.find((g) => g.key === "evening")?.tasks[0]._id).toBe("five");
	});

	it("excludes completed/cancelled work from overdue", () => {
		const overdue = buildAgenda(tasks, WED, WED).find(
			(g) => g.key === "overdue",
		);
		expect(overdue?.tasks.map((t) => t._id)).toEqual(["old"]);
	});

	it("omits empty groups entirely", () => {
		const groups = buildAgenda(
			[task({ _id: "only", date: WED, startTime: "09:00" })],
			WED,
			WED,
		);
		expect(groups.map((g) => g.key)).toEqual(["morning"]);
	});

	it("hides overdue when browsing a PAST day", () => {
		const past = WED - DAY;
		const groups = buildAgenda(tasks, past, WED);
		expect(groups.some((g) => g.key === "overdue")).toBe(false);
	});

	it("anchors overdue to today, not to the browsed future day", () => {
		// Browsing Friday should still show work overdue as of today (Wednesday),
		// and must not call Wednesday's own tasks overdue.
		const groups = buildAgenda(tasks, WED + 2 * DAY, WED);
		const overdue = groups.find((g) => g.key === "overdue");
		expect(overdue?.tasks.map((t) => t._id)).toEqual(["old"]);
	});

	it("is unaffected by the time-of-day component of the arguments", () => {
		const noon = WED + 12 * 3_600_000;
		expect(buildAgenda(tasks, noon, noon)).toEqual(
			buildAgenda(tasks, WED, WED),
		);
	});

	it("ignores tasks with no date", () => {
		const groups = buildAgenda([task({ _id: "floating" })], WED, WED);
		expect(groups).toEqual([]);
	});
});

describe("workloadDots", () => {
	it("maps counts onto at most three dots", () => {
		expect(workloadDots(0)).toBe(0);
		expect(workloadDots(1)).toBe(1);
		expect(workloadDots(2)).toBe(1);
		expect(workloadDots(3)).toBe(2);
		expect(workloadDots(4)).toBe(2);
		expect(workloadDots(5)).toBe(3);
		expect(workloadDots(50)).toBe(3);
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
