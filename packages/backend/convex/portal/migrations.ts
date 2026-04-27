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
 * [Review fix CR-06] Cursor-paginated. The previous implementation used
 * `take(batchSize)` which always returned the FIRST N rows by insertion
 * order — every invocation rescanned the same prefix and never advanced
 * past the first batch. Tables larger than `batchSize` would silently drop
 * rows beyond N. Now we use Convex's cursor-based `paginate({ cursor,
 * numItems })` and return the next cursor so the operator can iterate to
 * completion.
 *
 * Operator workflow (post-deploy of Plan 13-02):
 *   1. Initial run: `npx convex run portal/migrations:backfillPortalAccessIds`
 *      Returns `{ assigned, alreadySet, examined, dryRun, isDone, cursor }`.
 *   2. While `isDone === false`, re-invoke passing the returned `cursor`:
 *      `npx convex run portal/migrations:backfillPortalAccessIds '{"cursor":"<cursor>"}'`
 *   3. When `isDone === true`, the table is fully traversed.
 *
 * Optional dryRun arg returns the proposed assignment count without writing.
 *   npx convex run portal/migrations:backfillPortalAccessIds '{"dryRun":true}'
 */
export const backfillPortalAccessIds = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
		batchSize: v.optional(v.number()),
		cursor: v.optional(v.union(v.string(), v.null())),
	},
	handler: async (
		ctx,
		{ dryRun = false, batchSize = 200, cursor = null }
	) => {
		const page = await ctx.db.query("clients").paginate({
			cursor,
			numItems: batchSize,
		});

		let assigned = 0;
		let alreadySet = 0;

		for (const client of page.page) {
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

		return {
			assigned,
			alreadySet,
			examined: page.page.length,
			dryRun,
			isDone: page.isDone,
			cursor: page.continueCursor,
		};
	},
});
