import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../lib/triggers";
import { syncQuoteTotals } from "../lib/quoteTotals";

const BATCH_SIZE = 100;

/**
 * Recompute stored quote totals for rows written before syncQuoteTotals
 * existed (2026-07-15); portal/quotes.list now serves them as-is. Idempotent:
 * rows already correct are skipped without a write. Run once from the
 * dashboard: migrations/backfillQuoteTotals:backfillQuoteTotals {}.
 */
export const backfillQuoteTotals = internalMutation({
	args: { cursor: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const page = await ctx.db
			.query("quotes")
			.paginate({ cursor: args.cursor ?? null, numItems: BATCH_SIZE });
		for (const quote of page.page) {
			await syncQuoteTotals(ctx, quote._id);
		}
		if (!page.isDone) {
			await ctx.scheduler.runAfter(
				0,
				internal.migrations.backfillQuoteTotals.backfillQuoteTotals,
				{ cursor: page.continueCursor }
			);
		}
		return { scanned: page.page.length, isDone: page.isDone };
	},
});
