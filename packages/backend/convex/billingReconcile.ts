import { createClerkClient } from "@clerk/backend";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Nightly billing-mirror reconcile. Clerk webhooks are best-effort; an org
 * whose mirror hasn't been written in >48h gets re-fetched from Clerk's
 * backend billing API so a missed event can neither give Business away nor
 * lock a paying customer out.
 *
 * Second pass covers the orgs the stale scan can't see — no clerkSubscriptionId
 * at all — whose trial just lapsed: their seat cap and automation status hang
 * off a single unretried scheduler shot, and a missed first webhook would
 * otherwise leave a paying org free forever.
 */

const STALE_MS = 48 * 60 * 60 * 1000;
const BATCH_LIMIT = 50;
/** How long after a trial lapse an org stays in the second pass. */
const TRIAL_LAPSE_WINDOW_MS = 48 * 60 * 60 * 1000;

export const reconcileStaleBillingMirrors = internalAction({
	args: {},
	handler: async (
		ctx
	): Promise<{
		checked: number;
		repaired: number;
		lapsedTrials: number;
		resynced: number;
	}> => {
		const secretKey = process.env.CLERK_SECRET_KEY;
		if (!secretKey) {
			throw new Error("CLERK_SECRET_KEY is not configured");
		}
		const clerk = createClerkClient({ secretKey });

		const stale: Array<{
			orgId: Id<"organizations">;
			clerkOrganizationId: string;
		}> = [];
		let cursor: string | null = null;
		while (stale.length < BATCH_LIMIT) {
			const page: {
				stale: typeof stale;
				continueCursor: string;
				isDone: boolean;
			} = await ctx.runQuery(internal.billingWebhook.listStaleBillingOrgs, {
				staleMs: STALE_MS,
				limit: BATCH_LIMIT - stale.length,
				cursor,
			});
			stale.push(...page.stale);
			if (page.isDone) break;
			cursor = page.continueCursor;
		}

		let repaired = 0;
		for (const org of stale) {
			try {
				const subscription =
					await clerk.billing.getOrganizationBillingSubscription(
						org.clerkOrganizationId
					);
				// The paid item is plan truth; free_* default-plan items ride along.
				const paidItem = subscription.subscriptionItems.find(
					(item) => item.plan?.slug && !item.plan.slug.startsWith("free_")
				);
				await ctx.runMutation(
					internal.billingWebhook.applyReconciledSubscription,
					{
						orgId: org.orgId,
						subscriptionId: subscription.id,
						planId: paidItem?.plan?.id ?? null,
						planSlug: paidItem?.plan?.slug ?? null,
						status: paidItem?.status ?? subscription.status,
						currentPeriodStart: paidItem?.periodStart ?? undefined,
					}
				);
				repaired += 1;
			} catch (error) {
				console.error(
					`Billing reconcile failed for org ${org.clerkOrganizationId}:`,
					error
				);
				await ctx.runMutation(internal.billingWebhook.markBillingSyncAttempt, {
					orgId: org.orgId,
				});
			}
		}

		const lapsedTrials: typeof stale = [];
		let trialCursor: string | null = null;
		while (lapsedTrials.length < BATCH_LIMIT) {
			const page: {
				lapsed: typeof stale;
				continueCursor: string;
				isDone: boolean;
			} = await ctx.runQuery(internal.billingWebhook.listLapsedTrialOrgs, {
				lapsedWithinMs: TRIAL_LAPSE_WINDOW_MS,
				staleMs: STALE_MS,
				limit: BATCH_LIMIT - lapsedTrials.length,
				cursor: trialCursor,
			});
			lapsedTrials.push(...page.lapsed);
			if (page.isDone) break;
			trialCursor = page.continueCursor;
		}

		let resynced = 0;
		for (const org of lapsedTrials) {
			try {
				const subscription =
					await clerk.billing.getOrganizationBillingSubscription(
						org.clerkOrganizationId
					);
				const paidItem = subscription.subscriptionItems.find(
					(item) => item.plan?.slug && !item.plan.slug.startsWith("free_")
				);
				// The mirror write stamps billingSyncedAt and re-schedules the seat
				// sync + automation reclassify these orgs would otherwise only ever
				// get from the one-shot trial wake. subscriptionId is written ONLY
				// for a real paid item — a free org must not acquire one and join
				// the stale-billing pool for good.
				await ctx.runMutation(
					internal.billingWebhook.applyReconciledSubscription,
					{
						orgId: org.orgId,
						...(paidItem ? { subscriptionId: subscription.id } : {}),
						planId: paidItem?.plan?.id ?? null,
						planSlug: paidItem?.plan?.slug ?? null,
						status: paidItem?.status ?? subscription.status,
						currentPeriodStart: paidItem?.periodStart ?? undefined,
					}
				);
				resynced += 1;
			} catch (error) {
				// Fail open: never act on a plan Clerk couldn't confirm. Leaving
				// billingSyncedAt unstamped keeps the org in tomorrow's pass while
				// it is still inside the lapse window.
				console.error(
					`Trial-lapse reconcile failed for org ${org.clerkOrganizationId}:`,
					error
				);
			}
		}

		return {
			checked: stale.length,
			repaired,
			lapsedTrials: lapsedTrials.length,
			resynced,
		};
	},
});
