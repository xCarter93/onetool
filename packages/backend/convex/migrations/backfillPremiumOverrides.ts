import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * One-shot backfill: stamps `hasPremiumFeatureAccess = true` on the users and
 * organizations named in the passed Clerk ID lists.
 *
 * Context: the manual premium override lives in Clerk `public_metadata` and
 * previously reached us ONLY through the JWT, so identity-less contexts (the
 * scheduled-automation cron) could not see it and skipped every run for
 * override-premium orgs. The webhook sync now mirrors the flag onto the docs,
 * but only fires on future user.updated / organization.updated events — this
 * backfill seeds the orgs and users that were already overridden.
 *
 * Takes an EXPLICIT ID list rather than enumerating Clerk (which would need a
 * CLERK_SECRET_KEY in the Convex environment). Source the ids from the admin
 * console, which already lists override-premium users and orgs.
 *
 * Only ever sets the flag TRUE. Revocation is not backfilled: nothing has the
 * field set before this runs, so there is nothing stale to clear, and every
 * later change (grant or revoke) arrives via the webhook.
 *
 * Idempotent — a doc already stamped is reported as `alreadySet`, so re-runs
 * are safe. Unknown ids are reported in `notFound` rather than throwing, so one
 * typo doesn't abort the batch.
 *
 * Operator workflow (post-deploy of the schema change):
 *   1. Dry run first — confirm the resolved counts match the admin console:
 *      `npx convex run migrations/backfillPremiumOverrides:backfillPremiumOverrides \
 *        '{"clerkUserIds":["user_abc"],"clerkOrganizationIds":["org_xyz"],"dryRun":true}'`
 *      -> { users: {...}, organizations: {...}, dryRun: true }
 *   2. Re-run without `dryRun` to write.
 *   3. Verify: the target org's next scheduled run should execute rather than
 *      record `Skipped`.
 */
export const backfillPremiumOverrides = internalMutation({
	args: {
		clerkUserIds: v.optional(v.array(v.string())),
		clerkOrganizationIds: v.optional(v.array(v.string())),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		{ clerkUserIds = [], clerkOrganizationIds = [], dryRun = false }
	) => {
		const users = {
			updated: 0,
			alreadySet: 0,
			notFound: [] as string[],
		};

		// Deduped: a repeated id would otherwise be counted twice under dryRun (no
		// write lands, so the second pass counts it as `updated` again) — and dryRun
		// counts are what the operator reconciles against the admin console.
		for (const externalId of new Set(clerkUserIds)) {
			const user = await ctx.db
				.query("users")
				.withIndex("by_external_id", (q) => q.eq("externalId", externalId))
				.first();

			if (!user) {
				users.notFound.push(externalId);
				continue;
			}
			if (user.hasPremiumFeatureAccess === true) {
				users.alreadySet++;
				continue;
			}
			if (!dryRun) {
				await ctx.db.patch(user._id, { hasPremiumFeatureAccess: true });
			}
			users.updated++;
		}

		const organizations = {
			updated: 0,
			alreadySet: 0,
			notFound: [] as string[],
		};

		for (const clerkOrganizationId of new Set(clerkOrganizationIds)) {
			const org = await ctx.db
				.query("organizations")
				.withIndex("by_clerk_org", (q) =>
					q.eq("clerkOrganizationId", clerkOrganizationId)
				)
				.first();

			if (!org) {
				organizations.notFound.push(clerkOrganizationId);
				continue;
			}
			if (org.hasPremiumFeatureAccess === true) {
				organizations.alreadySet++;
				continue;
			}
			if (!dryRun) {
				await ctx.db.patch(org._id, { hasPremiumFeatureAccess: true });
			}
			organizations.updated++;
		}

		return { users, organizations, dryRun };
	},
});
