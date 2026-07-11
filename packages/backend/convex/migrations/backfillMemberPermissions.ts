import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { isAdminRole } from "../lib/permissions";
import {
	DEFAULT_MEMBER_PERMISSIONS,
	PERMISSIONS_VERSION,
} from "../lib/permissionKeys";

/**
 * Granular RBAC Phase 1 (PRD §7) one-shot backfill: seeds
 * DEFAULT_MEMBER_PERMISSIONS onto every existing `organizationMemberships` row
 * that is a plain member. Owner rows (`organizations.ownerUserId`) and admin
 * rows (`isAdminRole(role)`) are LEFT NULL — they short-circuit to "all" in the
 * resolver (PRD §4.1), so stored grants on them would only be dormant noise.
 *
 * Idempotent — rows that already carry a `permissions` field are skipped, so a
 * re-run (or a row already seeded by `ensureMembership`) is safe. An empty
 * `{}` counts as already-set and is never overwritten (it's a deliberate
 * "no grants" state).
 *
 * Cursor-paginated (matches portal/migrations.ts): the operator re-invokes with
 * the returned cursor until `isDone`. Org docs are memoized per batch so an org
 * with many members costs one `db.get`, not one per member.
 *
 * Operator workflow (post-deploy of the schema change):
 *   1. `npx convex run migrations/backfillMemberPermissions:backfillMemberPermissions`
 *      → { seeded, alreadySet, skippedElevated, examined, dryRun, isDone, cursor }
 *   2. While `isDone === false`, re-invoke with the returned cursor:
 *      `npx convex run migrations/backfillMemberPermissions:backfillMemberPermissions '{"cursor":"<cursor>"}'`
 *   3. `isDone === true` → the table is fully traversed.
 *
 * `dryRun` returns the proposed seed count without writing:
 *   `npx convex run migrations/backfillMemberPermissions:backfillMemberPermissions '{"dryRun":true}'`
 */
export const backfillMemberPermissions = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
		batchSize: v.optional(v.number()),
		cursor: v.optional(v.union(v.string(), v.null())),
	},
	handler: async (
		ctx,
		{ dryRun = false, batchSize = 200, cursor = null }
	) => {
		const page = await ctx.db.query("organizationMemberships").paginate({
			cursor,
			numItems: batchSize,
		});

		// Memoize org lookups within the batch (one org, many members).
		const orgCache = new Map<
			Id<"organizations">,
			Doc<"organizations"> | null
		>();
		const getOrg = async (orgId: Id<"organizations">) => {
			if (!orgCache.has(orgId)) orgCache.set(orgId, await ctx.db.get(orgId));
			return orgCache.get(orgId) ?? null;
		};

		let seeded = 0;
		let alreadySet = 0;
		let skippedElevated = 0;

		for (const membership of page.page) {
			if (membership.permissions !== undefined) {
				alreadySet++;
				continue;
			}

			const org = await getOrg(membership.orgId);
			const isOwner = org?.ownerUserId === membership.userId;
			if (isOwner || isAdminRole(membership.role)) {
				skippedElevated++;
				continue;
			}

			if (!dryRun) {
				await ctx.db.patch(membership._id, {
					permissions: { ...DEFAULT_MEMBER_PERMISSIONS },
					permissionsVersion: PERMISSIONS_VERSION,
				});
			}
			seeded++;
		}

		return {
			seeded,
			alreadySet,
			skippedElevated,
			examined: page.page.length,
			dryRun,
			isDone: page.isDone,
			cursor: page.continueCursor,
		};
	},
});
