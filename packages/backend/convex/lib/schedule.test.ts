import { describe, it, expect } from "vitest";
import {
	computeNextRunAt,
	validateSchedule,
	describeSchedule,
	timezoneLabel,
	DEFAULT_SCHEDULE_TIME,
} from "./schedule";
import type { AutomationSchedule } from "./workflowTypes";

// DST facts for America/New_York in 2026: EST=UTC-5, EDT=UTC-4.
// Spring forward: Sun Mar 8 2026, 02:00 -> 03:00 local (hour skipped).
// Fall back: Sun Nov 1 2026, 02:00 -> 01:00 local (hour repeated).

describe("computeNextRunAt — daily, America/New_York", () => {
	const tz = "America/New_York";

	it("same-day: from before 09:00 EST returns 09:00 EST that day", () => {
		const from = Date.UTC(2026, 0, 15, 13, 0, 0); // 08:00 EST
		const expected = Date.UTC(2026, 0, 15, 14, 0, 0); // 09:00 EST
		expect(
			computeNextRunAt({ frequency: "daily", timezone: tz, time: "09:00" }, from)
		).toBe(expected);
	});

	it("next-day: from after 09:00 EST returns 09:00 EST the next day", () => {
		const from = Date.UTC(2026, 0, 15, 15, 0, 0); // 10:00 EST
		const expected = Date.UTC(2026, 0, 16, 14, 0, 0);
		expect(
			computeNextRunAt({ frequency: "daily", timezone: tz, time: "09:00" }, from)
		).toBe(expected);
	});

	it("is strictly after: from exactly 09:00 EST rolls to the next day", () => {
		const from = Date.UTC(2026, 0, 15, 14, 0, 0); // exactly 09:00 EST
		const expected = Date.UTC(2026, 0, 16, 14, 0, 0);
		expect(
			computeNextRunAt({ frequency: "daily", timezone: tz, time: "09:00" }, from)
		).toBe(expected);
	});

	it("spring-forward: 23h interval across the Mar 8 gap", () => {
		const from = Date.UTC(2026, 2, 7, 14, 0, 0); // 09:00 EST, Mar 7
		const expected = Date.UTC(2026, 2, 8, 13, 0, 0); // 09:00 EDT, Mar 8
		expect(
			computeNextRunAt({ frequency: "daily", timezone: tz, time: "09:00" }, from)
		).toBe(expected);
		expect(expected - from).toBe(23 * 60 * 60 * 1000);
	});

	it("DST gap: a skipped local time (02:30) resolves after the gap", () => {
		const from = Date.UTC(2026, 2, 8, 0, 0, 0);
		const expected = Date.UTC(2026, 2, 8, 7, 30, 0); // 03:30 EDT (02:30 doesn't exist)
		expect(
			computeNextRunAt({ frequency: "daily", timezone: tz, time: "02:30" }, from)
		).toBe(expected);
	});

	it("fall-back: a repeated local time (01:30) resolves to its first occurrence", () => {
		const from = Date.UTC(2026, 10, 1, 0, 0, 0);
		const expected = Date.UTC(2026, 10, 1, 5, 30, 0); // 01:30 EDT (first occurrence)
		expect(
			computeNextRunAt({ frequency: "daily", timezone: tz, time: "01:30" }, from)
		).toBe(expected);
	});

	it("fall-back: 25h interval across the Nov 1 repeated hour", () => {
		const from = Date.UTC(2026, 9, 31, 13, 0, 0); // 09:00 EDT, Oct 31
		const expected = Date.UTC(2026, 10, 1, 14, 0, 0); // 09:00 EST, Nov 1
		expect(
			computeNextRunAt({ frequency: "daily", timezone: tz, time: "09:00" }, from)
		).toBe(expected);
		expect(expected - from).toBe(25 * 60 * 60 * 1000);
	});

	it("defaults to 09:00 when time is omitted", () => {
		const from = Date.UTC(2026, 0, 15, 13, 0, 0); // 08:00 EST
		const expected = Date.UTC(2026, 0, 15, 14, 0, 0);
		expect(DEFAULT_SCHEDULE_TIME).toBe("09:00");
		expect(computeNextRunAt({ frequency: "daily", timezone: tz }, from)).toBe(
			expected
		);
	});
});

describe("computeNextRunAt — weekly, America/New_York, 09:00", () => {
	const tz = "America/New_York";
	const weekly = (dayOfWeek: number): AutomationSchedule => ({
		frequency: "weekly",
		timezone: tz,
		time: "09:00",
		dayOfWeek,
	});

	it("rolls forward to the next matching weekday", () => {
		// Wed 2026-01-14 -> Mon 2026-01-19 (dayOfWeek 1 = Monday)
		const from = Date.UTC(2026, 0, 14, 15, 0, 0);
		const expected = Date.UTC(2026, 0, 19, 14, 0, 0);
		expect(computeNextRunAt(weekly(1), from)).toBe(expected);
	});

	it("same day before the time, next week at/after the time", () => {
		const sameDayBefore = Date.UTC(2026, 0, 19, 13, 0, 0); // Mon, 08:00 EST
		expect(computeNextRunAt(weekly(1), sameDayBefore)).toBe(
			Date.UTC(2026, 0, 19, 14, 0, 0)
		);

		const exactlyAtTime = Date.UTC(2026, 0, 19, 14, 0, 0); // Mon, exactly 09:00 EST
		expect(computeNextRunAt(weekly(1), exactlyAtTime)).toBe(
			Date.UTC(2026, 0, 26, 14, 0, 0)
		);
	});
});

describe("computeNextRunAt — monthly, America/New_York, 09:00", () => {
	const tz = "America/New_York";
	const monthly = (dayOfMonth: number): AutomationSchedule => ({
		frequency: "monthly",
		timezone: tz,
		time: "09:00",
		dayOfMonth,
	});

	it("dayOfMonth 31, clamped in short months, DST-aware offsets", () => {
		expect(computeNextRunAt(monthly(31), Date.UTC(2026, 0, 20, 0, 0, 0))).toBe(
			Date.UTC(2026, 0, 31, 14, 0, 0)
		);
		// Feb 2026 has 28 days (not a leap year) — clamped.
		expect(computeNextRunAt(monthly(31), Date.UTC(2026, 1, 1, 0, 0, 0))).toBe(
			Date.UTC(2026, 1, 28, 14, 0, 0)
		);
		// Rolls into March, after the DST start — EDT offset.
		expect(computeNextRunAt(monthly(31), Date.UTC(2026, 1, 28, 15, 0, 0))).toBe(
			Date.UTC(2026, 2, 31, 13, 0, 0)
		);
		// April clamps 31 -> 30.
		expect(computeNextRunAt(monthly(31), Date.UTC(2026, 3, 1, 0, 0, 0))).toBe(
			Date.UTC(2026, 3, 30, 13, 0, 0)
		);
	});

	it("dayOfMonth 15 rolls to next month once this month's day has passed", () => {
		expect(computeNextRunAt(monthly(15), Date.UTC(2026, 0, 16, 0, 0, 0))).toBe(
			Date.UTC(2026, 1, 15, 14, 0, 0)
		);
	});
});

describe("computeNextRunAt — other timezones", () => {
	it("UTC daily at 00:00", () => {
		const from = Date.UTC(2026, 5, 10, 12, 0, 0);
		const expected = Date.UTC(2026, 5, 11, 0, 0, 0);
		expect(
			computeNextRunAt({ frequency: "daily", timezone: "UTC", time: "00:00" }, from)
		).toBe(expected);
	});

	it("Australia/Sydney daily at 09:00 (AEST = UTC+10 in June)", () => {
		const from = Date.UTC(2026, 5, 10, 0, 0, 0); // 10:00 AEST
		const expected = Date.UTC(2026, 5, 10, 23, 0, 0); // Jun 11 09:00 AEST
		expect(
			computeNextRunAt(
				{ frequency: "daily", timezone: "Australia/Sydney", time: "09:00" },
				from
			)
		).toBe(expected);
	});
});

describe("validateSchedule", () => {
	it("returns null for valid daily/weekly/monthly schedules", () => {
		expect(
			validateSchedule({
				frequency: "daily",
				timezone: "America/New_York",
				time: "09:00",
			})
		).toBeNull();
		expect(
			validateSchedule({
				frequency: "weekly",
				timezone: "America/New_York",
				time: "09:00",
				dayOfWeek: 1,
			})
		).toBeNull();
		expect(
			validateSchedule({
				frequency: "monthly",
				timezone: "America/New_York",
				time: "09:00",
				dayOfMonth: 15,
			})
		).toBeNull();
	});

	it("rejects an invalid IANA timezone", () => {
		expect(
			validateSchedule({ frequency: "daily", timezone: "Not/AZone" })
		).toMatch(/timezone/i);
	});

	it("rejects malformed times but accepts single-digit hours", () => {
		expect(
			validateSchedule({
				frequency: "daily",
				timezone: "UTC",
				time: "24:00",
			})
		).toMatch(/time/i);
		expect(
			validateSchedule({
				frequency: "daily",
				timezone: "UTC",
				time: "9:5",
			})
		).toMatch(/time/i);
		// Single-digit hour IS valid.
		expect(
			validateSchedule({
				frequency: "daily",
				timezone: "UTC",
				time: "9:05",
			})
		).toBeNull();
	});

	it("requires dayOfWeek for weekly, in range 0-6 integer", () => {
		expect(
			validateSchedule({ frequency: "weekly", timezone: "UTC" })
		).toMatch(/day of week/i);
		for (const dayOfWeek of [7, -1, 1.5]) {
			expect(
				validateSchedule({ frequency: "weekly", timezone: "UTC", dayOfWeek })
			).toMatch(/day of week/i);
		}
	});

	it("requires dayOfMonth for monthly, in range 1-31 integer", () => {
		expect(
			validateSchedule({ frequency: "monthly", timezone: "UTC" })
		).toMatch(/day of month/i);
		for (const dayOfMonth of [0, 32, 2.5]) {
			expect(
				validateSchedule({ frequency: "monthly", timezone: "UTC", dayOfMonth })
			).toMatch(/day of month/i);
		}
	});
});

describe("computeNextRunAt — invalid schedules throw", () => {
	it("throws for an invalid timezone", () => {
		expect(() =>
			computeNextRunAt(
				{ frequency: "daily", timezone: "Not/AZone" },
				Date.UTC(2026, 0, 1)
			)
		).toThrow();
	});

	it("throws for a weekly schedule missing dayOfWeek", () => {
		expect(() =>
			computeNextRunAt(
				{ frequency: "weekly", timezone: "UTC" },
				Date.UTC(2026, 0, 1)
			)
		).toThrow();
	});
});

describe("describeSchedule", () => {
	const refMs = Date.UTC(2026, 0, 15);
	const tz = "America/New_York";

	it("daily", () => {
		const label = timezoneLabel(tz, refMs);
		expect(label.length).toBeGreaterThan(0);
		const result = describeSchedule(
			{ frequency: "daily", timezone: tz, time: "09:00" },
			refMs
		);
		expect(result).toBe(`Daily at 9:00 AM ${label}`);
		expect(result).toContain("Daily at 9:00 AM");
	});

	it("weekly includes the weekday name", () => {
		const result = describeSchedule(
			{ frequency: "weekly", timezone: tz, time: "09:00", dayOfWeek: 1 },
			refMs
		);
		expect(result).toContain("Weekly on Monday, 9:00 AM");
	});

	it("monthly includes the ordinal day", () => {
		const result = describeSchedule(
			{ frequency: "monthly", timezone: tz, time: "09:00", dayOfMonth: 31 },
			refMs
		);
		expect(result).toContain("Monthly on the 31st");
	});

	it("formats a PM time", () => {
		const result = describeSchedule(
			{ frequency: "daily", timezone: tz, time: "14:30" },
			refMs
		);
		expect(result).toContain("2:30 PM");
	});
});
