import { describe, expect, it } from "vitest";
import {
	buildMonthCells,
	cellDayKey,
	DAY_MS,
	eventDayKey,
	isMultiDayProject,
	projectsOnDay,
	sameLocalDay,
	tasksOnDay,
	weekRowSpans,
	type ProjectEvent,
	type TaskEvent,
} from "./dateUtils";

// Real events store dates as UTC-midnight (Date.UTC — see lib/date.ts).
const utcTs = (y: number, m: number, d: number) => Date.UTC(y, m, d);
// Day key for a calendar date, as MonthGrid derives it from a local-midnight cell.
const dayKey = (y: number, m: number, d: number) =>
	cellDayKey(new Date(y, m, d));

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
		expect(cells[0].getFullYear()).toBe(2026);
		expect(cells[0].getMonth()).toBe(4); // May
		expect(cells[0].getDate()).toBe(31);
		expect(cells[0].getDay()).toBe(0); // Sunday
	});

	it("cells[41] is the last visible Saturday, with sequential calendar days", () => {
		const cells = buildMonthCells(2026, 5);
		expect(cells[41].getDay()).toBe(6); // Saturday
		// Consecutive calendar dates differ by exactly one UTC day (DST-immune).
		for (let i = 1; i < cells.length; i++) {
			expect(cellDayKey(cells[i])).toBe(cellDayKey(cells[i - 1]) + DAY_MS);
		}
	});
});

describe("cellDayKey / eventDayKey", () => {
	it("maps a UTC-stored date onto the matching calendar-date cell (the timezone-drift bug)", () => {
		// A task created for June 8 is stored at Date.UTC(2026,5,8). It MUST key to
		// the June 8 cell regardless of host timezone — local bucketing drifted it
		// onto June 7 for any host behind UTC.
		expect(eventDayKey(utcTs(2026, 5, 8))).toBe(dayKey(2026, 5, 8));
		expect(eventDayKey(utcTs(2026, 5, 8))).not.toBe(dayKey(2026, 5, 7));
	});

	it("eventDayKey strips any time-of-day to UTC midnight", () => {
		const noon = Date.UTC(2026, 5, 8, 12, 30, 0);
		expect(eventDayKey(noon)).toBe(dayKey(2026, 5, 8));
	});
});

describe("sameLocalDay", () => {
	it("compares local y/m/d", () => {
		expect(sameLocalDay(new Date(2026, 5, 7, 1), new Date(2026, 5, 7, 23))).toBe(
			true
		);
		expect(sameLocalDay(new Date(2026, 5, 7), new Date(2026, 5, 8))).toBe(false);
	});
});

describe("tasksOnDay", () => {
	it("returns the task on its day and nothing on the next day", () => {
		const task = makeTask("t1", utcTs(2026, 5, 7));
		expect(tasksOnDay([task], dayKey(2026, 5, 7))).toHaveLength(1);
		expect(tasksOnDay([task], dayKey(2026, 5, 8))).toHaveLength(0);
	});
});

describe("projectsOnDay", () => {
	it("returns single-day project on its day", () => {
		const p = makeProject("p1", utcTs(2026, 5, 7));
		expect(projectsOnDay([p], dayKey(2026, 5, 7))).toHaveLength(1);
		expect(projectsOnDay([p], dayKey(2026, 5, 8))).toHaveLength(0);
	});

	it("returns a multi-day project across its full span", () => {
		const p = makeProject("p1", utcTs(2026, 5, 8), utcTs(2026, 5, 11));
		expect(projectsOnDay([p], dayKey(2026, 5, 8))).toHaveLength(1);
		expect(projectsOnDay([p], dayKey(2026, 5, 10))).toHaveLength(1);
		expect(projectsOnDay([p], dayKey(2026, 5, 11))).toHaveLength(1);
		expect(projectsOnDay([p], dayKey(2026, 5, 12))).toHaveLength(0);
	});
});

describe("isMultiDayProject", () => {
	it("is false for a single-day project", () => {
		expect(isMultiDayProject(makeProject("p1", utcTs(2026, 5, 7)))).toBe(false);
	});

	it("is false when endDate is the same UTC day as startDate", () => {
		expect(
			isMultiDayProject(
				makeProject("p1", utcTs(2026, 5, 7), Date.UTC(2026, 5, 7, 18))
			)
		).toBe(false);
	});

	it("is true for a project spanning multiple UTC days", () => {
		expect(
			isMultiDayProject(makeProject("p1", utcTs(2026, 5, 7), utcTs(2026, 5, 9)))
		).toBe(true);
	});
});

describe("weekRowSpans", () => {
	const cells = buildMonthCells(2026, 5); // June 2026

	it("single-day project → one segment, startCol === endCol", () => {
		// June 7 2026 is a Sunday → column 0 of its row.
		const p = makeProject("p1", utcTs(2026, 5, 7), utcTs(2026, 5, 7));
		const spans = weekRowSpans([p], cells);
		expect(spans).toHaveLength(1);
		expect(spans[0].startCol).toBe(spans[0].endCol);
		expect(spans[0].project.id).toBe("p1");
	});

	it("within-week multi-day project (Mon June 8 → Thu June 11) → one segment, startCol < endCol, no wrap", () => {
		const p = makeProject("p1", utcTs(2026, 5, 8), utcTs(2026, 5, 11));
		const spans = weekRowSpans([p], cells);
		expect(spans).toHaveLength(1);
		expect(spans[0].startCol).toBeLessThan(spans[0].endCol);
		// June 8 is Monday (col 1), June 11 is Thursday (col 4).
		expect(spans[0].startCol).toBe(1);
		expect(spans[0].endCol).toBe(4);
	});

	it("Sat→Sun wrap project (Sat June 13 → Tue June 16) → two segments continuous across the wrap", () => {
		const p = makeProject("p1", utcTs(2026, 5, 13), utcTs(2026, 5, 16));
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

	it("clamps a project covering the whole visible grid to grid bounds (all 6 rows, full width)", () => {
		// June 2026 grid is May 31 → July 11. Cover it end-to-end.
		const p = makeProject("p1", utcTs(2026, 4, 31), utcTs(2026, 6, 11));
		const spans = weekRowSpans([p], cells).sort((a, b) => a.row - b.row);
		// One full-width segment per week-row (all 6 rows).
		expect(spans).toHaveLength(6);
		expect(spans.every((s) => s.startCol === 0 && s.endCol === 6)).toBe(true);
	});

	it("emits no segment for a week-row the project does not intersect", () => {
		// Ends July 1 (row 4) — last row (July 5-11) is untouched.
		const p = makeProject("p1", utcTs(2026, 4, 31), utcTs(2026, 6, 1));
		const spans = weekRowSpans([p], cells);
		expect(spans).toHaveLength(5);
		expect(spans.some((s) => s.row === 5)).toBe(false);
	});
});
