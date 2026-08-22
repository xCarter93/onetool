import { createClerkClient } from "@clerk/backend";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Nightly billing-mirror reconcile. Clerk webhooks are best-effort; an org
 * whose mirror hasn't been written in >48h gets re-fetched from Clerk's
 * backend billing API so a missed event can neither give Business away nor
 * lock a paying customer out.
 */

const STALE_MS = 48 * 60 * 60 * 1000;
const BATCH_LIMIT = 50;

export const reconcileStaleBillingMirrors = internalAction({
	args: {},
	handler: async (ctx): Promise<{ checked: number; repaired: number }> => {
		const secretKey = process.env.CLERK_SECRET_KEY;
		if (!secretKey) {
			throw new Error("CLERK_SECRET_KEY is not configured");
		}
		const clerk = createClerkClient({ secretKey });

		const stale: Array<{
			orgId: Id<"organizations">;
			clerkOrganizationId: string;
		}> = await ctx.runQuery(internal.billingWebhook.listStaleBillingOrgs, {
			staleMs: STALE_MS,
			limit: BATCH_LIMIT,
		});

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
		return { checked: stale.length, repaired };
	},
});
