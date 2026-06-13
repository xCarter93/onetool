// Pure month-grid geometry + UTC-day bucketing for MonthGrid.
// No React/RN imports — unit-testable under a plain node Vitest environment.
//
// Convention: a "day" is keyed by the UTC-midnight ms of its CALENDAR date, the
// same space task.date / project.startDate are stored in (Date.UTC — see
// lib/date.ts and the web calendar). Grid cells are LOCAL-midnight Dates; we read
// their visual Y/M/D and re-key through Date.UTC so a cell and a stored event sit
// in one comparable space. This is what makes a UTC-stored "June 8" task land on
// the June 8 cell in every timezone — local-day bucketing put it on June 7 for
// any host behind UTC. No time-of-day enters a key, so it is DST-immune.

export const DAY_MS = 86_400_000;

// Event shapes mirror calendar.getCalendarEvents (calendar.ts:73-109).
// Loosely mirror calendar.getCalendarEvents — the unused-here metadata fields
// (assignedUserIds/projectNumber/etc.) stay optional/string so the typed Convex
// return assigns cleanly. Only id/title/dates/status/clientName drive layout.
export type ProjectEvent = {
	id: string;
	type: "project";
	title: string;
	description?: string;
	startDate: number;
	endDate?: number;
	status: string;
	clientId: string;
	clientName: string;
	assignedUserIds?: string[];
	projectNumber?: string | number;
};

export type TaskEvent = {
	id: string;
	type: "task";
	title: string;
	description?: string;
	startDate: number;
	startTime?: string;
	endTime?: string;
	status: string;
	clientId?: string;
	clientName: string;
	assigneeUserId?: string;
	projectId?: string;
};

export type SpanSegment = {
	row: number;
	startCol: number;
	endCol: number;
	project: ProjectEvent;
};

// 42-cell month grid (6 rows x 7 cols). cells[0] = the Sunday on/before the 1st.
export function buildMonthCells(year: number, month: number): Date[] {
	const first = new Date(year, month, 1);
	const gridStart = new Date(year, month, 1 - first.getDay());
	return Array.from({ length: 42 }, (_, i) => {
		const d = new Date(gridStart);
		d.setDate(gridStart.getDate() + i);
		return d;
	});
}

// UTC-midnight key for a grid cell's VISUAL calendar date (cell is local-midnight).
export function cellDayKey(cell: Date): number {
	return Date.UTC(cell.getFullYear(), cell.getMonth(), cell.getDate());
}

// UTC-midnight key for a stored event timestamp (already Date.UTC-based).
export function eventDayKey(ts: number): number {
	const d = new Date(ts);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Local-day equality — used only for the "today" pill (local now vs visual cell).
export function sameLocalDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

// Tasks whose stored date matches dayKey (UTC-midnight of the cell's calendar date).
export function tasksOnDay(tasks: TaskEvent[], dayKey: number): TaskEvent[] {
	return tasks.filter((t) => eventDayKey(t.startDate) === dayKey);
}

// Projects active on dayKey (inclusive UTC-day overlap).
export function projectsOnDay(
	projects: ProjectEvent[],
	dayKey: number
): ProjectEvent[] {
	return projects.filter((p) => {
		const start = eventDayKey(p.startDate);
		const end = eventDayKey(p.endDate ?? p.startDate);
		return start <= dayKey && end >= dayKey;
	});
}

// Multi-day = end UTC-day strictly after start UTC-day. Single-day projects draw a
// per-day green dot; multi-day projects rely only on the span bar.
export function isMultiDayProject(p: ProjectEvent): boolean {
	return p.endDate != null && eventDayKey(p.endDate) > eventDayKey(p.startDate);
}

// One continuous span segment per (project x intersecting week-row), clamped to
// columns 0..6. A project crossing a Sat->Sun boundary yields a segment ending
// at col 6 in row N and a segment starting at col 0 in row N+1 — so the bar
// reads continuous across the week-row wrap.
export function weekRowSpans(
	projects: ProjectEvent[],
	cells: Date[]
): SpanSegment[] {
	const segments: SpanSegment[] = [];
	const cellDays = cells.map(cellDayKey);

	for (const project of projects) {
		const pStart = eventDayKey(project.startDate);
		const pEnd = eventDayKey(project.endDate ?? project.startDate);

		for (let row = 0; row < 6; row++) {
			let startCol = -1;
			let endCol = -1;
			for (let col = 0; col < 7; col++) {
				const cellTs = cellDays[row * 7 + col];
				if (cellTs >= pStart && cellTs <= pEnd) {
					if (startCol === -1) startCol = col;
					endCol = col;
				}
			}
			if (startCol !== -1) {
				segments.push({ row, startCol, endCol, project });
			}
		}
	}

	return segments;
}
