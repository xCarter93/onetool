import { describe, expect, it } from "vitest";
import { groupRecurringAgreementQuotes, rowMatchesStatus } from "./quote-list-grouping";

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
		expect(result[0].synthetic).toBeUndefined();
		expect(result[0].coveredVisits?.map((visit) => visit._id)).toEqual(["visit-1", "visit-2"]);
	});

	it("keeps a visit override prominent instead of grouping it", () => {
		const result = groupRecurringAgreementQuotes([
			{ _id: "visit-1", recurringAgreement: agreement },
			{ _id: "override", recurringAgreement: { ...agreement, inherited: false } },
		]);

		expect(result.some((row) => row._id === "override" && !row.coveredVisits)).toBe(true);
	});

	it("synthesizes a non-navigable row when the agreement itself is not listed", () => {
		const result = groupRecurringAgreementQuotes([
			{ _id: "visit-1", status: "approved", sentAt: 1, recurringAgreement: agreement },
			{ _id: "visit-2", status: "declined", sentAt: 5, recurringAgreement: agreement },
		]);

		expect(result).toHaveLength(1);
		expect(result[0]._id).toBe("agreement:source");
		expect(result[0].synthetic).toBe(true);
		expect(result[0].status).toBe("approved");
		expect(result[0].sentAt).toBe(5);
		expect(result[0].coveredVisits).toHaveLength(2);
	});
});

describe("rowMatchesStatus", () => {
	it("matches on the row or on any covered visit", () => {
		const [row] = groupRecurringAgreementQuotes([
			{ _id: "source", status: "approved", sentAt: 3 },
			{ _id: "visit-1", status: "declined", sentAt: 2, recurringAgreement: agreement },
		]);

		expect(rowMatchesStatus(row, "approved")).toBe(true);
		expect(rowMatchesStatus(row, "declined")).toBe(true);
		expect(rowMatchesStatus(row, "expired")).toBe(false);
	});
});
