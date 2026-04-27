import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * [Review fix #8] One-shot backfill: assigns a UUID-shaped portalAccessId to
 * every clients row missing one. Idempotent — running it twice is safe (rows
 * already populated are skipped).
 *
 * Without this migration, every existing `clients` row in production has
 * `portalAccessId: undefined`, so portal links cannot be generated until a
 * client is manually patched. This migration closes that gap.
 *
 * Operator command (post-deploy of Plan 13-02):
 *   npx convex run portal/migrations:backfillPortalAccessIds
 *
 * Optional dryRun arg returns the proposed assignment count without writing.
 *   npx convex run portal/migrations:backfillPortalAccessIds '{"dryRun":true}'
 *
 * For very large client tables, the operator can split the run by passing a
 * smaller `batchSize` and re-running until `assigned === 0`.
 */
export const backfillPortalAccessIds = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
		batchSize: v.optional(v.number()),
	},
	handler: async (ctx, { dryRun = false, batchSize = 200 }) => {
		const all = await ctx.db.query("clients").take(batchSize);
		let assigned = 0;
		let alreadySet = 0;

		for (const client of all) {
			if (client.portalAccessId) {
				alreadySet++;
				continue;
			}
			const newId = crypto.randomUUID();
			if (!dryRun) {
				await ctx.db.patch(client._id, { portalAccessId: newId });
			}
			assigned++;
		}

		return { assigned, alreadySet, examined: all.length, dryRun };
	},
});
