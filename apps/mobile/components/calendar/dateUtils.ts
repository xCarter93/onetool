// Pure local-day grid + bucketing + week-row span geometry for MonthGrid.
// No React/RN imports — unit-testable under a plain node Vitest environment.
// Convention: LOCAL-day math throughout (matches index.tsx). No UTC, no
// fixed-millisecond day windows (those skip/duplicate the hour on DST days).

// Event shapes mirror calendar.getCalendarEvents (calendar.ts:73-109).
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
	assignedUserIds: string[];
	projectNumber: number;
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

// Local midnight of the day containing ts.
export function startOfLocalDay(ts: number): number {
	const d = new Date(ts);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

// DST-safe next local midnight — one CALENDAR day later via the Date ctor,
// never a fixed-millisecond add (that drifts on 23/25-hour DST transition days).
export function nextLocalDayStart(ts: number): number {
	const d = new Date(ts);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

export function sameLocalDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

// Tasks whose start falls within [startOfDay, nextLocalDayStart) — DST-safe.
export function tasksOnDay(tasks: TaskEvent[], day: Date): TaskEvent[] {
	const ts = startOfLocalDay(day.getTime());
	const next = nextLocalDayStart(ts);
	return tasks.filter((t) => t.startDate >= ts && t.startDate < next);
}

// Projects active on the day (overlap filter, reuses index.tsx logic).
export function projectsOnDay(projects: ProjectEvent[], day: Date): ProjectEvent[] {
	const ts = startOfLocalDay(day.getTime());
	return projects.filter((p) => {
		const end = p.endDate ?? p.startDate;
		return startOfLocalDay(p.startDate) <= ts && startOfLocalDay(end) >= ts;
	});
}

// Multi-day = end local-day strictly after start local-day. Single-day projects
// draw a per-day green dot; multi-day projects rely only on the span bar.
export function isMultiDayProject(p: ProjectEvent): boolean {
	return (
		p.endDate != null && startOfLocalDay(p.endDate) > startOfLocalDay(p.startDate)
	);
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
	const cellDays = cells.map((c) => startOfLocalDay(c.getTime()));

	for (const project of projects) {
		const pStart = startOfLocalDay(project.startDate);
		const pEnd = startOfLocalDay(project.endDate ?? project.startDate);

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
