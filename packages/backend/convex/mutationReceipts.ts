import { v } from "convex/values";
import { internalMutation } from "./lib/triggers";
import { internal } from "./_generated/api";

/** Idempotency-key receipts (PRD-mobile-offline §4.6) only need to outlive a device's outbox retry window. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DELETE_BATCH = 500;

/**
 * Daily retention sweep for mutationReceipts. Self-rechains when a full
 * batch was deleted, since more may remain past the cutoff.
 */
export const cleanupExpired = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx): Promise<null> => {
		const cutoff = Date.now() - RETENTION_MS;
		const rows = await ctx.db
			.query("mutationReceipts")
			.withIndex("by_created", (q) => q.lt("createdAt", cutoff))
			.take(DELETE_BATCH);

		for (const row of rows) {
			await ctx.db.delete(row._id);
		}

		if (rows.length === DELETE_BATCH) {
			await ctx.scheduler.runAfter(0, internal.mutationReceipts.cleanupExpired, {});
		}
		return null;
	},
});
