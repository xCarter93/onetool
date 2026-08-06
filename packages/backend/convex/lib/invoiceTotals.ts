// Shared invoice-totals helpers — the single roll-up used by invoice queries,
// payment-sum validation, and stored-total sync, so the total a client sees
// and the total payments must sum to can never diverge. Amounts are dollars;
// math delegates to lib/money.ts.
//
// TWO PRICING MODES, decided per invoice by `resolvePricingMode`:
//   "legacy"  — none of discountEnabled/discountType/taxEnabled/taxRate is set.
//               discountAmount/taxAmount are pre-computed dollars, subtracted
//               and added flat. Behavior is byte-for-byte what it always was;
//               existing invoices must never see their stored totals move.
//   "quote"   — any of those fields is set (the inline pricing panel writes
//               them). Math is exactly computeQuoteTotals: percentage-or-fixed
//               discount off the subtotal, then taxRate applied to the
//               discounted subtotal, with taxAmount DERIVED (not caller-set).
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { computeInvoiceTotals, computeQuoteTotals, roundCents } from "./money";

export type InvoicePricingMode = "legacy" | "quote";

export interface InvoiceTotals {
	subtotal: number;
	total: number;
	/**
	 * Derived in "quote" mode. In "legacy" mode this echoes the stored value
	 * (possibly undefined) — callers must not persist it back.
	 */
	taxAmount: number | undefined;
	pricingMode: InvoicePricingMode;
}

/**
 * An invoice uses quote-style pricing as soon as any of the quote-style fields
 * is present. Legacy rows have none of them, so they keep the old flat math.
 */
export function resolveInvoicePricingMode(
	invoice: Doc<"invoices">
): InvoicePricingMode {
	return invoice.discountEnabled !== undefined ||
		invoice.discountType !== undefined ||
		invoice.taxEnabled !== undefined ||
		invoice.taxRate !== undefined
		? "quote"
		: "legacy";
}

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
): Promise<InvoiceTotals> {
	const invoice = await ctx.db.get(invoiceId);
	if (!invoice) {
		throw new Error("Invoice not found");
	}

	const pricingMode = resolveInvoicePricingMode(invoice);

	const lineItems = await ctx.db
		.query("invoiceLineItems")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
		.collect();

	if (lineItems.length === 0 && options?.emptyFallback === "stored") {
		return {
			subtotal: roundCents(invoice.subtotal),
			total: roundCents(invoice.total),
			taxAmount: invoice.taxAmount,
			pricingMode,
		};
	}

	if (pricingMode === "quote") {
		const totals = computeQuoteTotals({
			lineAmounts: lineItems.map((item) => item.total),
			discountEnabled: invoice.discountEnabled,
			discountAmount: invoice.discountAmount,
			discountType: invoice.discountType,
			taxEnabled: invoice.taxEnabled,
			taxRate: invoice.taxRate,
		});
		return { ...totals, pricingMode };
	}

	const totals = computeInvoiceTotals({
		lineTotals: lineItems.map((item) => item.total),
		discountAmount: invoice.discountAmount,
		taxAmount: invoice.taxAmount,
	});
	return { ...totals, taxAmount: invoice.taxAmount, pricingMode };
}

/**
 * Recompute an invoice's totals from its line items and persist them. Call
 * after any line-item write; no-ops when nothing changed.
 *
 * `touchContent` stamps contentUpdatedAt in the SAME patch, so a line-item
 * edit costs one parent write rather than two.
 */
export async function syncInvoiceTotals(
	ctx: MutationCtx,
	invoiceId: Id<"invoices">,
	options?: { emptyFallback?: "zero" | "stored"; touchContent?: boolean }
): Promise<void> {
	const invoice = await ctx.db.get(invoiceId);
	if (!invoice) return;

	const { subtotal, total, taxAmount, pricingMode } =
		await calculateInvoiceTotals(ctx, invoiceId, options);

	const patch: Partial<Doc<"invoices">> = {};
	if (invoice.subtotal !== subtotal) patch.subtotal = subtotal;
	if (invoice.total !== total) patch.total = total;
	// taxAmount is derived only under quote-style pricing; legacy invoices keep
	// whatever the caller stored.
	if (pricingMode === "quote" && invoice.taxAmount !== taxAmount) {
		patch.taxAmount = taxAmount;
	}
	if (options?.touchContent) patch.contentUpdatedAt = Date.now();

	if (Object.keys(patch).length === 0) return;

	await ctx.db.patch(invoiceId, patch);
}
