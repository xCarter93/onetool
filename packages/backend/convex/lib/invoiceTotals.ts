// Shared invoice-totals helpers — the single roll-up used by invoice queries,
// payment-sum validation, and stored-total sync, so the total a client sees
// and the total payments must sum to can never diverge. Amounts are dollars;
// math delegates to lib/money.ts.
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { computeInvoiceTotals, roundCents } from "./money";
import { AggregateHelpers } from "./aggregates";

export async function calculateInvoiceTotals(
	ctx: QueryCtx | MutationCtx,
	invoiceId: Id<"invoices">,
	options?: {
		/**
		 * What to do when the invoice has no line items: "zero" computes from an
		 * empty list (query/display behavior); "stored" trusts the stored
		 * invoice.total (payment validation's legacy-invoice fallback).
		 */
		emptyFallback?: "zero" | "stored";
	}
): Promise<{ subtotal: number; total: number }> {
	const invoice = await ctx.db.get(invoiceId);
	if (!invoice) {
		throw new Error("Invoice not found");
	}

	const lineItems = await ctx.db
		.query("invoiceLineItems")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
		.collect();

	if (lineItems.length === 0 && options?.emptyFallback === "stored") {
		return {
			subtotal: roundCents(invoice.subtotal),
			total: roundCents(invoice.total),
		};
	}

	return computeInvoiceTotals({
		lineTotals: lineItems.map((item) => item.total),
		discountAmount: invoice.discountAmount,
		taxAmount: invoice.taxAmount,
	});
}

/**
 * Recompute an invoice's totals from its line items and persist them, keeping
 * the revenue/count aggregates in step. Call after any line-item write; no-ops
 * when nothing changed.
 */
export async function syncInvoiceTotals(
	ctx: MutationCtx,
	invoiceId: Id<"invoices">
): Promise<void> {
	const invoice = await ctx.db.get(invoiceId);
	if (!invoice) return;

	const { subtotal, total } = await calculateInvoiceTotals(ctx, invoiceId);

	if (invoice.subtotal === subtotal && invoice.total === total) {
		return;
	}

	await ctx.db.patch(invoiceId, { subtotal, total });
	const updated = await ctx.db.get(invoiceId);
	if (updated) {
		await AggregateHelpers.updateInvoice(ctx, invoice, updated);
	}
}
