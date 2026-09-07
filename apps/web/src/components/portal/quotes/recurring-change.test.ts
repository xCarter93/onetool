import { describe, expect, it } from "vitest";
import { describeRecurringChange, type PortalRecurringAgreement } from "./recurring-change";

const base: PortalRecurringAgreement = {
	revisionId: "revision-2",
	reference: "Q-1042",
	revisionNumber: 2,
	sourceQuoteId: "source",
	sourceVisible: true,
	seriesId: "series",
	isAgreement: true,
	inherited: false,
	visitOverride: false,
	agreementPerVisitTotal: 125,
	previousRevision: null,
};

describe("describeRecurringChange", () => {
	it("frames a visit override against the standing agreement price", () => {
		expect(
			describeRecurringChange({ ...base, isAgreement: false, visitOverride: true, serviceDate: Date.UTC(2026, 8, 14, 12) }),
		).toEqual({
			label: "Change to the visit on Sep 14, 2026",
			detail: "Your agreement Q-1042 is $125.00 per visit",
		});
	});

	it("compares a revision with the revision it replaces", () => {
		expect(
			describeRecurringChange({
				...base,
				previousRevision: {
					revisionNumber: 1,
					perVisitTotal: 110,
					schedule: { rule: { frequency: "weekly", interval: 1, weekdays: [1] }, anchorDateKey: "2026-09-07", timezone: "America/New_York" },
					billingMode: "per_visit",
					paymentRule: { type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] },
				},
			}),
		).toEqual({
			label: "Revised agreement, replaces revision 1",
			detail: "Revision 1 was $110.00 per visit. Schedule: Weekly on Mon, ongoing until cancelled. Payment: 100% due 30 days after issue",
		});
	});

	it("still flags a revision when the prior one is not readable", () => {
		expect(describeRecurringChange(base)?.label).toBe("Revised agreement, revision 2");
	});

	it("returns null for a first agreement and for inherited copies", () => {
		expect(describeRecurringChange({ ...base, revisionNumber: 1 })).toBeNull();
		expect(describeRecurringChange({ ...base, isAgreement: false, inherited: true })).toBeNull();
		expect(describeRecurringChange(null)).toBeNull();
	});
});
