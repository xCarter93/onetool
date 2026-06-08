import { describe, expect, it } from "vitest";
import {
	buildMonthCells,
	isMultiDayProject,
	nextLocalDayStart,
	projectsOnDay,
	sameLocalDay,
	startOfLocalDay,
	tasksOnDay,
	weekRowSpans,
	type ProjectEvent,
	type TaskEvent,
} from "./dateUtils";

// Helpers to build fixture events at deterministic LOCAL day boundaries.
const localTs = (y: number, m: number, d: number) =>
	new Date(y, m, d, 9, 0, 0).getTime();

const makeProject = (
	id: string,
	startDate: number,
	endDate?: number
): ProjectEvent => ({
	id,
	type: "project",
	title: `Project ${id}`,
	description: undefined,
	startDate,
	endDate,
	status: "in-progress",
	clientId: "c1",
	clientName: "Acme",
	assignedUserIds: [],
	projectNumber: 1,
});

const makeTask = (id: string, startDate: number): TaskEvent => ({
	id,
	type: "task",
	title: `Task ${id}`,
	description: undefined,
	startDate,
	startTime: undefined,
	endTime: undefined,
	status: "pending",
	clientId: "c1",
	clientName: "Acme",
	assigneeUserId: "u1",
	projectId: undefined,
});

describe("buildMonthCells", () => {
	it("returns exactly 42 cells for June 2026", () => {
		const cells = buildMonthCells(2026, 5);
		expect(cells).toHaveLength(42);
	});

	it("cells[0] is the Sunday on/before June 1 2026 (May 31 — June 1 is a Monday)", () => {
		const cells = buildMonthCells(2026, 5);
		// May 31 2026 is a Sunday.
		expect(cells[0].getFullYear()).toBe(2026);
		expect(cells[0].getMonth()).toBe(4); // May
		expect(cells[0].getDate()).toBe(31);
		expect(cells[0].getDay()).toBe(0); // Sunday
	});

	it("cells[41] is the last visible Saturday of the grid", () => {
		const cells = buildMonthCells(2026, 5);
		expect(cells[41].getDay()).toBe(6); // Saturday
		// Sequential days, no gaps.
		for (let i = 1; i < cells.length; i++) {
			const prev = startOfLocalDay(cells[i - 1].getTime());
			const cur = startOfLocalDay(cells[i].getTime());
			expect(cur).toBe(nextLocalDayStart(prev));
		}
	});
});

describe("nextLocalDayStart (DST-safe)", () => {
	it("advances exactly one calendar day to local midnight, not +86400000, on US spring-forward", () => {
		// March 8 2026 is US spring-forward (23-hour day).
		const springForward = new Date(2026, 2, 8, 12, 0, 0).getTime();
		const next = nextLocalDayStart(springForward);
		const expected = new Date(2026, 2, 9, 0, 0, 0).getTime();
		expect(next).toBe(expected);
		// Must NOT equal start-of-day + 86400000 on a 23-hour day.
		expect(next).not.toBe(startOfLocalDay(springForward) + 86_400_000);
	});

	it("returns a local-midnight timestamp", () => {
		const next = nextLocalDayStart(localTs(2026, 5, 7));
		const d = new Date(next);
		expect(d.getHours()).toBe(0);
		expect(d.getMinutes()).toBe(0);
		expect(d.getSeconds()).toBe(0);
	});
});

describe("startOfLocalDay / sameLocalDay", () => {
	it("startOfLocalDay zeroes the time", () => {
		const d = new Date(startOfLocalDay(localTs(2026, 5, 7)));
		expect(d.getHours()).toBe(0);
		expect(d.getDate()).toBe(7);
	});

	it("sameLocalDay compares y/m/d", () => {
		expect(
			sameLocalDay(new Date(2026, 5, 7, 1), new Date(2026, 5, 7, 23))
		).toBe(true);
		expect(
			sameLocalDay(new Date(2026, 5, 7), new Date(2026, 5, 8))
		).toBe(false);
	});
});

describe("tasksOnDay", () => {
	it("returns the task on its day and nothing on the next day", () => {
		const task = makeTask("t1", localTs(2026, 5, 7));
		expect(tasksOnDay([task], new Date(2026, 5, 7))).toHaveLength(1);
		expect(tasksOnDay([task], new Date(2026, 5, 8))).toHaveLength(0);
	});
});

describe("projectsOnDay", () => {
	it("returns single-day project on its day", () => {
		const p = makeProject("p1", localTs(2026, 5, 7));
		expect(projectsOnDay([p], new Date(2026, 5, 7))).toHaveLength(1);
		expect(projectsOnDay([p], new Date(2026, 5, 8))).toHaveLength(0);
	});

	it("returns a multi-day project across its full span", () => {
		const p = makeProject("p1", localTs(2026, 5, 8), localTs(2026, 5, 11));
		expect(projectsOnDay([p], new Date(2026, 5, 8))).toHaveLength(1);
		expect(projectsOnDay([p], new Date(2026, 5, 10))).toHaveLength(1);
		expect(projectsOnDay([p], new Date(2026, 5, 11))).toHaveLength(1);
		expect(projectsOnDay([p], new Date(2026, 5, 12))).toHaveLength(0);
	});
});

describe("isMultiDayProject", () => {
	it("is false for a single-day project", () => {
		expect(isMultiDayProject(makeProject("p1", localTs(2026, 5, 7)))).toBe(
			false
		);
	});

	it("is false when endDate equals startDate's local day", () => {
		expect(
			isMultiDayProject(
				makeProject("p1", localTs(2026, 5, 7), new Date(2026, 5, 7, 18).getTime())
			)
		).toBe(false);
	});

	it("is true for a project spanning multiple local days", () => {
		expect(
			isMultiDayProject(
				makeProject("p1", localTs(2026, 5, 7), localTs(2026, 5, 9))
			)
		).toBe(true);
	});
});

describe("weekRowSpans", () => {
	const cells = buildMonthCells(2026, 5); // June 2026

	it("single-day project → one segment, startCol === endCol", () => {
		// June 7 2026 is a Sunday → column 0 of its row.
		const p = makeProject("p1", localTs(2026, 5, 7), localTs(2026, 5, 7));
		const spans = weekRowSpans([p], cells);
		expect(spans).toHaveLength(1);
		expect(spans[0].startCol).toBe(spans[0].endCol);
		expect(spans[0].project.id).toBe("p1");
	});

	it("within-week multi-day project (Mon June 8 → Thu June 11) → one segment, startCol < endCol, no wrap", () => {
		const p = makeProject("p1", localTs(2026, 5, 8), localTs(2026, 5, 11));
		const spans = weekRowSpans([p], cells);
		expect(spans).toHaveLength(1);
		expect(spans[0].startCol).toBeLessThan(spans[0].endCol);
		// June 8 is Monday (col 1), June 11 is Thursday (col 4).
		expect(spans[0].startCol).toBe(1);
		expect(spans[0].endCol).toBe(4);
	});

	it("Sat→Sun wrap project (Sat June 13 → Tue June 16) → two segments continuous across the wrap", () => {
		const p = makeProject("p1", localTs(2026, 5, 13), localTs(2026, 5, 16));
		const spans = weekRowSpans([p], cells).sort((a, b) => a.row - b.row);
		expect(spans).toHaveLength(2);
		// Segment 1: ends at col 6 (Saturday) in week-row N.
		expect(spans[0].endCol).toBe(6);
		expect(spans[0].startCol).toBe(6); // June 13 is Saturday (col 6)
		// Segment 2: starts at col 0 (Sunday) in the next week-row.
		expect(spans[1].row).toBe(spans[0].row + 1);
		expect(spans[1].startCol).toBe(0);
		// June 16 is Tuesday (col 2).
		expect(spans[1].endCol).toBe(2);
	});

	it("clamps a project extending beyond the visible grid to grid bounds", () => {
		// Project from far before to far after the visible month.
		const p = makeProject(
			"p1",
			localTs(2026, 4, 1),
			localTs(2026, 6, 1)
		);
		const spans = weekRowSpans([p], cells);
		// One segment per week-row that the project covers (all 6 rows here).
		expect(spans).toHaveLength(6);
		expect(spans.every((s) => s.startCol >= 0 && s.endCol <= 6)).toBe(true);
	});
});
