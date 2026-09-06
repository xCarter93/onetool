import { describe, expect, it } from "vitest";
import {
	addCalendarDays,
	calendarDayDifference,
	dateKeyFromTimestamp,
	listRecurrenceDates,
	timestampForDateKey,
	validateRecurrenceRule,
} from "./projectRecurrence";

describe("project recurrence calendar", () => {
	it("keeps date arithmetic and timezone conversion stable across DST", () => {
		expect(addCalendarDays("2026-03-07", 2)).toBe("2026-03-09");
		expect(calendarDayDifference("2026-03-07", "2026-03-09")).toBe(2);
		expect(timestampForDateKey("2026-03-08", "America/New_York")).toBe(
			Date.UTC(2026, 2, 8, 5)
		);
		expect(timestampForDateKey("2026-03-09", "America/New_York")).toBe(
			Date.UTC(2026, 2, 9, 4)
		);
		expect(
			dateKeyFromTimestamp(Date.UTC(2026, 2, 9, 3, 59), "America/New_York")
		).toBe("2026-03-08");
	});

	it("supports boundary years and rejects arithmetic outside them", () => {
		expect(addCalendarDays("0001-01-01", 1)).toBe("0001-01-02");
		expect(calendarDayDifference("0001-01-01", "9999-12-31")).toBe(3_652_058);
		expect(() => addCalendarDays("0001-01-01", -1)).toThrow(
			/Invalid calendar date/
		);
		expect(() => addCalendarDays("9999-12-31", 1)).toThrow(/Invalid/);
	});

	it("lists daily dates with inclusive until and origin counting", () => {
		expect(
			listRecurrenceDates({
				rule: {
					frequency: "daily",
					interval: 2,
					end: { kind: "until", date: "2026-01-05" },
				},
				anchor: "2026-01-01",
				from: "2026-01-01",
				through: "2026-01-10",
				limit: 20,
			})
		).toEqual(["2026-01-01", "2026-01-03", "2026-01-05"]);
		expect(
			listRecurrenceDates({
				rule: {
					frequency: "daily",
					interval: 1,
					end: { kind: "count", count: 3 },
				},
				anchor: "2026-01-01",
				from: "2026-01-02",
				through: "2026-01-10",
				limit: 20,
			})
		).toEqual(["2026-01-02", "2026-01-03"]);
	});

	it("anchors weekly intervals to Monday and supports multiple weekdays", () => {
		expect(
			listRecurrenceDates({
				rule: { frequency: "weekly", interval: 2, weekdays: [1, 3] },
				anchor: "2026-01-06",
				from: "2026-01-06",
				through: "2026-02-02",
				limit: 20,
			})
		).toEqual([
			"2026-01-06",
			"2026-01-07",
			"2026-01-19",
			"2026-01-21",
			"2026-02-02",
		]);
		expect(
			listRecurrenceDates({
				rule: {
					frequency: "weekly",
					interval: 1,
					weekdays: [0, 1],
					end: { kind: "count", count: 4 },
				},
				anchor: "2026-01-06",
				from: "2026-01-07",
				through: "2026-01-14",
				limit: 20,
			})
		).toEqual(["2026-01-11", "2026-01-12"]);
	});

	it("applies seasonal months to daily and weekly schedules", () => {
		expect(
			listRecurrenceDates({
				rule: { frequency: "daily", interval: 1, months: [4] },
				anchor: "2026-03-30",
				from: "2026-03-31",
				through: "2026-04-03",
				limit: 20,
			})
		).toEqual(["2026-04-01", "2026-04-02", "2026-04-03"]);
		expect(
			listRecurrenceDates({
				rule: {
					frequency: "weekly",
					interval: 1,
					weekdays: [1],
					months: [4, 10],
				},
				anchor: "2026-03-30",
				from: "2026-03-31",
				through: "2026-04-14",
				limit: 20,
			})
		).toEqual(["2026-04-06", "2026-04-13"]);
	});

	it("clamps numeric month days from the original selection and deduplicates", () => {
		expect(
			listRecurrenceDates({
				rule: { frequency: "monthly", interval: 1, monthDays: [30, 31] },
				anchor: "2026-01-31",
				from: "2026-01-31",
				through: "2026-04-30",
				limit: 20,
			})
		).toEqual([
			"2026-01-31",
			"2026-02-28",
			"2026-03-30",
			"2026-03-31",
			"2026-04-30",
		]);
	});

	it("skips missing fifth weekdays", () => {
		expect(
			listRecurrenceDates({
				rule: {
					frequency: "monthly",
					interval: 1,
					ordinalWeekday: { ordinal: 5, weekday: 1 },
				},
				anchor: "2026-01-05",
				from: "2026-01-06",
				through: "2026-04-30",
				limit: 20,
			})
		).toEqual(["2026-03-30"]);
	});

	it("supports the last weekday of a month", () => {
		expect(
			listRecurrenceDates({
				rule: {
					frequency: "monthly",
					interval: 1,
					ordinalWeekday: { ordinal: -1, weekday: 5 },
				},
				anchor: "2026-01-01",
				from: "2026-01-02",
				through: "2026-03-31",
				limit: 20,
			})
		).toEqual(["2026-01-30", "2026-02-27", "2026-03-27"]);
	});

	it("returns no dates for an unreachable quarterly seasonal month", () => {
		expect(
			listRecurrenceDates({
				rule: {
					frequency: "monthly",
					interval: 3,
					months: [2],
					monthDays: [1],
				},
				anchor: "2026-01-01",
				from: "2026-01-02",
				through: "2030-12-31",
				limit: 20,
				includeNext: true,
			})
		).toEqual([]);
	});

	it("preserves leap-day anchors and supports seasonal months", () => {
		expect(
			listRecurrenceDates({
				rule: { frequency: "yearly", interval: 1 },
				anchor: "2024-02-29",
				from: "2024-02-29",
				through: "2028-03-01",
				limit: 20,
			})
		).toEqual([
			"2024-02-29",
			"2025-02-28",
			"2026-02-28",
			"2027-02-28",
			"2028-02-29",
		]);
		expect(
			listRecurrenceDates({
				rule: {
					frequency: "yearly",
					interval: 1,
					months: [4, 10],
					monthDays: [15],
				},
				anchor: "2026-01-10",
				from: "2026-01-11",
				through: "2027-12-31",
				limit: 20,
			})
		).toEqual(["2026-04-15", "2026-10-15", "2027-04-15", "2027-10-15"]);
	});

	it("finds the next infrequent occurrence beyond the preview horizon", () => {
		expect(
			listRecurrenceDates({
				rule: { frequency: "yearly", interval: 500 },
				anchor: "1000-06-01",
				from: "1001-01-01",
				through: "1001-03-31",
				limit: 100,
				includeNext: true,
			})
		).toEqual(["1500-06-01"]);
		expect(
			listRecurrenceDates({
				rule: { frequency: "yearly", interval: 1 },
				anchor: "2026-06-01",
				from: "2026-01-01",
				through: "2026-03-31",
				limit: 100,
				includeNext: true,
			})
		).toEqual(["2026-06-01"]);
	});

	it("respects finite ends when the requested range starts after the series", () => {
		expect(
			listRecurrenceDates({
				rule: {
					frequency: "daily",
					interval: 1,
					end: { kind: "count", count: 3 },
				},
				anchor: "2026-01-01",
				from: "2026-02-01",
				through: "2026-03-01",
				limit: 20,
				includeNext: true,
			})
		).toEqual([]);
		expect(
			listRecurrenceDates({
				rule: {
					frequency: "daily",
					interval: 1,
					end: { kind: "until", date: "2026-01-03" },
				},
				anchor: "2026-01-01",
				from: "2026-02-01",
				through: "2026-03-01",
				limit: 20,
				includeNext: true,
			})
		).toEqual([]);
	});

	it("rejects malformed and contradictory rules", () => {
		expect(
			validateRecurrenceRule({ frequency: "daily", interval: 0 }, "2026-01-01")
		).toMatch(/Interval/);
		expect(
			validateRecurrenceRule(
				{ frequency: "monthly", interval: 1, monthDays: [0] },
				"2026-01-01"
			)
		).toMatch(/Month days/);
		expect(
			validateRecurrenceRule(
				{
					frequency: "monthly",
					interval: 1,
					monthDays: [1],
					ordinalWeekday: { ordinal: -1, weekday: 1 },
				},
				"2026-01-01"
			)
		).toMatch(/not both/);
		expect(() =>
			listRecurrenceDates({
				rule: { frequency: "daily", interval: 1 },
				anchor: "2026-02-30",
				from: "2026-01-01",
				through: "2026-01-02",
				limit: 2,
			})
		).toThrow(/Invalid calendar date/);
		expect(
			validateRecurrenceRule(
				{
					frequency: "weekly",
					interval: 1,
					weekdays: Array.from({ length: 8 }, () => 1),
				},
				"2026-01-01"
			)
		).toMatch(/at most 7/);
		expect(
			validateRecurrenceRule(
				{
					frequency: "yearly",
					interval: 1,
					months: Array.from({ length: 13 }, () => 1),
				},
				"2026-01-01"
			)
		).toMatch(/at most 12/);
	});
});
