// Edit locks for client-visible quote/invoice content.
//
// Inline line-item and pricing editing on record pages must not rewrite a
// document a client has already acted on. These helpers are the single place
// that decides "is this record's content still editable"; status transitions,
// payment recording, and every other flow stay unlocked.
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/** Quote statuses whose content is frozen. `expired` stays editable (re-quote). */
const LOCKED_QUOTE_STATUSES = new Set<Doc<"quotes">["status"]>([
	"approved",
	"declined",
]);

/** Invoice statuses whose content is frozen. */
const LOCKED_INVOICE_STATUSES = new Set<Doc<"invoices">["status"]>([
	"paid",
	"cancelled",
]);

/**
 * Payment-row statuses that mean money actually moved. The `payments` table is
 * an installment SCHEDULE — `createFromQuote` and `sendToClient` both insert
 * "pending" rows on invoices nobody has paid yet, so mere row existence must
 * never lock. Only settled rows do.
 */
const SETTLED_PAYMENT_STATUSES = new Set<Doc<"payments">["status"]>([
	"paid",
	"refunded",
]);

/**
 * Throw when a quote's client-visible content may no longer be edited.
 * Approved and declined quotes are frozen; draft/sent/expired stay editable.
 */
export function assertQuoteContentEditable(quote: Doc<"quotes">): void {
	if (LOCKED_QUOTE_STATUSES.has(quote.status)) {
		throw new ConvexError({
			code: "CONFLICT",
			message: `QUOTE_LOCKED: this quote is ${quote.status} and its line items, pricing and terms can no longer be edited. Duplicate it to build a revised quote.`,
		});
	}
}

/**
 * Throw when an invoice's client-visible content may no longer be edited:
 * the invoice is paid/cancelled, or any payment against it has settled
 * (paid, refunded, or disputed).
 */
export async function assertInvoiceContentEditable(
	ctx: QueryCtx | MutationCtx,
	invoice: Doc<"invoices">
): Promise<void> {
	if (LOCKED_INVOICE_STATUSES.has(invoice.status)) {
		throw new ConvexError({
			code: "CONFLICT",
			message: `INVOICE_LOCKED: this invoice is ${invoice.status} and its line items and pricing can no longer be edited.`,
		});
	}

	if (await hasSettledPayment(ctx, invoice._id)) {
		throw new ConvexError({
			code: "CONFLICT",
			message:
				"INVOICE_LOCKED: a payment has been recorded against this invoice, so its line items and pricing can no longer be edited.",
		});
	}
}

/**
 * True when any payment row for the invoice represents money that moved.
 * Collect-then-`some` rather than an indexed `.filter()`: installment counts
 * per invoice are single digits, and it keeps the disputed check in plain JS.
 */
async function hasSettledPayment(
	ctx: QueryCtx | MutationCtx,
	invoiceId: Id<"invoices">
): Promise<boolean> {
	const paymentRows = await ctx.db
		.query("payments")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
		.collect();

	return paymentRows.some(
		(row) => SETTLED_PAYMENT_STATUSES.has(row.status) || row.disputed === true
	);
}

/**
 * Stamp a quote's content timestamp. Used by mutations that change
 * client-visible content but do not otherwise patch the parent (e.g. reorder).
 */
export async function touchQuoteContent(
	ctx: MutationCtx,
	quoteId: Id<"quotes">
): Promise<void> {
	await ctx.db.patch(quoteId, { contentUpdatedAt: Date.now() });
}

/** Stamp an invoice's content timestamp. See touchQuoteContent. */
export async function touchInvoiceContent(
	ctx: MutationCtx,
	invoiceId: Id<"invoices">
): Promise<void> {
	await ctx.db.patch(invoiceId, { contentUpdatedAt: Date.now() });
}
