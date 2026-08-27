import { describe, it, expect } from "vitest";
import { resolveDateRangePreset } from "./reportDates";

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
