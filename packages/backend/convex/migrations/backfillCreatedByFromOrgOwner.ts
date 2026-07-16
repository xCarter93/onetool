import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * One-shot backfill: stamps `createdByUserId` = the row's organization owner
 * (`organizations.ownerUserId`) on every pre-existing row that lacks a creator,
 * across the five main object tables. Rows created after the create-mutation
 * change already carry `createdByUserId`, so they are skipped.
 *
 * Runs ONE table per invocation (the `table` arg) and is cursor-paginated —
 * re-invoke with the returned cursor until `isDone`, then move to the next table.
 *
 * Idempotent — rows that already have `createdByUserId` are skipped
 * (`alreadySet`), so re-runs are safe. Org→owner lookups are cached per batch.
 *
 * Run ONCE immediately post-deploy (no `createdBefore` needed then — nothing new
 * exists yet). For a SAFE later re-run, pass `createdBefore` = the deploy
 * timestamp (epoch ms): rows created after it (automation/public-created, left
 * null by design) are skipped (`skippedTooNew`) instead of stamped.
 *
 * Operator workflow (post-deploy of the schema change), for each of the five
 * tables clients | projects | quotes | invoices | tasks:
 *   1. `npx convex run migrations/backfillCreatedByFromOrgOwner:backfillCreatedByFromOrgOwner '{"table":"clients"}'`
 *      -> { table, updated, alreadySet, skippedNoOwner, examined, dryRun, isDone, cursor }
 *   2. While `isDone === false`, re-invoke with the cursor:
 *      `... '{"table":"clients","cursor":"<cursor>"}'`
 *   3. `isDone === true` -> repeat from step 1 with the next table name.
 *
 * Dry run (no writes): add `"dryRun":true` to the args.
 */
export const backfillCreatedByFromOrgOwner = internalMutation({
	args: {
		table: v.union(
			v.literal("clients"),
			v.literal("projects"),
			v.literal("quotes"),
			v.literal("invoices"),
			v.literal("tasks")
		),
		dryRun: v.optional(v.boolean()),
		batchSize: v.optional(v.number()),
		cursor: v.optional(v.union(v.string(), v.null())),
		// Only stamp rows created before this epoch-ms (safe later re-run: pass the
		// deploy timestamp so post-deploy system/public rows stay null by design).
		createdBefore: v.optional(v.number()),
	},
	handler: async (
		ctx,
		{ table, dryRun = false, batchSize = 200, cursor = null, createdBefore }
	) => {
		const page = await ctx.db
			.query(table)
			.paginate({ cursor, numItems: batchSize });

		// Cache org -> ownerUserId within the batch (one org, many rows).
		const ownerCache = new Map<Id<"organizations">, Id<"users"> | null>();
		const getOwner = async (orgId: Id<"organizations">) => {
			if (!ownerCache.has(orgId)) {
				const org = await ctx.db.get(orgId);
				ownerCache.set(orgId, org?.ownerUserId ?? null);
			}
			return ownerCache.get(orgId) ?? null;
		};

		let updated = 0;
		let alreadySet = 0;
		let skippedNoOwner = 0;
		let skippedTooNew = 0;

		for (const row of page.page) {
			if (row.createdByUserId !== undefined) {
				alreadySet++;
				continue;
			}
			if (createdBefore !== undefined && row._creationTime >= createdBefore) {
				skippedTooNew++;
				continue;
			}
			const owner = await getOwner(row.orgId);
			if (!owner) {
				skippedNoOwner++;
				continue;
			}
			if (!dryRun) {
				await ctx.db.patch(row._id, { createdByUserId: owner });
			}
			updated++;
		}

		const result = {
			table,
			updated,
			alreadySet,
			skippedNoOwner,
			skippedTooNew,
			examined: page.page.length,
			dryRun,
			isDone: page.isDone,
			cursor: page.continueCursor,
		};
		console.log(`[backfillCreatedByFromOrgOwner] ${JSON.stringify(result)}`);
		return result;
	},
});
