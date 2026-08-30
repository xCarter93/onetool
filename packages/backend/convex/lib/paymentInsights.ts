import type { Doc, Id } from "../_generated/dataModel";
import { roundCents, sumMoney } from "./money";
import { DateUtils } from "./shared";

/**
 * Shared payment-row derivations for the money surfaces (businessHealth, the
 * admin dashboard stats). All amounts are DOLLARS (lib/money.ts).
 *
 * "Settled" means a payment row with status "paid" — refunded rows are never
 * collected money and restore the invoice's remaining balance.
 */

export type SettledPayment = Doc<"payments"> & { paidAt: number };

export function settledPayments(payments: Doc<"payments">[]): SettledPayment[] {
	return payments.filter(
		(p): p is SettledPayment => p.status === "paid" && p.paidAt != null
	);
}

/**
 * Builds a per-invoice remaining-balance lookup from the org's payment rows.
 * Counts every "paid" row, including ones missing paidAt.
 */
export function remainingBalanceLookup(
	payments: Doc<"payments">[]
): (invoice: Doc<"invoices">) => number {
	const paidByInvoice = new Map<Id<"invoices">, number[]>();
	for (const payment of payments) {
		if (payment.status !== "paid") continue;
		const list = paidByInvoice.get(payment.invoiceId) ?? [];
		list.push(payment.paymentAmount);
		paidByInvoice.set(payment.invoiceId, list);
	}
	return (invoice) =>
		Math.max(
			0,
			roundCents(invoice.total - sumMoney(paidByInvoice.get(invoice._id) ?? []))
		);
}

/** "YYYY-MM" in the org's timezone (UTC when unset/invalid). */
export function monthKey(timestamp: number, timezone?: string): string {
	return DateUtils.toLocalDateString(timestamp, timezone).slice(0, 7);
}
