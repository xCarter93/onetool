// Day-timeline geometry for the Today tab's Timeline view mode. Pure functions
// only (no RN, no Convex) — the component itself is untestable in the node
// vitest environment, so every non-trivial layout decision lives here.
//
// `startTime`/`endTime` are "HH:MM" wall-clock strings parsed by
// `minutesFromHHMM` (lib/agenda.ts). A task whose start does not parse is
// UNTIMED and comes back in its own list — never silently dropped.

import { minutesFromHHMM, type AgendaTask } from "@/lib/agenda";

/** Pixels per hour. 72 ⇒ a 30-minute job is 36px, tall enough for a checkbox. */
export const HOUR_HEIGHT = 72;

/** A start with no usable end (missing, or at/before the start) gets one hour. */
export const DEFAULT_DURATION_MINUTES = 60;

/**
 * Floor on a block's rendered duration (24px at HOUR_HEIGHT 72) — enough for one
 * line of title, so no block can be too short to name itself. Collision
 * detection uses the SAME floored interval, so two 5-minute jobs 10 minutes
 * apart still split into columns instead of painting over each other.
 */
export const MIN_BLOCK_MINUTES = 20;

/** Default visible window — the field-service working day. */
export const DEFAULT_START_HOUR = 7;
export const DEFAULT_END_HOUR = 19;

/** Absolute clamps on the window. */
export const MIN_HOUR = 0;
export const MAX_HOUR = 24;

/** Project touch minimum, mirrored here so this module stays RN-free. */
export const TOUCH_MIN = 44;

/** Below this painted height a block has no room for a complete-checkbox. */
export const CHECKBOX_MIN_HEIGHT = 34;

/** Below this painted height a block shows its title only (no context line). */
export const BLOCK_META_MIN_HEIGHT = 52;

/** Headroom left above the scroll anchor so the anchor isn't flush to the top. */
export const SCROLL_LEAD_PX = 80;

export type VisibleRange = { startHour: number; endHour: number };

export type TimelineBlock = {
	task: AgendaTask;
	/** Minutes since midnight. `endMinutes` is the defaulted + floored end. */
	startMinutes: number;
	endMinutes: number;
	/** px from the grid origin (`range.startHour`). */
	top: number;
	height: number;
	columnIndex: number;
	columnCount: number;
	/** Extra tap area, granted only into space no other block can claim. */
	hitSlopTop: number;
	hitSlopBottom: number;
};

export type DayLayout = {
	range: VisibleRange;
	/** Scroll content height; covers a block that overruns the last hour rule. */
	gridHeight: number;
	blocks: TimelineBlock[];
	untimed: AgendaTask[];
};

/** Minutes → px at the grid's fixed scale. */
export function minutesToPx(minutes: number): number {
	return (minutes * HOUR_HEIGHT) / 60;
}

/** "7 AM" / "12 PM" / "11 PM". Hour 24 reads as "12 AM". */
export function hourLabel(hour: number): string {
	const h = ((Math.trunc(hour) % 24) + 24) % 24;
	return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
}

/** "9:00 AM" from minutes since midnight. */
export function clockLabel(minutes: number): string {
	const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
	const h = Math.floor(m / 60);
	const display = h % 12 === 0 ? 12 : h % 12;
	return `${display}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

type Interval = { task: AgendaTask; startMinutes: number; endMinutes: number };

/** null ⇒ untimed. An end that is not strictly after the start is discarded. */
function intervalFor(task: AgendaTask): Interval | null {
	const start = minutesFromHHMM(task.startTime);
	if (start === null) return null;
	const parsedEnd = minutesFromHHMM(task.endTime);
	const end =
		parsedEnd !== null && parsedEnd > start
			? parsedEnd
			: start + DEFAULT_DURATION_MINUTES;
	return {
		task,
		startMinutes: start,
		endMinutes: Math.max(end, start + MIN_BLOCK_MINUTES),
	};
}

// Earliest first; on a tie the LONGER job leads so a container takes column 0
// and the job nested inside it lands to its right. Title then _id make the
// order total, so the same input always produces the same columns.
function compareIntervals(a: Interval, b: Interval): number {
	return (
		a.startMinutes - b.startMinutes ||
		b.endMinutes - a.endMinutes ||
		a.task.title.localeCompare(b.task.title) ||
		a.task._id.localeCompare(b.task._id)
	);
}

/**
 * The hour window the grid paints.
 *
 * Rule: start from the fixed 07:00–19:00 working day, then EXPAND (never
 * shrink) to whole hours so every block fits, clamped to 00:00–24:00. The fixed
 * floor is what makes an empty day still read as a day, and stops the grid from
 * resizing under your thumb while flicking through the week.
 *
 * `nowMinutes` extends the same expand-only rule to the current time so the
 * now-line always has grid to sit on (a clear 21:30 evening still shows where
 * you are). Pass it ONLY for today — stretching Thursday's grid to 22:00 for a
 * line that is never drawn would be pure noise.
 */
export function visibleRange(
	tasks: AgendaTask[],
	nowMinutes?: number,
): VisibleRange {
	let startHour = DEFAULT_START_HOUR;
	let endHour = DEFAULT_END_HOUR;
	for (const task of tasks) {
		const iv = intervalFor(task);
		if (iv === null) continue;
		startHour = Math.min(startHour, Math.floor(iv.startMinutes / 60));
		endHour = Math.max(endHour, Math.ceil(iv.endMinutes / 60));
	}
	if (
		nowMinutes !== undefined &&
		Number.isFinite(nowMinutes) &&
		nowMinutes >= 0 &&
		nowMinutes < 24 * 60
	) {
		const nowHour = Math.floor(nowMinutes / 60);
		startHour = Math.min(startHour, nowHour);
		// +1 so the line never lands flush on the closing rule.
		endHour = Math.max(endHour, nowHour + 1);
	}
	return {
		startHour: Math.max(MIN_HOUR, startHour),
		endHour: Math.min(MAX_HOUR, endHour),
	};
}

// Greedy column packing inside one overlap cluster: reuse the leftmost column
// whose last job has already finished, else open a new one. Every member of the
// cluster reports the cluster's total column count so the widths line up.
function positionCluster(
	cluster: Interval[],
	originMinutes: number,
): TimelineBlock[] {
	const columnEnds: number[] = [];
	const placed = cluster.map((iv) => {
		let columnIndex = columnEnds.findIndex((end) => end <= iv.startMinutes);
		if (columnIndex === -1) columnIndex = columnEnds.length;
		columnEnds[columnIndex] = iv.endMinutes;
		return { iv, columnIndex };
	});
	const columnCount = columnEnds.length;
	return placed.map(({ iv, columnIndex }) => ({
		task: iv.task,
		startMinutes: iv.startMinutes,
		endMinutes: iv.endMinutes,
		top: minutesToPx(iv.startMinutes - originMinutes),
		height: minutesToPx(iv.endMinutes - iv.startMinutes),
		columnIndex,
		columnCount,
		hitSlopTop: 0,
		hitSlopBottom: 0,
	}));
}

// A 24px block cannot be a 44pt target on its own, so grow its tap area into
// adjacent empty grid — but only ever HALF of a gap, measured against the
// nearest block in ANY column. Two neighbours reaching toward each other
// therefore can never produce overlapping (ambiguous) tap areas, and a block
// wedged between two adjoining blocks correctly gets nothing.
function applyHitSlop(blocks: TimelineBlock[], gridHeight: number): void {
	for (const block of blocks) {
		const need = TOUCH_MIN - block.height;
		if (need <= 0) continue;
		const bottom = block.top + block.height;
		let freeAbove = block.top;
		let freeBelow = Math.max(0, gridHeight - bottom);
		for (const other of blocks) {
			if (other === block) continue;
			const otherBottom = other.top + other.height;
			if (otherBottom <= block.top) {
				freeAbove = Math.min(freeAbove, (block.top - otherBottom) / 2);
			}
			if (other.top >= bottom) {
				freeBelow = Math.min(freeBelow, (other.top - bottom) / 2);
			}
		}
		freeAbove = Math.max(0, freeAbove);
		freeBelow = Math.max(0, freeBelow);
		let slopTop = Math.min(freeAbove, Math.floor(need / 2));
		const slopBottom = Math.min(freeBelow, need - slopTop);
		slopTop = Math.min(freeAbove, need - slopBottom);
		block.hitSlopTop = Math.floor(slopTop);
		block.hitSlopBottom = Math.floor(slopBottom);
	}
}

/**
 * Position one day's tasks on the hour grid.
 *
 * Timed tasks become absolutely-positioned blocks (`top`/`height` proportional
 * to their interval, `columnIndex`/`columnCount` splitting the width across
 * overlaps). Untimed tasks come back untouched in `untimed`.
 *
 * `nowMinutes` only widens the window (see `visibleRange`) — pass it for today
 * so the now-line always has grid under it, omit it otherwise.
 */
export function layoutDay(
	tasks: AgendaTask[],
	nowMinutes?: number,
): DayLayout {
	const range = visibleRange(tasks, nowMinutes);
	const originMinutes = range.startHour * 60;

	const untimed: AgendaTask[] = [];
	const intervals: Interval[] = [];
	for (const task of tasks) {
		const iv = intervalFor(task);
		if (iv === null) untimed.push(task);
		else intervals.push(iv);
	}
	intervals.sort(compareIntervals);

	// Cut the sorted run into overlap clusters. `>=` is deliberate: a job that
	// starts exactly when the previous one ends merely touches it, so it opens a
	// new cluster and both stay full width.
	const blocks: TimelineBlock[] = [];
	let cluster: Interval[] = [];
	let clusterEnd = Number.NEGATIVE_INFINITY;
	for (const iv of intervals) {
		if (iv.startMinutes >= clusterEnd && cluster.length > 0) {
			blocks.push(...positionCluster(cluster, originMinutes));
			cluster = [];
		}
		cluster.push(iv);
		clusterEnd = Math.max(clusterEnd, iv.endMinutes);
	}
	if (cluster.length > 0) {
		blocks.push(...positionCluster(cluster, originMinutes));
	}

	let gridHeight = (range.endHour - range.startHour) * HOUR_HEIGHT;
	for (const block of blocks) {
		gridHeight = Math.max(gridHeight, block.top + block.height);
	}

	applyHitSlop(blocks, gridHeight);
	return { range, gridHeight, blocks, untimed };
}

/**
 * px offset of the now-line from the grid origin, or null when the current time
 * falls outside the painted window. Callers pass this only for today.
 */
export function nowLineOffset(
	nowMinutes: number,
	range: VisibleRange,
): number | null {
	if (!Number.isFinite(nowMinutes)) return null;
	const start = range.startHour * 60;
	const end = range.endHour * 60;
	if (nowMinutes < start || nowMinutes > end) return null;
	return minutesToPx(nowMinutes - start);
}

/**
 * Mount scroll offset: anchor on the now-line when there is one (today),
 * otherwise on the first block, minus a little headroom.
 */
export function initialScrollOffset(
	layout: DayLayout,
	nowOffset: number | null,
): number {
	let anchor = nowOffset;
	if (anchor === null) {
		for (const block of layout.blocks) {
			if (anchor === null || block.top < anchor) anchor = block.top;
		}
	}
	if (anchor === null || !Number.isFinite(anchor)) return 0;
	return Math.max(0, anchor - SCROLL_LEAD_PX);
}
