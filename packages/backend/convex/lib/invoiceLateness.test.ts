import { describe, it, expect } from "vitest";

import {
	daysLate,
	deriveInvoiceStatus,
	isPastDue,
	type StoredInvoiceStatus,
} from "./invoiceLateness";
import { localTodayUtcMidnight } from "./schedule";

const AUG_27 = Date.UTC(2026, 7, 27);
const DAY = 86_400_000;

function invoice(status: StoredInvoiceStatus, dueDate: number) {
	return { status, dueDate };
}

describe("isPastDue", () => {
	it("is false on the due day itself", () => {
		expect(isPastDue(AUG_27, AUG_27)).toBe(false);
	});

	it("is true once the due day has passed", () => {
		expect(isPastDue(AUG_27, AUG_27 + DAY)).toBe(true);
	});

	it("stays false through a due-day evening west of UTC", () => {
		// The bug this rule exists for: 8pm in New York on Aug 27 is already
		// Aug 28 in UTC, so Date.now() > dueDate reads a due-today invoice late.
		const evening = AUG_27 + 24 * 3600_000; // Aug 28 00:00 UTC = Aug 27 8pm ET
		expect(evening > AUG_27).toBe(true);
		expect(
			isPastDue(AUG_27, localTodayUtcMidnight(evening, "America/New_York"))
		).toBe(false);
	});
});

describe("deriveInvoiceStatus", () => {
	it("upgrades a past-due sent invoice to overdue", () => {
		expect(deriveInvoiceStatus(invoice("sent", AUG_27), AUG_27 + DAY)).toBe(
			"overdue"
		);
	});

	it("leaves a sent invoice due today alone", () => {
		expect(deriveInvoiceStatus(invoice("sent", AUG_27), AUG_27)).toBe("sent");
	});

	it("never un-flips a stored overdue against a future due date", () => {
		// Rescheduling is a prompt (the banner), not an automatic transition.
		expect(deriveInvoiceStatus(invoice("overdue", AUG_27 + 5 * DAY), AUG_27)).toBe(
			"overdue"
		);
	});

	it("leaves settled and unsent statuses alone", () => {
		for (const status of ["draft", "paid", "cancelled"] as const) {
			expect(deriveInvoiceStatus(invoice(status, AUG_27), AUG_27 + DAY)).toBe(
				status
			);
		}
	});
});

describe("daysLate", () => {
	it("counts whole calendar days past the deadline", () => {
		expect(daysLate(AUG_27, AUG_27 + 3 * DAY)).toBe(3);
		expect(daysLate(AUG_27, AUG_27)).toBe(0);
		expect(daysLate(AUG_27 + DAY, AUG_27)).toBe(-1);
	});
});
