import type { Doc, Id } from "../_generated/dataModel";
import { roundCents, sumMoney } from "./money";
import { DateUtils } from "./shared";

/**
 * Shared payment-row derivations for the money surfaces (businessHealth, the
 * admin dashboard stats, the portal). All amounts are DOLLARS (lib/money.ts).
 *
 * Money that came back out is never collected money: a fully refunded row flips
 * to status "refunded", a partially refunded one stays "paid" and carries a
 * cumulative `refundedAmount`. Read the kept amount through `collectedAmount`
 * rather than `paymentAmount`, or a partial refund silently reads as full.
 */

export type SettledPayment = Doc<"payments"> & { paidAt: number };

export function settledPayments(payments: Doc<"payments">[]): SettledPayment[] {
	return payments.filter(
		(p): p is SettledPayment => p.status === "paid" && p.paidAt != null
	);
}

/** Dollars actually kept from a payment row, net of refunds. */
export function collectedAmount(payment: Doc<"payments">): number {
	if (payment.status !== "paid") return 0;
	return Math.max(
		0,
		roundCents(payment.paymentAmount - (payment.refundedAmount ?? 0))
	);
}

/** An installment the client can still pay. */
export function isPayableRow(payment: Doc<"payments">): boolean {
	return (
		payment.status !== "paid" &&
		payment.status !== "cancelled" &&
		payment.status !== "refunded"
	);
}

/** Dollars refunded on a row, whether it was refunded in full or in part. */
export function refundedAmountOf(payment: Doc<"payments">): number {
	if (payment.status === "refunded") {
		// Rows refunded before `refundedAmount` existed carry the whole amount.
		return roundCents(payment.refundedAmount ?? payment.paymentAmount);
	}
	return roundCents(payment.refundedAmount ?? 0);
}

/** What an invoice still owes given its payment rows. */
export function remainingBalance(
	invoiceTotal: number,
	payments: Doc<"payments">[]
): number {
	return Math.max(
		0,
		roundCents(invoiceTotal - sumMoney(payments.map(collectedAmount)))
	);
}

/**
 * Builds a per-invoice remaining-balance lookup from the org's payment rows.
 * Counts every "paid" row net of refunds, including ones missing paidAt.
 */
export function remainingBalanceLookup(
	payments: Doc<"payments">[]
): (invoice: Doc<"invoices">) => number {
	const collectedByInvoice = new Map<Id<"invoices">, number[]>();
	for (const payment of payments) {
		if (payment.status !== "paid") continue;
		const list = collectedByInvoice.get(payment.invoiceId) ?? [];
		list.push(collectedAmount(payment));
		collectedByInvoice.set(payment.invoiceId, list);
	}
	return (invoice) =>
		Math.max(
			0,
			roundCents(
				invoice.total - sumMoney(collectedByInvoice.get(invoice._id) ?? [])
			)
		);
}

/** "YYYY-MM" in the org's timezone (UTC when unset/invalid). */
export function monthKey(timestamp: number, timezone?: string): string {
	return DateUtils.toLocalDateString(timestamp, timezone).slice(0, 7);
}
