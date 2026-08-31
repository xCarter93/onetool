/**
 * The one lateness rule, shared by backend, workspace, portal and mobile.
 *
 * `dueDate` is UTC midnight of a calendar day, so an invoice is late only once
 * that day has fully passed — and passed in the ORG's timezone, which is the
 * clock `invoiceOverdue.sweepOrgOverdueInvoices` persists against. Comparing to
 * `Date.now()` instead calls a due-today invoice late for every viewer west of
 * UTC and disagrees with the stored status hours later.
 *
 * Callers supply the clock: `localTodayUtcMidnight(Date.now(), org.timezone)`
 * from `lib/schedule`. Argument types are structural so mobile and the portal
 * can import this without pulling in Convex server code.
 */

export type StoredInvoiceStatus =
	| "draft"
	| "sent"
	| "paid"
	| "overdue"
	| "cancelled";

export interface DatedInvoice {
	status: StoredInvoiceStatus;
	dueDate: number;
}

/** True once the deadline's calendar day has fully passed in the org's zone. */
export function isPastDue(dueDate: number, todayUtcMidnight: number): boolean {
	return dueDate < todayUtcMidnight;
}

/**
 * Stored status, upgraded to `overdue` when a sent invoice's due day has
 * passed. A stored `overdue` is never downgraded here even against a future
 * due date — un-flipping is a prompt, not an automatic transition.
 */
export function deriveInvoiceStatus(
	invoice: DatedInvoice,
	todayUtcMidnight: number
): StoredInvoiceStatus {
	if (invoice.status === "sent" && isPastDue(invoice.dueDate, todayUtcMidnight))
		return "overdue";
	return invoice.status;
}

/** Whole calendar days past the deadline; 0 or less when not yet late. */
export function daysLate(dueDate: number, todayUtcMidnight: number): number {
	return Math.round((todayUtcMidnight - dueDate) / 86_400_000);
}
