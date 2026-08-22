import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { systemMutation } from "./lib/factories";

/**
 * Usage tracking for plan limits
 */

export interface UsageStats {
	clientsCount: number;
	activeProjectsPerClient: Record<string, number>; // clientId -> count
	esignaturesSentThisMonth: number;
}

/** Free-plan monthly e-signature send cap. Mirrors apps/web plan-limits.ts. */
export const FREE_ESIGNATURES_PER_MONTH = 5;

/** Start-of-month timestamp (local server time), used for the monthly rollover. */
function startOfCurrentMonth(): number {
	const startOfMonth = new Date(Date.now());
	startOfMonth.setDate(1);
	startOfMonth.setHours(0, 0, 0, 0);
	return startOfMonth.getTime();
}

/**
 * E-signatures sent by an org in the current month. Uses the cached counter
 * when it is current, else recounts from the documents table (monthly rollover).
 * Shared with the server-side send-cap gate so both agree.
 */
export async function computeEsignaturesSentThisMonth(
	ctx: QueryCtx,
	organization: Doc<"organizations">,
	orgId: Id<"organizations">
): Promise<number> {
	const monthStart = startOfCurrentMonth();
	const needsReset =
		!organization.usageTracking ||
		!organization.usageTracking.lastEsignatureReset ||
		organization.usageTracking.lastEsignatureReset < monthStart;

	if (needsReset) {
		const documents = await ctx.db
			.query("documents")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		return documents.filter(
			(doc) => doc.boldsign?.sentAt && doc.boldsign.sentAt >= monthStart
		).length;
	}

	return organization.usageTracking?.esignaturesSentThisMonth ?? 0;
}

/**
 * Increment e-signature count when a document is sent
 * Called from BoldSign webhook handler
 */
export const incrementEsignatureCount = systemMutation({
	args: {},
	handler: async (ctx, args) => {
		const organization = await ctx.db.get(ctx.orgId);
		if (!organization) {
			console.error("Organization not found for e-signature increment");
			return;
		}

		// Check if we need to reset monthly counter
		const now = Date.now();
		const startOfMonth = new Date(now);
		startOfMonth.setDate(1);
		startOfMonth.setHours(0, 0, 0, 0);
		const monthStart = startOfMonth.getTime();

		const needsReset =
			!organization.usageTracking ||
			!organization.usageTracking.lastEsignatureReset ||
			organization.usageTracking.lastEsignatureReset < monthStart;

		if (needsReset) {
			// Reset counter for new month
			const currentClientsCount = organization.usageTracking?.clientsCount || 0;
			await ctx.db.patch(ctx.orgId, {
				usageTracking: {
					clientsCount: currentClientsCount,
					esignaturesSentThisMonth: 1,
					lastEsignatureReset: monthStart,
				},
			});
		} else {
			// Increment existing counter
			const currentCount =
				organization.usageTracking?.esignaturesSentThisMonth || 0;
			const currentClientsCount = organization.usageTracking?.clientsCount || 0;
			const lastReset =
				organization.usageTracking?.lastEsignatureReset || Date.now();
			await ctx.db.patch(ctx.orgId, {
				usageTracking: {
					clientsCount: currentClientsCount,
					esignaturesSentThisMonth: currentCount + 1,
					lastEsignatureReset: lastReset,
				},
			});
		}
	},
});
