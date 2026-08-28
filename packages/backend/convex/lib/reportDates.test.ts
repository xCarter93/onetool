import { describe, it, expect } from "vitest";
import {
	resolveComparisonRange,
	resolveDateRangePreset,
	shiftYearBack,
} from "./reportDates";
import { DateUtils } from "./shared";
import type { DateRangePreset, ReportDateComparison } from "./reportConfig";

const ET = "America/New_York";

// Mon Jun 15 2026, 08:00 EDT (UTC-4).
const MID_YEAR = Date.UTC(2026, 5, 15, 12);
const END_OF_JUN_15 = Date.UTC(2026, 5, 16, 3, 59, 59, 999);

describe("resolveDateRangePreset", () => {
	it("returns undefined for all_time", () => {
		expect(resolveDateRangePreset("all_time", ET, MID_YEAR)).toBeUndefined();
	});

	describe("mid-year now in America/New_York", () => {
		it("resolves today", () => {
			expect(resolveDateRangePreset("today", ET, MID_YEAR)).toEqual({
				start: Date.UTC(2026, 5, 15, 4, 0, 0, 0),
				end: END_OF_JUN_15,
			});
		});

		it("resolves this_week from Sunday Jun 14 to Saturday Jun 20", () => {
			expect(resolveDateRangePreset("this_week", ET, MID_YEAR)).toEqual({
				start: Date.UTC(2026, 5, 14, 4, 0, 0, 0),
				end: Date.UTC(2026, 5, 21, 3, 59, 59, 999),
			});
		});

		it("resolves this_month to the full month, not through today", () => {
			expect(resolveDateRangePreset("this_month", ET, MID_YEAR)).toEqual({
				start: Date.UTC(2026, 5, 1, 4, 0, 0, 0),
				end: Date.UTC(2026, 6, 1, 3, 59, 59, 999),
			});
		});

		it("resolves this_quarter to Apr 1 - Jun 30", () => {
			expect(resolveDateRangePreset("this_quarter", ET, MID_YEAR)).toEqual({
				start: Date.UTC(2026, 3, 1, 4, 0, 0, 0),
				end: Date.UTC(2026, 6, 1, 3, 59, 59, 999),
			});
		});

		it("resolves this_year across both DST offsets", () => {
			expect(resolveDateRangePreset("this_year", ET, MID_YEAR)).toEqual({
				start: Date.UTC(2026, 0, 1, 5, 0, 0, 0),
				end: Date.UTC(2027, 0, 1, 4, 59, 59, 999),
			});
		});

		it("resolves last_year to the full previous calendar year", () => {
			expect(resolveDateRangePreset("last_year", ET, MID_YEAR)).toEqual({
				start: Date.UTC(2025, 0, 1, 5, 0, 0, 0),
				end: Date.UTC(2026, 0, 1, 4, 59, 59, 999),
			});
		});

		it("resolves last_7_days inclusive of today", () => {
			expect(resolveDateRangePreset("last_7_days", ET, MID_YEAR)).toEqual({
				start: Date.UTC(2026, 5, 9, 4, 0, 0, 0),
				end: END_OF_JUN_15,
			});
		});

		it("resolves last_30_days inclusive of today", () => {
			expect(resolveDateRangePreset("last_30_days", ET, MID_YEAR)).toEqual({
				start: Date.UTC(2026, 4, 17, 4, 0, 0, 0),
				end: END_OF_JUN_15,
			});
		});

		it("resolves last_90_days back across the spring DST shift", () => {
			expect(resolveDateRangePreset("last_90_days", ET, MID_YEAR)).toEqual({
				start: Date.UTC(2026, 2, 18, 4, 0, 0, 0),
				end: END_OF_JUN_15,
			});
		});

		it("starts last_7_days exactly 6 calendar days before today's local start", () => {
			const today = resolveDateRangePreset("today", ET, MID_YEAR)!;
			const window = resolveDateRangePreset("last_7_days", ET, MID_YEAR)!;
			expect(today.start - window.start).toBe(6 * 24 * 60 * 60 * 1000);
			expect(window.end).toBe(today.end);
		});
	});

	it("honors both offsets for a month spanning spring-forward", () => {
		// DST 2026 starts Sun Mar 8: Mar 1 is EST (UTC-5), Mar 31 is EDT (UTC-4).
		expect(
			resolveDateRangePreset("this_month", ET, Date.UTC(2026, 2, 15, 12))
		).toEqual({
			start: Date.UTC(2026, 2, 1, 5, 0, 0, 0),
			end: Date.UTC(2026, 3, 1, 3, 59, 59, 999),
		});
	});

	it("honors both offsets for a rolling window spanning fall-back", () => {
		// DST 2026 ends Sun Nov 1: Oct 17 start is EDT, Nov 15 end is EST.
		expect(
			resolveDateRangePreset("last_30_days", ET, Date.UTC(2026, 10, 15, 12))
		).toEqual({
			start: Date.UTC(2026, 9, 17, 4, 0, 0, 0),
			end: Date.UTC(2026, 10, 16, 4, 59, 59, 999),
		});
	});

	it("uses the tz-local date when it trails the UTC date", () => {
		// 02:00 UTC on Jun 16 is 22:00 ET on Jun 15.
		expect(
			resolveDateRangePreset("today", ET, Date.UTC(2026, 5, 16, 2))
		).toEqual({
			start: Date.UTC(2026, 5, 15, 4, 0, 0, 0),
			end: END_OF_JUN_15,
		});
	});

	it("resolves this_week across a month boundary", () => {
		// Wed Jul 1 2026 sits in the week of Sun Jun 28 - Sat Jul 4.
		expect(
			resolveDateRangePreset("this_week", ET, Date.UTC(2026, 6, 1, 12))
		).toEqual({
			start: Date.UTC(2026, 5, 28, 4, 0, 0, 0),
			end: Date.UTC(2026, 6, 5, 3, 59, 59, 999),
		});
	});

	it("falls back to UTC when no timezone is given", () => {
		expect(resolveDateRangePreset("today", undefined, MID_YEAR)).toEqual({
			start: Date.UTC(2026, 5, 15, 0, 0, 0, 0),
			end: Date.UTC(2026, 5, 15, 23, 59, 59, 999),
		});
		expect(resolveDateRangePreset("this_month", undefined, MID_YEAR)).toEqual({
			start: Date.UTC(2026, 5, 1, 0, 0, 0, 0),
			end: Date.UTC(2026, 5, 30, 23, 59, 59, 999),
		});
	});

	it("falls back to UTC for an invalid timezone instead of throwing", () => {
		expect(resolveDateRangePreset("today", "Not/AZone", MID_YEAR)).toEqual(
			resolveDateRangePreset("today", undefined, MID_YEAR)
		);
		expect(
			resolveDateRangePreset("this_year", "Not/AZone", MID_YEAR)
		).toEqual({
			start: Date.UTC(2026, 0, 1, 0, 0, 0, 0),
			end: Date.UTC(2026, 11, 31, 23, 59, 59, 999),
		});
	});
});

describe("resolveComparisonRange (R11)", () => {
	/** The comparison window of a preset range, as executeReport resolves it. */
	function forPreset(
		preset: DateRangePreset,
		kind: "previous_period" | "previous_year",
		timezone: string | undefined = ET,
		now: number = MID_YEAR
	) {
		const current = resolveDateRangePreset(preset, timezone, now)!;
		return resolveComparisonRange(
			{ kind: "preset", preset },
			{ kind },
			current,
			timezone
		);
	}

	describe("previous_period", () => {
		it("shifts today to yesterday", () => {
			expect(forPreset("today", "previous_period")).toEqual({
				start: Date.UTC(2026, 5, 14, 4, 0, 0, 0),
				end: Date.UTC(2026, 5, 15, 3, 59, 59, 999),
			});
		});

		it("shifts this_week to the Sunday–Saturday week before", () => {
			expect(forPreset("this_week", "previous_period")).toEqual({
				start: Date.UTC(2026, 5, 7, 4, 0, 0, 0),
				end: Date.UTC(2026, 5, 14, 3, 59, 59, 999),
			});
		});

		it("shifts this_month to the whole previous month", () => {
			expect(forPreset("this_month", "previous_period")).toEqual({
				start: Date.UTC(2026, 4, 1, 4, 0, 0, 0),
				end: Date.UTC(2026, 5, 1, 3, 59, 59, 999),
			});
		});

		it("shifts this_quarter to the previous quarter across the DST change", () => {
			expect(forPreset("this_quarter", "previous_period")).toEqual({
				start: Date.UTC(2026, 0, 1, 5, 0, 0, 0),
				end: Date.UTC(2026, 3, 1, 3, 59, 59, 999),
			});
		});

		it("shifts this_year to last year", () => {
			expect(forPreset("this_year", "previous_period")).toEqual(
				resolveDateRangePreset("last_year", ET, MID_YEAR)
			);
		});

		it("shifts last_year to the year before it", () => {
			expect(forPreset("last_year", "previous_period")).toEqual({
				start: Date.UTC(2024, 0, 1, 5, 0, 0, 0),
				end: Date.UTC(2025, 0, 1, 4, 59, 59, 999),
			});
		});

		it("shifts a rolling window to the immediately preceding N days", () => {
			expect(forPreset("last_7_days", "previous_period")).toEqual({
				start: Date.UTC(2026, 5, 2, 4, 0, 0, 0),
				end: Date.UTC(2026, 5, 9, 3, 59, 59, 999),
			});
			const thirty = forPreset("last_30_days", "previous_period")!;
			expect(thirty.end).toBe(
				resolveDateRangePreset("last_30_days", ET, MID_YEAR)!.start - 1
			);
			expect(DateUtils.toLocalDateString(thirty.start, ET)).toBe("2026-04-17");
		});

		it("leaves no gap between the compared windows", () => {
			for (const preset of [
				"today",
				"this_week",
				"this_month",
				"this_quarter",
				"this_year",
				"last_year",
				"last_90_days",
			] as const) {
				const current = resolveDateRangePreset(preset, ET, MID_YEAR)!;
				expect(forPreset(preset, "previous_period")!.end, preset).toBe(
					current.start - 1
				);
			}
		});
	});

	describe("previous_year", () => {
		it("maps this_month to the same month a year earlier", () => {
			expect(forPreset("this_month", "previous_year")).toEqual({
				start: Date.UTC(2025, 5, 1, 4, 0, 0, 0),
				end: Date.UTC(2025, 6, 1, 3, 59, 59, 999),
			});
		});

		it("maps a leap February to the whole (28-day) February before it", () => {
			const leapFeb = Date.UTC(2024, 1, 15, 12);
			expect(forPreset("this_month", "previous_year", ET, leapFeb)).toEqual({
				start: Date.UTC(2023, 1, 1, 5, 0, 0, 0),
				end: Date.UTC(2023, 2, 1, 4, 59, 59, 999),
			});
		});

		it("maps today and rolling windows onto the same calendar days a year earlier", () => {
			expect(forPreset("today", "previous_year")).toEqual({
				start: Date.UTC(2025, 5, 15, 4, 0, 0, 0),
				end: Date.UTC(2025, 5, 16, 3, 59, 59, 999),
			});
			const rolling = forPreset("last_7_days", "previous_year")!;
			expect(DateUtils.toLocalDateString(rolling.start, ET)).toBe("2025-06-09");
			expect(DateUtils.toLocalDateString(rolling.end, ET)).toBe("2025-06-15");
		});

		it("maps last_year to the year before it", () => {
			expect(forPreset("last_year", "previous_year")).toEqual({
				start: Date.UTC(2024, 0, 1, 5, 0, 0, 0),
				end: Date.UTC(2025, 0, 1, 4, 59, 59, 999),
			});
		});
	});

	describe("absolute ranges", () => {
		const start = Date.UTC(2026, 2, 1, 5); // Mar 1 2026 00:00 EST
		const end = Date.UTC(2026, 3, 1, 3, 59, 59, 999); // Mar 31 2026 23:59:59.999 EDT
		const range = { kind: "absolute" as const, start, end };

		it("previous_period shifts back by the span, inclusive", () => {
			const span = end - start + 1;
			expect(
				resolveComparisonRange(range, { kind: "previous_period" }, { start, end }, ET)
			).toEqual({ start: start - span, end: end - span });
		});

		it("previous_year shifts each bound back one calendar year in the org zone", () => {
			expect(
				resolveComparisonRange(range, { kind: "previous_year" }, { start, end }, ET)
			).toEqual({
				start: Date.UTC(2025, 2, 1, 5),
				end: Date.UTC(2025, 3, 1, 3, 59, 59, 999),
			});
		});

		it("previous_year clamps a Feb 29 bound to Feb 28", () => {
			const leapDay = Date.UTC(2024, 1, 29, 12);
			expect(shiftYearBack(leapDay, undefined)).toBe(Date.UTC(2023, 1, 28, 12));
		});

		it("an absolute comparison is used verbatim", () => {
			const comparison: ReportDateComparison = {
				kind: "absolute",
				start: Date.UTC(2020, 0, 1),
				end: Date.UTC(2020, 11, 31),
			};
			expect(resolveComparisonRange(range, comparison, { start, end }, ET)).toEqual({
				start: comparison.start,
				end: comparison.end,
			});
		});
	});

	describe("non-UTC org calendar", () => {
		const NZ = "Pacific/Auckland";
		const MARCH = Date.UTC(2026, 2, 15); // Mar 15 2026, 13:00 NZDT

		it("resolves both windows on the org calendar, not UTC", () => {
			const current = resolveDateRangePreset("this_month", NZ, MARCH)!;
			const previous = resolveComparisonRange(
				{ kind: "preset", preset: "this_month" },
				{ kind: "previous_period" },
				current,
				NZ
			)!;
			expect(DateUtils.toLocalDateString(previous.start, NZ)).toBe("2026-02-01");
			expect(DateUtils.toLocalDateString(previous.end, NZ)).toBe("2026-02-28");
			expect(previous.end).toBe(current.start - 1);

			const lastYear = resolveComparisonRange(
				{ kind: "preset", preset: "this_month" },
				{ kind: "previous_year" },
				current,
				NZ
			)!;
			expect(DateUtils.toLocalDateString(lastYear.start, NZ)).toBe("2025-03-01");
			expect(DateUtils.toLocalDateString(lastYear.end, NZ)).toBe("2025-03-31");
		});
	});
});
