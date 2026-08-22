import { createClerkClient } from "@clerk/backend";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { entitlementsFromDocs } from "./lib/entitlements";
import { BUSINESS_SEATS, FREE_SEATS } from "./lib/planMatrix";

/**
 * Clerk seat-cap sync (PRD §4 Seats). Clerk enforces seats natively via
 * per-plan limits for subscription orgs (dashboard config); this action
 * covers the orgs Clerk's plan limits can't see — trial and override orgs —
 * by writing the resolved plan's seat count to the org's own
 * maxAllowedMemberships. Idempotent (same value is a no-op write in Clerk);
 * nobody is ever removed on a downgrade — Clerk only blocks new invites.
 *
 * Scheduled from: org creation (reverse trial → Business seats, plus a
 * wake-up at trialEndsAt to sync back down), the Clerk org webhook (override
 * grants/revokes), and every billing patch (webhooks + nightly reconcile).
 */

export const getSeatSyncInfo = internalQuery({
	args: { orgId: v.id("organizations") },
	returns: v.union(
		v.null(),
		v.object({ clerkOrganizationId: v.string(), seats: v.number() })
	),
	handler: async (ctx, args) => {
		const org = await ctx.db.get(args.orgId);
		if (!org) return null;
		const { plan } = entitlementsFromDocs(org);
		return {
			clerkOrganizationId: org.clerkOrganizationId,
			seats: plan === "business" ? BUSINESS_SEATS : FREE_SEATS,
		};
	},
});

export const syncSeatCap = internalAction({
	args: { orgId: v.id("organizations") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const info = await ctx.runQuery(internal.seatSync.getSeatSyncInfo, {
			orgId: args.orgId,
		});
		if (!info) return null;
		const secretKey = process.env.CLERK_SECRET_KEY;
		if (!secretKey) throw new Error("CLERK_SECRET_KEY is not configured");
		const clerk = createClerkClient({ secretKey });
		await clerk.organizations.updateOrganization(info.clerkOrganizationId, {
			maxAllowedMemberships: info.seats,
		});
		return null;
	},
});
