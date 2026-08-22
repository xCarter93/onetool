import { internalMutation } from "../lib/triggers";
import { v } from "convex/values";
import { entitlementsFromDocs, isFeatureAllowed } from "../lib/entitlements";

/**
 * Slice A one-shot: flip every ACTIVE automation whose org resolves free to
 * `paused_plan` (publish became Business-only). Resumable on upgrade via
 * toggleActive; nothing is deleted and the published snapshot is kept.
 *
 * Plan resolution mirrors the executor exactly — (org doc, creator doc) via
 * entitlementsFromDocs — so an automation the executor would still run (org
 * or creator override, subscription, trial, grace) is never paused.
 *
 * Idempotent: only `active` rows are touched, so re-runs are no-ops for rows
 * already flipped. `nextRunAt` is cleared like a manual pause.
 *
 * Operator workflow (run AFTER the Slice A prod Convex deploy):
 *   1. `npx convex run migrations/pausePublishedAutomationsOnFreeOrgs:pausePublishedAutomationsOnFreeOrgs '{"dryRun":true}'`
 *   2. Verify the counts (expected ~0 paused — no real free org has published
 *      automations), then re-run without dryRun.
 */
export const pausePublishedAutomationsOnFreeOrgs = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, { dryRun = false }) => {
		let paused = 0;
		let keptBusiness = 0;
		const active = await ctx.db
			.query("workflowAutomations")
			.withIndex("by_status_nextRunAt", (q) => q.eq("status", "active"))
			.collect();
		for (const automation of active) {
			const org = await ctx.db.get(automation.orgId);
			const creator = automation.createdBy
				? await ctx.db.get(automation.createdBy)
				: null;
			const { plan } = entitlementsFromDocs(org, creator);
			if (isFeatureAllowed(plan, "automationPublish")) {
				keptBusiness++;
				continue;
			}
			paused++;
			if (!dryRun) {
				await ctx.db.patch(automation._id, {
					status: "paused_plan",
					nextRunAt: undefined,
					updatedAt: Date.now(),
				});
			}
		}
		return { scanned: active.length, paused, keptBusiness, dryRun };
	},
});
