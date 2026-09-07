import { describe, expect, it } from "vitest";
import {
	DEFAULT_RECURRENCE_FORM,
	applyPreset,
	serializeRecurrenceRule,
	validateRecurrenceForm,
	describeRecurrence,
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

	it("requires selectors for weekly and numeric monthly schedules", () => {
		expect(validateRecurrenceForm(DEFAULT_RECURRENCE_FORM)).toBe(
			"Choose at least one weekday."
		);
		expect(
			validateRecurrenceForm({
				...DEFAULT_RECURRENCE_FORM,
				frequency: "monthly",
				monthlyMode: "monthDays",
			})
		).toBe("Choose at least one day of the month.");
	});

	it("describes intervals and selected weekdays", () => {
		expect(describeRecurrence({ frequency: "daily", interval: 2 })).toBe(
			"every 2 days"
		);
		expect(
			describeRecurrence({ frequency: "weekly", interval: 1, weekdays: [1, 5] })
		).toBe("weekly on Mon, Fri");
	});
});
