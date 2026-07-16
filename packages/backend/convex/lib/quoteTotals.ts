// Shared quote-totals helpers. Both the workspace `quotes.get` and the portal
// `portal/quotes.get`/`list` recompute totals from current line items here, and
// line-item mutations call `syncQuoteTotals` so the stored `quote.subtotal`/
// `taxAmount`/`total` (and the revenue aggregates keyed on `total`) never go
// stale. All math delegates to lib/money.ts — amounts are dollars.
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { computeQuoteTotals } from "./money";
import { AggregateHelpers } from "./aggregates";

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
	const lineItems = await ctx.db
		.query("quoteLineItems")
		.withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
		.collect();

	return computeQuoteTotals({
		lineAmounts: lineItems.map((item) => item.amount),
		...options,
	});
}

/**
 * Recompute a quote's totals from its line items and persist them, keeping the
 * dashboard aggregates in step. Call after any line-item write; no-ops when
 * nothing changed.
 */
export async function syncQuoteTotals(
	ctx: MutationCtx,
	quoteId: Id<"quotes">
): Promise<void> {
	const quote = await ctx.db.get(quoteId);
	if (!quote) return;

	const totals = await calculateQuoteTotals(ctx, quoteId, {
		discountEnabled: quote.discountEnabled,
		discountAmount: quote.discountAmount,
		discountType: quote.discountType,
		taxEnabled: quote.taxEnabled,
		taxRate: quote.taxRate,
	});

	if (
		quote.subtotal === totals.subtotal &&
		quote.taxAmount === totals.taxAmount &&
		quote.total === totals.total
	) {
		return;
	}

	await ctx.db.patch(quoteId, totals);
	const updated = await ctx.db.get(quoteId);
	if (updated) {
		await AggregateHelpers.updateQuote(ctx, quote, updated);
	}
}
