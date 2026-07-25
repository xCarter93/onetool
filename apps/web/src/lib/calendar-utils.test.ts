import { describe, it, expect } from "vitest";
import { layoutTimedDayEvents, parseTimeToMinutes } from "./calendar-utils";
import type { CalendarEvent } from "@/types/calendar";

const OPTS = { dayStartHour: 6, dayEndHour: 22, hourHeight: 80 };

const task = (
	id: string,
	startTime?: string,
	endTime?: string
): CalendarEvent => ({
	id: id as CalendarEvent["id"],
	type: "task",
	title: id,
	startDate: new Date(2026, 6, 24),
	clientName: "Test Client",
	startTime,
	endTime,
	status: "pending",
});

describe("parseTimeToMinutes", () => {
	it("parses HH:MM", () => {
		expect(parseTimeToMinutes("09:30")).toBe(570);
		expect(parseTimeToMinutes("0:05")).toBe(5);
		expect(parseTimeToMinutes("23:59")).toBe(1439);
	});

	it("rejects missing or malformed values", () => {
		expect(parseTimeToMinutes(undefined)).toBeNull();
		expect(parseTimeToMinutes("")).toBeNull();
		expect(parseTimeToMinutes("9am")).toBeNull();
		expect(parseTimeToMinutes("25:00")).toBeNull();
		expect(parseTimeToMinutes("12:75")).toBeNull();
	});
});

describe("layoutTimedDayEvents", () => {
	it("positions an event proportionally to its start and duration", () => {
		const [layout] = layoutTimedDayEvents([task("a", "09:30", "12:00")], OPTS);
		// 9:30 is 3.5h after 6:00 → 280px; 2.5h duration → 200px
		expect(layout).toMatchObject({ top: 280, height: 200, left: 0, width: 100 });
	});

	it("defaults to one hour when end time is missing or inverted", () => {
		const layouts = layoutTimedDayEvents(
			[task("a", "10:00"), task("b", "14:00", "13:00")],
			OPTS
		);
		expect(layouts.map((l) => l.height)).toEqual([80, 80]);
	});

	it("skips events without a parseable start time", () => {
		expect(layoutTimedDayEvents([task("a"), task("b", "bad")], OPTS)).toEqual(
			[]
		);
	});

	it("clamps events to the visible range with a minimum duration", () => {
		const [early, late] = layoutTimedDayEvents(
			[task("a", "04:00", "05:00"), task("b", "21:50", "23:30")],
			OPTS
		);
		expect(early.top).toBe(0);
		expect(early.height).toBe(40); // 30-min minimum
		expect(late.top + late.height).toBe((22 - 6) * 80); // pinned to grid end
	});

	it("splits overlapping events into side-by-side lanes", () => {
		const layouts = layoutTimedDayEvents(
			[
				task("a", "09:00", "11:00"),
				task("b", "10:00", "12:00"),
				task("c", "11:00", "12:00"),
			],
			OPTS
		);
		const byId = Object.fromEntries(layouts.map((l) => [l.event.id, l]));
		// a and b overlap (2 lanes); c reuses a's freed lane
		expect(byId.a.width).toBe(50);
		expect(byId.a.left).toBe(0);
		expect(byId.b.left).toBe(50);
		expect(byId.c.left).toBe(0);
	});

	it("keeps non-overlapping events full width", () => {
		const layouts = layoutTimedDayEvents(
			[task("a", "08:00", "09:00"), task("b", "09:00", "10:00")],
			OPTS
		);
		expect(layouts.every((l) => l.width === 100)).toBe(true);
	});
});
