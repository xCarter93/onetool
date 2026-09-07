import { describe, expect, it } from "vitest";
import {
	DEFAULT_RECURRENCE_FORM,
	applyMonthlyChoice,
	applyPreset,
	describeRecurrence,
	durationCountFromOffset,
	durationOffsetFromCount,
	formatVisitRange,
	inferPreset,
	monthlyChoice,
	monthlyChoiceOptions,
	reanchorRecurrenceForm,
	recurrenceRuleToForm,
	serializeRecurrenceRule,
	validateDurationCount,
	validateRecurrenceForm,
} from "./rule";

describe("recurrence form", () => {
	it("serializes a seasonal last-weekday rule with an inclusive end date", () => {
		const rule = serializeRecurrenceRule({
			...DEFAULT_RECURRENCE_FORM,
			preset: "custom",
			frequency: "monthly",
			interval: 2,
			monthlyMode: "ordinal",
			ordinal: -1,
			ordinalWeekday: 5,
			months: [12, 6, 6],
			endKind: "until",
			until: "2027-12-31",
		});
		expect(rule).toEqual({
			frequency: "monthly",
			interval: 2,
			ordinalWeekday: { ordinal: -1, weekday: 5 },
			months: [6, 12],
			end: { kind: "until", date: "2027-12-31" },
		});
	});

	it("maps biweekly to a two-week rule", () => {
		const value = applyPreset(DEFAULT_RECURRENCE_FORM, "biweekly");
		expect(serializeRecurrenceRule({ ...value, weekdays: [1] })).toMatchObject({
			frequency: "weekly",
			interval: 2,
			weekdays: [1],
		});
	});

	it("infers the cadence dropdown value from a stored rule", () => {
		expect(inferPreset({ frequency: "weekly", interval: 2 })).toBe("biweekly");
		expect(inferPreset({ frequency: "monthly", interval: 1 })).toBe("monthly");
		expect(inferPreset({ frequency: "monthly", interval: 3 })).toBe("custom");
		expect(
			recurrenceRuleToForm({ frequency: "weekly", interval: 1, weekdays: [1] })
				.preset,
		).toBe("weekly");
	});

	it("requires selectors for weekly and numeric monthly schedules", () => {
		expect(validateRecurrenceForm(DEFAULT_RECURRENCE_FORM)).toBe(
			"Choose at least one weekday.",
		);
		expect(
			validateRecurrenceForm({
				...DEFAULT_RECURRENCE_FORM,
				frequency: "monthly",
				monthlyMode: "monthDays",
			}),
		).toBe("Choose at least one day of the month.");
	});

	it("describes schedules as sentences", () => {
		expect(describeRecurrence({ frequency: "daily", interval: 2 })).toBe(
			"Every 2 days. Never ends.",
		);
		expect(
			describeRecurrence({
				frequency: "weekly",
				interval: 1,
				weekdays: [1, 5],
			}),
		).toBe("Every week on Mon, Fri. Never ends.");
		expect(
			describeRecurrence(
				{
					frequency: "monthly",
					interval: 1,
					monthDays: [15],
					end: { kind: "count", count: 12 },
				},
				{ durationCount: 3 },
			),
		).toBe(
			"Every month on the 15th. Each visit lasts 3 days. Ends after 12 visits.",
		);
		expect(
			describeRecurrence({
				frequency: "monthly",
				interval: 1,
				ordinalWeekday: { ordinal: -1, weekday: 3 },
				end: { kind: "until", date: "2027-12-31" },
			}),
		).toBe("Every month on the last Wednesday. Ends Dec 31, 2027.");
	});

	it("offers monthly choices computed from the anchor date", () => {
		// 2026-09-30 is the fifth Wednesday and the last day of September.
		const options = monthlyChoiceOptions("2026-09-30", "monthly");
		expect(options.map((option) => option.label)).toEqual([
			"the 30th",
			"the fifth Wednesday",
			"the last Wednesday",
			"Specific dates or weekday…",
		]);
		expect(monthlyChoiceOptions("2026-09-15", "yearly")[0].label).toBe(
			"Sep 15th",
		);
		expect(monthlyChoiceOptions("2026-09-15", "monthly")).toHaveLength(3);
	});

	it("round-trips monthly choices through the form value", () => {
		const anchor = "2026-09-30";
		const base = { ...DEFAULT_RECURRENCE_FORM, frequency: "monthly" as const };
		const day = applyMonthlyChoice(base, "day", anchor);
		expect(day.monthDays).toEqual([30]);
		expect(monthlyChoice(day, anchor)).toBe("day");
		const last = applyMonthlyChoice(base, "last", anchor);
		expect(last).toMatchObject({
			monthlyMode: "ordinal",
			ordinal: -1,
			ordinalWeekday: 3,
		});
		expect(monthlyChoice(last, anchor)).toBe("last");
		expect(monthlyChoice({ ...base, monthDays: [1, 15] }, anchor)).toBe(
			"custom",
		);
	});

	it("re-anchors derived selections when the start date moves", () => {
		const monthly = {
			...DEFAULT_RECURRENCE_FORM,
			frequency: "monthly" as const,
			monthDays: [15],
		};
		expect(
			reanchorRecurrenceForm(monthly, "2026-09-15", "2026-09-20").monthDays
		).toEqual([20]);
		expect(
			reanchorRecurrenceForm(
				{ ...monthly, monthDays: [1, 15] },
				"2026-09-15",
				"2026-09-20"
			).monthDays
		).toEqual([1, 15]);
		// 2026-09-15 is the third Tuesday; 2026-09-30 is the fifth Wednesday.
		expect(
			reanchorRecurrenceForm(
				{ ...monthly, monthlyMode: "ordinal", ordinal: 3, ordinalWeekday: 2 },
				"2026-09-15",
				"2026-09-30"
			)
		).toMatchObject({ ordinal: 5, ordinalWeekday: 3 });
		expect(
			reanchorRecurrenceForm(
				{ ...DEFAULT_RECURRENCE_FORM, weekdays: [2] },
				"2026-09-15",
				"2026-09-16"
			).weekdays
		).toEqual([3]);
		expect(
			reanchorRecurrenceForm(
				{ ...DEFAULT_RECURRENCE_FORM, weekdays: [1, 2] },
				"2026-09-15",
				"2026-09-16"
			).weekdays
		).toEqual([1, 2]);
	});

	it("converts between the stored offset and the visible day count", () => {
		expect(durationCountFromOffset(undefined)).toBe(1);
		expect(durationCountFromOffset(2)).toBe(3);
		expect(durationOffsetFromCount(1)).toBe(0);
		expect(validateDurationCount(0)).not.toBeNull();
		expect(validateDurationCount(366)).not.toBeNull();
		expect(validateDurationCount(3)).toBeNull();
	});

	it("formats visit ranges across month and year boundaries", () => {
		expect(formatVisitRange("2026-10-15", 1)).toBe("Oct 15, 2026");
		expect(formatVisitRange("2026-10-15", 3)).toBe("Oct 15–17, 2026");
		expect(formatVisitRange("2026-10-30", 3)).toBe("Oct 30 – Nov 1, 2026");
		expect(formatVisitRange("2026-12-31", 2)).toBe(
			"Dec 31, 2026 – Jan 1, 2027",
		);
	});
});
