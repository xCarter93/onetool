import { describe, expect, it } from "vitest";
import { groupRecurringAgreementQuotes } from "./quote-list-grouping";

const agreement = {
	reference: "Q-1042",
	sourceQuoteId: "source",
	inherited: true,
};

describe("groupRecurringAgreementQuotes", () => {
	it("groups covered visits beneath their visible agreement source", () => {
		const result = groupRecurringAgreementQuotes([
			{ _id: "source", title: "Annual service", sentAt: 3 },
			{ _id: "visit-1", title: "September visit", sentAt: 2, recurringAgreement: agreement },
			{ _id: "visit-2", title: "October visit", sentAt: 1, recurringAgreement: agreement },
		]);

		expect(result).toHaveLength(1);
		expect(result[0].coveredVisits?.map((visit) => visit._id)).toEqual(["visit-1", "visit-2"]);
	});

	it("keeps a visit override prominent instead of grouping it", () => {
		const result = groupRecurringAgreementQuotes([
			{ _id: "visit-1", recurringAgreement: agreement },
			{ _id: "override", recurringAgreement: { ...agreement, inherited: false } },
		]);

		expect(result.some((row) => row._id === "override" && !row.coveredVisits)).toBe(true);
	});
});
