import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
	cascadeDeleteOrgDataPage,
	CASCADE_PAGE_SIZE,
	ORG_SCOPED_CASCADE_TABLES,
} from "./lib/orgCascade";

/**
 * org-deletion cascade — top-level registered module.
 *
 * The bounded deletion routine lives in lib/orgCascade.ts (a plain helper).
 * The internal.* entry points that wrap it MUST live here so they resolve as
 * internal.orgCascade.* (internal references only resolve to top-level
 * convex/*.ts modules). Mirrors eventBus.processEvents.
 */

// Per-table sample size for the reconciliation backstop sweep.
const RECONCILE_SAMPLE = 100;

/**
 * Self-rescheduling chunk worker — drains one bounded page then reschedules
 * itself until the routine reports done. Mirrors eventBus.processEvents.
 */
export const cascadeDeleteOrgDataChunk = internalMutation({
	args: { orgId: v.id("organizations") },
	handler: async (ctx, args) => {
		const { done } = await cascadeDeleteOrgDataPage(
			ctx,
			args.orgId,
			CASCADE_PAGE_SIZE
		);
		if (!done) {
			await ctx.scheduler.runAfter(
				0,
				internal.orgCascade.cascadeDeleteOrgDataChunk,
				{ orgId: args.orgId }
			);
		}
	},
});

/**
 * Daily backstop sweep for partial-failure org-deletion cascades. Scans a
 * bounded sample of org-scoped tables (INCLUDING organizationMemberships) for
 * rows whose orgId no longer resolves to an organizations row, then ALWAYS
 * schedules a full cascade per distinct orphan orgId. Because the cascade
 * excludes memberships, this handler directly deletes orphan membership rows.
 * Bounded sample — a very large remnant may take multiple daily runs to drain.
 */
export const reconcileOrphanedOrgData = internalMutation({
	args: {},
	handler: async (ctx) => {
		const orphanOrgIds = new Set<Id<"organizations">>();

		// Sweep a bounded sample of each cascade-covered table for orphan orgIds.
		// A plain bounded sample (not index-scoped) is sufficient for this
		// rare-orphan backstop; the primary path is the synchronous schedule at
		// the deletion entry points.
		for (const table of ORG_SCOPED_CASCADE_TABLES) {
			const sample = await ctx.db.query(table).take(RECONCILE_SAMPLE);
			for (const row of sample) {
				const orgId = row.orgId as Id<"organizations">;
				const org = await ctx.db.get(orgId);
				if (org === null) {
					orphanOrgIds.add(orgId);
				}
			}
		}

		// organizationMemberships — excluded from the cascade, swept + deleted here.
		const memberships = await ctx.db
			.query("organizationMemberships")
			.take(RECONCILE_SAMPLE);
		for (const membership of memberships) {
			const org = await ctx.db.get(membership.orgId);
			if (org === null) {
				orphanOrgIds.add(membership.orgId);
				await ctx.db.delete(membership._id);
			}
		}

		// ALWAYS schedule a full cascade per distinct orphan orgId.
		for (const orgId of orphanOrgIds) {
			await ctx.scheduler.runAfter(
				0,
				internal.orgCascade.cascadeDeleteOrgDataChunk,
				{ orgId }
			);
		}

		return { orphanOrgCount: orphanOrgIds.size };
	},
});
