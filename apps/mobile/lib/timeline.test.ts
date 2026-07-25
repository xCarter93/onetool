import { describe, expect, it } from "vitest";
import type { AgendaTask } from "./agenda";
import {
	BLOCK_META_MIN_HEIGHT,
	CHECKBOX_MIN_HEIGHT,
	DEFAULT_DURATION_MINUTES,
	DEFAULT_END_HOUR,
	DEFAULT_START_HOUR,
	HOUR_HEIGHT,
	MAX_HOUR,
	MIN_BLOCK_MINUTES,
	SCROLL_LEAD_PX,
	TOUCH_MIN,
	clockLabel,
	hourLabel,
	initialScrollOffset,
	layoutDay,
	minutesToPx,
	nowLineOffset,
	visibleRange,
	type TimelineBlock,
} from "./timeline";

const task = (
	_id: string,
	startTime?: string,
	endTime?: string,
	over: Partial<AgendaTask> = {},
): AgendaTask => ({ _id, title: _id, startTime, endTime, ...over });

const byId = (blocks: TimelineBlock[]) => {
	const map = new Map<string, TimelineBlock>();
	for (const b of blocks) map.set(b.task._id, b);
	return map;
};

const ids = (blocks: TimelineBlock[]) => blocks.map((b) => b.task._id);

describe("constants", () => {
	it("keep the block thresholds ordered and the grid legible", () => {
		expect(minutesToPx(60)).toBe(HOUR_HEIGHT);
		expect(minutesToPx(MIN_BLOCK_MINUTES)).toBeGreaterThan(0);
		// A floored block must fit one line of title; the context line needs strictly
		// more room again.
		expect(minutesToPx(MIN_BLOCK_MINUTES)).toBeGreaterThanOrEqual(20);
		expect(BLOCK_META_MIN_HEIGHT).toBeGreaterThan(CHECKBOX_MIN_HEIGHT);
		// The reason HOUR_HEIGHT is 88: a HALF-HOUR visit — the common case in field
		// service — must be tall enough to carry its own completion checkbox. Drop
		// the density and this fails rather than silently removing the control.
		expect(minutesToPx(30)).toBeGreaterThanOrEqual(CHECKBOX_MIN_HEIGHT);
		// RN clips hit-testing at the parent's bounds, so a block may only offer a
		// checkbox when it is itself tall enough to contain a 44pt target.
		expect(CHECKBOX_MIN_HEIGHT).toBeGreaterThanOrEqual(TOUCH_MIN);
		expect(DEFAULT_END_HOUR).toBeGreaterThan(DEFAULT_START_HOUR);
	});
});

describe("hourLabel / clockLabel", () => {
	it("renders 12-hour wall clock without a locale dependency", () => {
		expect(hourLabel(0)).toBe("12 AM");
		expect(hourLabel(7)).toBe("7 AM");
		expect(hourLabel(12)).toBe("12 PM");
		expect(hourLabel(23)).toBe("11 PM");
		expect(hourLabel(24)).toBe("12 AM");
		expect(clockLabel(0)).toBe("12:00 AM");
		expect(clockLabel(9 * 60 + 5)).toBe("9:05 AM");
		expect(clockLabel(12 * 60)).toBe("12:00 PM");
		expect(clockLabel(13 * 60 + 30)).toBe("1:30 PM");
		expect(clockLabel(23 * 60 + 59)).toBe("11:59 PM");
		// An overrun end (23:50 + default hour) wraps rather than reading "24:50".
		expect(clockLabel(1490)).toBe("12:50 AM");
	});
});

describe("visibleRange", () => {
	it("uses the working-day floor for an empty day", () => {
		expect(visibleRange([])).toEqual({
			startHour: DEFAULT_START_HOUR,
			endHour: DEFAULT_END_HOUR,
		});
	});

	it("does not shrink to fit content inside the default window", () => {
		expect(visibleRange([task("mid", "13:00", "14:00")])).toEqual({
			startHour: DEFAULT_START_HOUR,
			endHour: DEFAULT_END_HOUR,
		});
	});

	it("expands downward for an early start", () => {
		expect(visibleRange([task("dawn", "05:30", "06:15")]).startHour).toBe(5);
	});

	it("expands upward for a late end", () => {
		expect(visibleRange([task("night", "20:00", "21:30")]).endHour).toBe(22);
	});

	it("expands both ends at once and clamps to the day", () => {
		const range = visibleRange([
			task("dawn", "00:10", "01:00"),
			task("night", "23:00", "23:59"),
		]);
		expect(range).toEqual({ startHour: 0, endHour: MAX_HOUR });
	});

	it("clamps the ceiling at 24 even when a default duration overruns midnight", () => {
		// 23:50 with no end → 00:50 next day; the window must not report hour 25.
		expect(visibleRange([task("late", "23:50")]).endHour).toBe(MAX_HOUR);
	});

	it("ignores untimed tasks entirely", () => {
		expect(visibleRange([task("anytime"), task("junk", "later")])).toEqual({
			startHour: DEFAULT_START_HOUR,
			endHour: DEFAULT_END_HOUR,
		});
	});
});

describe("visibleRange — now-line window", () => {
	it("leaves the range untouched when nowMinutes is omitted", () => {
		// Proves the parameter is genuinely optional and the old behaviour stands.
		expect(visibleRange([task("a", "09:00", "10:00")])).toEqual({
			startHour: DEFAULT_START_HOUR,
			endHour: DEFAULT_END_HOUR,
		});
		expect(visibleRange([])).toEqual(
			visibleRange([], undefined),
		);
	});

	it("leaves the range untouched when now is already inside it", () => {
		const range = visibleRange([task("a", "09:00", "10:00")], 13 * 60 + 20);
		expect(range).toEqual({
			startHour: DEFAULT_START_HOUR,
			endHour: DEFAULT_END_HOUR,
		});
	});

	it("expands downward when now is before the window start", () => {
		const range = visibleRange([], 4 * 60 + 45);
		expect(range.startHour).toBe(4);
		// Expand-only: the far end must not creep inward.
		expect(range.endHour).toBe(DEFAULT_END_HOUR);
	});

	it("expands upward when now is after the window end", () => {
		const range = visibleRange([], 21 * 60 + 30);
		expect(range.endHour).toBe(22);
		expect(range.startHour).toBe(DEFAULT_START_HOUR);
	});

	it("leaves an hour of room so the line never sits on the closing rule", () => {
		// 19:00 is exactly DEFAULT_END_HOUR; without the +1 the line would land
		// flush on the last rule with nothing below it.
		expect(visibleRange([], 19 * 60).endHour).toBe(20);
		expect(visibleRange([], 23 * 60 + 59).endHour).toBe(MAX_HOUR);
	});

	it("never shrinks a window that content already widened", () => {
		const tasks = [task("dawn", "05:00", "06:00"), task("night", "20:00", "21:00")];
		const withoutNow = visibleRange(tasks);
		expect(withoutNow).toEqual({ startHour: 5, endHour: 21 });
		for (const now of [0, 9 * 60, 12 * 60, 20 * 60 + 30, 23 * 60]) {
			const withNow = visibleRange(tasks, now);
			expect(withNow.startHour).toBeLessThanOrEqual(withoutNow.startHour);
			expect(withNow.endHour).toBeGreaterThanOrEqual(withoutNow.endHour);
		}
	});

	it("ignores a junk or out-of-day clock instead of producing NaN", () => {
		const base = visibleRange([task("a", "09:00", "10:00")]);
		for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 24 * 60, 99999]) {
			const range = visibleRange([task("a", "09:00", "10:00")], bad);
			expect(range).toEqual(base);
			expect(Number.isFinite(range.startHour)).toBe(true);
			expect(Number.isFinite(range.endHour)).toBe(true);
		}
	});

	it("guarantees layoutDay + nowLineOffset draw a line for any time of day", () => {
		// The regression this closes: a clear evening painted a 07:00–19:00 grid
		// with no now-line at all.
		for (let minute = 0; minute < 24 * 60; minute += 7) {
			const layout = layoutDay([task("a", "09:00", "10:00")], minute);
			const offset = nowLineOffset(minute, layout.range);
			expect(offset).not.toBeNull();
			expect(offset!).toBeGreaterThanOrEqual(0);
			expect(offset!).toBeLessThanOrEqual(layout.gridHeight);
		}
	});

	it("threads the clock through layoutDay without moving any block", () => {
		const tasks = [task("a", "09:00", "10:00"), task("b", "09:30", "11:00")];
		const late = layoutDay(tasks, 22 * 60);
		const plain = layoutDay(tasks);
		expect(late.range.endHour).toBe(23);
		expect(plain.range.endHour).toBe(DEFAULT_END_HOUR);
		// Same origin hour ⇒ identical geometry; only the grid got taller.
		expect(late.range.startHour).toBe(plain.range.startHour);
		expect(late.blocks).toEqual(plain.blocks);
		expect(late.gridHeight).toBeGreaterThan(plain.gridHeight);
	});
});

describe("layoutDay — columns", () => {
	it("gives non-overlapping tasks the full width", () => {
		const { blocks } = layoutDay([
			task("a", "09:00", "10:00"),
			task("b", "11:00", "12:00"),
		]);
		expect(blocks).toHaveLength(2);
		for (const b of blocks) {
			expect(b.columnCount).toBe(1);
			expect(b.columnIndex).toBe(0);
		}
	});

	it("does NOT treat touching tasks as overlapping", () => {
		const { blocks } = layoutDay([
			task("first", "09:00", "10:00"),
			task("second", "10:00", "11:00"),
		]);
		expect(blocks.map((b) => b.columnCount)).toEqual([1, 1]);
		expect(blocks.map((b) => b.columnIndex)).toEqual([0, 0]);
		// Touching means the second starts exactly where the first ends.
		const map = byId(blocks);
		expect(map.get("first")!.top + map.get("first")!.height).toBe(
			map.get("second")!.top,
		);
	});

	it("splits two overlapping tasks into two stable columns", () => {
		const input = [task("early", "09:00", "10:30"), task("late", "10:00", "11:00")];
		const first = layoutDay(input);
		expect(ids(first.blocks)).toEqual(["early", "late"]);
		expect(byId(first.blocks).get("early")).toMatchObject({
			columnIndex: 0,
			columnCount: 2,
		});
		expect(byId(first.blocks).get("late")).toMatchObject({
			columnIndex: 1,
			columnCount: 2,
		});
		// Column assignment must not depend on the caller's array order.
		const reversed = layoutDay([...input].reverse());
		expect(ids(reversed.blocks)).toEqual(ids(first.blocks));
		expect(reversed.blocks).toEqual(first.blocks);
	});

	it("splits a three-way overlap into three columns", () => {
		const { blocks } = layoutDay([
			task("a", "09:00", "11:00"),
			task("b", "09:30", "10:30"),
			task("c", "10:00", "12:00"),
		]);
		const map = byId(blocks);
		expect(map.get("a")!.columnIndex).toBe(0);
		expect(map.get("b")!.columnIndex).toBe(1);
		expect(map.get("c")!.columnIndex).toBe(2);
		for (const b of blocks) expect(b.columnCount).toBe(3);
	});

	it("puts a contained task beside its container, container first", () => {
		const { blocks } = layoutDay([
			task("inner", "10:00", "10:30"),
			task("outer", "09:00", "13:00"),
		]);
		const map = byId(blocks);
		expect(map.get("outer")).toMatchObject({ columnIndex: 0, columnCount: 2 });
		expect(map.get("inner")).toMatchObject({ columnIndex: 1, columnCount: 2 });
		// The inner block sits strictly inside the outer one's vertical span.
		const outer = map.get("outer")!;
		const inner = map.get("inner")!;
		expect(inner.top).toBeGreaterThan(outer.top);
		expect(inner.top + inner.height).toBeLessThan(outer.top + outer.height);
	});

	it("reuses a freed column and keeps columnCount cluster-wide", () => {
		// `long` spans the whole cluster; `am` then `pm` share column 1.
		const { blocks } = layoutDay([
			task("long", "09:00", "12:00"),
			task("am", "09:30", "10:00"),
			task("pm", "10:30", "11:00"),
		]);
		const map = byId(blocks);
		expect(map.get("long")!.columnIndex).toBe(0);
		expect(map.get("am")!.columnIndex).toBe(1);
		expect(map.get("pm")!.columnIndex).toBe(1);
		for (const b of blocks) expect(b.columnCount).toBe(2);
	});

	it("breaks an exact start+end tie deterministically, whatever the input order", () => {
		// Identical intervals exhaust the time comparators, so title then _id decide.
		const forward = layoutDay([
			task("alpha", "09:00", "10:00"),
			task("beta", "09:00", "10:00"),
		]);
		const reversed = layoutDay([
			task("beta", "09:00", "10:00"),
			task("alpha", "09:00", "10:00"),
		]);
		for (const layout of [forward, reversed]) {
			const map = byId(layout.blocks);
			expect(map.get("alpha")!.columnIndex).toBe(0);
			expect(map.get("beta")!.columnIndex).toBe(1);
			expect(map.get("alpha")!.columnCount).toBe(2);
			expect(map.get("alpha")!.top).toBe(map.get("beta")!.top);
			expect(map.get("alpha")!.height).toBe(map.get("beta")!.height);
		}
		expect(ids(forward.blocks)).toEqual(ids(reversed.blocks));

		// Same interval AND same title: _id is the last resort and still total.
		const same = { title: "Same job" };
		const byIdForward = layoutDay([
			task("z-late", "09:00", "10:00", same),
			task("a-early", "09:00", "10:00", same),
		]);
		const byIdReversed = layoutDay([
			task("a-early", "09:00", "10:00", same),
			task("z-late", "09:00", "10:00", same),
		]);
		for (const layout of [byIdForward, byIdReversed]) {
			expect(byId(layout.blocks).get("a-early")!.columnIndex).toBe(0);
			expect(byId(layout.blocks).get("z-late")!.columnIndex).toBe(1);
		}
		expect(ids(byIdForward.blocks)).toEqual(ids(byIdReversed.blocks));
	});

	it("starts a fresh cluster after a gap so a later pair is unaffected", () => {
		const { blocks } = layoutDay([
			task("solo", "08:00", "08:45"),
			task("x", "14:00", "15:00"),
			task("y", "14:30", "15:30"),
		]);
		const map = byId(blocks);
		expect(map.get("solo")!.columnCount).toBe(1);
		expect(map.get("x")!.columnCount).toBe(2);
		expect(map.get("y")!.columnCount).toBe(2);
	});
});

describe("layoutDay — durations", () => {
	it("applies the default duration when endTime is missing", () => {
		const block = layoutDay([task("open", "09:00")]).blocks[0];
		expect(block.endMinutes - block.startMinutes).toBe(DEFAULT_DURATION_MINUTES);
		expect(block.height).toBe(minutesToPx(DEFAULT_DURATION_MINUTES));
	});

	it("applies the default duration when endTime is junk or before the start", () => {
		for (const end of ["", "noon", "24:00", "08:00", "09:00"]) {
			const block = layoutDay([task("weird", "09:00", end)]).blocks[0];
			expect(block.endMinutes - block.startMinutes).toBe(
				DEFAULT_DURATION_MINUTES,
			);
		}
	});

	it("floors a very short interval to the minimum block duration", () => {
		const block = layoutDay([task("quick", "09:00", "09:05")]).blocks[0];
		expect(block.endMinutes - block.startMinutes).toBe(MIN_BLOCK_MINUTES);
		expect(block.height).toBe(minutesToPx(MIN_BLOCK_MINUTES));
		// The start is never moved — only the painted end is floored.
		expect(block.startMinutes).toBe(9 * 60);
	});

	it("keeps a real interval longer than the floor exactly proportional", () => {
		const block = layoutDay([task("job", "09:00", "11:30")]).blocks[0];
		expect(block.height).toBe(minutesToPx(150));
		expect(block.height / minutesToPx(50)).toBeCloseTo(3, 10);
	});

	it("collides two floored short jobs that are closer than the floor", () => {
		// 09:00–09:05 floors to 09:20, so the 09:10 job genuinely overlaps it.
		const { blocks } = layoutDay([
			task("a", "09:00", "09:05"),
			task("b", "09:10", "09:15"),
		]);
		expect(blocks.map((b) => b.columnCount)).toEqual([2, 2]);
		expect(blocks.map((b) => b.columnIndex)).toEqual([0, 1]);
	});
});

describe("layoutDay — untimed", () => {
	it("returns untimed tasks separately and never as blocks", () => {
		const { blocks, untimed } = layoutDay([
			task("timed", "09:00", "10:00"),
			task("anytime"),
			task("blank", ""),
			task("junk", "sometime"),
			task("bad-hour", "25:00"),
			task("bad-min", "10:75"),
			task("no-colon", "0900"),
		]);
		expect(ids(blocks)).toEqual(["timed"]);
		expect(untimed.map((t) => t._id)).toEqual([
			"anytime",
			"blank",
			"junk",
			"bad-hour",
			"bad-min",
			"no-colon",
		]);
	});

	it("loses nothing: every input lands in exactly one bucket", () => {
		const input = [
			task("a", "09:00", "10:00"),
			task("b"),
			task("c", "09:30"),
			task("d", "oops"),
			task("e", "23:59"),
		];
		const { blocks, untimed } = layoutDay(input);
		expect(blocks.length + untimed.length).toBe(input.length);
		const seen = [...ids(blocks), ...untimed.map((t) => t._id)].sort();
		expect(seen).toEqual(["a", "b", "c", "d", "e"]);
	});

	it("handles a day of nothing but untimed work without a grid collapse", () => {
		const layout = layoutDay([task("x"), task("y")]);
		expect(layout.blocks).toEqual([]);
		expect(layout.untimed).toHaveLength(2);
		expect(layout.gridHeight).toBe(
			(DEFAULT_END_HOUR - DEFAULT_START_HOUR) * HOUR_HEIGHT,
		);
	});

	it("handles empty input", () => {
		const layout = layoutDay([]);
		expect(layout.blocks).toEqual([]);
		expect(layout.untimed).toEqual([]);
		expect(layout.gridHeight).toBeGreaterThan(0);
		expect(layout.range).toEqual({
			startHour: DEFAULT_START_HOUR,
			endHour: DEFAULT_END_HOUR,
		});
	});
});

describe("layoutDay — geometry invariants", () => {
	const messy: AgendaTask[] = [
		task("dawn", "04:05", "04:07"),
		task("a", "09:00", "11:00"),
		task("b", "09:30", "10:30"),
		task("c", "10:00", "12:00"),
		task("touching", "12:00", "12:30"),
		task("open-ended", "15:15"),
		task("backwards", "16:00", "15:00"),
		task("midnight", "23:50"),
		task("anytime"),
		task("junk", "??:??"),
	];

	it("produces no NaN, no negative or zero heights, and nothing above the origin", () => {
		const layout = layoutDay(messy);
		expect(layout.blocks.length).toBe(8);
		for (const b of layout.blocks) {
			for (const n of [
				b.top,
				b.height,
				b.startMinutes,
				b.endMinutes,
				b.columnIndex,
				b.columnCount,
				b.hitSlopTop,
				b.hitSlopBottom,
			]) {
				expect(Number.isFinite(n)).toBe(true);
				expect(Number.isNaN(n)).toBe(false);
			}
			expect(b.height).toBeGreaterThan(0);
			expect(b.height).toBeGreaterThanOrEqual(minutesToPx(MIN_BLOCK_MINUTES));
			expect(b.top).toBeGreaterThanOrEqual(0);
			expect(b.endMinutes).toBeGreaterThan(b.startMinutes);
			expect(b.columnIndex).toBeGreaterThanOrEqual(0);
			expect(b.columnIndex).toBeLessThan(b.columnCount);
			expect(b.columnCount).toBeGreaterThanOrEqual(1);
		}
		expect(Number.isFinite(layout.gridHeight)).toBe(true);
	});

	it("keeps gridHeight >= the tallest block bottom, including a midnight overrun", () => {
		const layout = layoutDay(messy);
		for (const b of layout.blocks) {
			expect(layout.gridHeight).toBeGreaterThanOrEqual(b.top + b.height);
		}
		// 23:50 with no end overruns the 24:00 rule; the grid must still contain it.
		const overrun = byId(layout.blocks).get("midnight")!;
		expect(overrun.top + overrun.height).toBeGreaterThan(
			(layout.range.endHour - layout.range.startHour) * HOUR_HEIGHT,
		);
	});

	it("keeps every tap area inside the grid, slop included", () => {
		const layout = layoutDay(messy);
		for (const b of layout.blocks) {
			// Slop may never reach above the grid origin or past its painted bottom;
			// either would put a tap target on chrome the user cannot see.
			expect(b.top - b.hitSlopTop).toBeGreaterThanOrEqual(0);
			expect(b.top + b.height + b.hitSlopBottom).toBeLessThanOrEqual(
				layout.gridHeight,
			);
			expect(b.hitSlopTop).toBeGreaterThanOrEqual(0);
			expect(b.hitSlopBottom).toBeGreaterThanOrEqual(0);
		}
	});

	it("positions tops proportionally to the grid origin", () => {
		const layout = layoutDay([task("a", "09:00", "10:00")]);
		expect(layout.range.startHour).toBe(DEFAULT_START_HOUR);
		expect(layout.blocks[0].top).toBe(minutesToPx(2 * 60));
	});

	it("never lets two blocks in the same column overlap vertically", () => {
		const layout = layoutDay(messy);
		for (const a of layout.blocks) {
			for (const b of layout.blocks) {
				if (a === b || a.columnIndex !== b.columnIndex) continue;
				if (a.columnCount !== b.columnCount) continue;
				const disjoint =
					a.top + a.height <= b.top || b.top + b.height <= a.top;
				expect(disjoint).toBe(true);
			}
		}
	});
});

describe("layoutDay — hit slop", () => {
	it("grows an isolated short block toward the 44pt minimum", () => {
		const block = layoutDay([task("quick", "09:00", "09:05")]).blocks[0];
		expect(block.height).toBeLessThan(TOUCH_MIN);
		expect(block.height + block.hitSlopTop + block.hitSlopBottom).toBeGreaterThan(
			block.height,
		);
		expect(
			block.height + block.hitSlopTop + block.hitSlopBottom,
		).toBeLessThanOrEqual(TOUCH_MIN);
	});

	it("reaches the full 44pt for a short block with open space both sides", () => {
		// The load-bearing assertion: the slop must make up the WHOLE deficit, not
		// merely "some" of it. Both halves are exact — no whole-pixel truncation,
		// which at HOUR_HEIGHT 88 would land at 43.33 and miss the gate.
		const block = layoutDay([task("quick", "09:00", "09:05")]).blocks[0];
		const need = TOUCH_MIN - minutesToPx(MIN_BLOCK_MINUTES);
		expect(block.height).toBe(minutesToPx(MIN_BLOCK_MINUTES));
		expect(block.hitSlopTop).toBe(need / 2);
		expect(block.hitSlopBottom).toBe(need / 2);
		expect(block.height + block.hitSlopTop + block.hitSlopBottom).toBe(TOUCH_MIN);
	});

	it("ignores a block that overlaps it in another column when granting slop", () => {
		// The tall job spans the short one, so it is neither above nor below it and
		// must not eat into either half-gap; the columns already separate them.
		const layout = layoutDay([
			task("long", "09:00", "11:00"),
			task("short", "09:30", "09:35"),
		]);
		const map = byId(layout.blocks);
		const long = map.get("long")!;
		const short = map.get("short")!;
		expect(long.columnIndex).not.toBe(short.columnIndex);
		expect(short.top).toBeGreaterThan(long.top);
		expect(short.top + short.height).toBeLessThan(long.top + long.height);
		expect(short.height + short.hitSlopTop + short.hitSlopBottom).toBe(TOUCH_MIN);
	});

	it("redistributes slop upward when the space below is too tight", () => {
		// The 5-minute gap below is claimable only up to its half, so the remainder
		// must come out of the open sky above rather than being forfeited.
		const gapBelow = 5;
		const layout = layoutDay([
			task("short", "09:00", "09:05"),
			task("below", `09:${MIN_BLOCK_MINUTES + gapBelow}`, "10:00"),
		]);
		const short = byId(layout.blocks).get("short")!;
		const need = TOUCH_MIN - short.height;
		const claimableBelow = minutesToPx(gapBelow) / 2;
		// toBeCloseTo for the two halves only: the implementation derives the gap from
		// absolute grid pixels (~1000px), so its low-order bits differ from this
		// small-number derivation by ~1e-14. The totals below are exact.
		expect(short.hitSlopBottom).toBeCloseTo(claimableBelow, 9);
		expect(short.hitSlopTop).toBeCloseTo(need - claimableBelow, 9);
		expect(short.hitSlopTop).toBeGreaterThan(need / 2);
		expect(short.hitSlopTop + short.hitSlopBottom).toBe(need);
		expect(short.height + short.hitSlopTop + short.hitSlopBottom).toBe(TOUCH_MIN);
	});

	it("gives a tall block no slop at all", () => {
		const block = layoutDay([task("long", "09:00", "11:00")]).blocks[0];
		expect(block.height).toBeGreaterThan(TOUCH_MIN);
		expect(block.hitSlopTop).toBe(0);
		expect(block.hitSlopBottom).toBe(0);
	});

	it("never lets two blocks' tap areas overlap", () => {
		const layout = layoutDay([
			task("a", "09:00", "09:05"),
			task("b", "09:35", "09:40"),
			task("c", "10:00", "10:05"),
			task("d", "14:00", "14:10"),
		]);
		const spans = layout.blocks
			.map((b) => ({
				lo: b.top - b.hitSlopTop,
				hi: b.top + b.height + b.hitSlopBottom,
			}))
			.sort((x, y) => x.lo - y.lo);
		for (let i = 1; i < spans.length; i++) {
			expect(spans[i].lo).toBeGreaterThanOrEqual(spans[i - 1].hi);
		}
	});

	it("gives a block wedged between two adjoining blocks no vertical slop", () => {
		const layout = layoutDay([
			task("above", "09:00", "09:30"),
			task("wedged", "09:30", "09:50"),
			task("below", "09:50", "10:30"),
		]);
		const wedged = byId(layout.blocks).get("wedged")!;
		expect(wedged.hitSlopTop).toBe(0);
		expect(wedged.hitSlopBottom).toBe(0);
	});
});

describe("nowLineOffset", () => {
	const range = { startHour: 7, endHour: 19 };

	it("returns a proportional offset inside the window", () => {
		expect(nowLineOffset(7 * 60, range)).toBe(0);
		expect(nowLineOffset(8 * 60, range)).toBe(HOUR_HEIGHT);
		expect(nowLineOffset(19 * 60, range)).toBe(12 * HOUR_HEIGHT);
	});

	it("returns null outside the window and for junk input", () => {
		expect(nowLineOffset(6 * 60 + 59, range)).toBeNull();
		expect(nowLineOffset(19 * 60 + 1, range)).toBeNull();
		expect(nowLineOffset(Number.NaN, range)).toBeNull();
		expect(nowLineOffset(Number.POSITIVE_INFINITY, range)).toBeNull();
	});
});

describe("initialScrollOffset", () => {
	it("anchors on the now-line when there is one", () => {
		const layout = layoutDay([task("a", "09:00", "10:00")]);
		const now = nowLineOffset(16 * 60, layout.range)!;
		expect(initialScrollOffset(layout, now)).toBe(now - SCROLL_LEAD_PX);
	});

	it("anchors on the earliest block when there is no now-line", () => {
		const layout = layoutDay([
			task("late", "16:00", "17:00"),
			task("first", "14:00", "15:00"),
		]);
		const earliest = Math.min(...layout.blocks.map((b) => b.top));
		expect(initialScrollOffset(layout, null)).toBe(earliest - SCROLL_LEAD_PX);
	});

	it("never returns a negative offset", () => {
		const early = layoutDay([task("a", "07:00", "08:00")]);
		expect(initialScrollOffset(early, null)).toBe(0);
		expect(initialScrollOffset(layoutDay([]), null)).toBe(0);
		expect(initialScrollOffset(early, 10)).toBe(0);
	});
});
