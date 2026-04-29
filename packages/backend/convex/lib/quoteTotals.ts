// Plan 14-09: shared quote-totals helper. Extracted from `quotes.ts` so both
// the workspace `quotes.get` and the portal `portal/quotes.get` (and `list`)
// can recompute totals from current line items without duplicating logic.
//
// Why this exists (UAT Gap 5): stored `quote.subtotal` / `quote.total` are
// not maintained on every line-item edit. The workspace get already calls
// `calculateQuoteTotals` and spreads the result; the portal previously
// returned the raw quote doc, so stale zeros leaked through to the detail
// page. Single source of truth here means future drift is impossible.
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { BusinessUtils } from "./shared";

export async function calculateQuoteTotals(
	ctx: QueryCtx | MutationCtx,
	quoteId: Id<"quotes">,
	options?: {
		discountEnabled?: boolean;
		discountAmount?: number;
		discountType?: "percentage" | "fixed";
		taxEnabled?: boolean;
		taxRate?: number;
	}
): Promise<{ subtotal: number; taxAmount: number; total: number }> {
	// Get all line items for the quote
	const lineItems = await ctx.db
		.query("quoteLineItems")
		.withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
		.collect();

	// Calculate subtotal
	const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

	// Apply discount if enabled
	let discountedSubtotal = subtotal;
	if (options?.discountEnabled && options.discountAmount) {
		discountedSubtotal = BusinessUtils.applyDiscount(
			subtotal,
			options.discountAmount,
			options.discountType === "percentage"
		);
	}

	// Calculate tax
	let taxAmount = 0;
	if (options?.taxEnabled && options.taxRate) {
		taxAmount = BusinessUtils.calculateTax(discountedSubtotal, options.taxRate);
	}

	// Calculate total
	const total = discountedSubtotal + taxAmount;

	return {
		subtotal,
		taxAmount,
		total,
	};
}
