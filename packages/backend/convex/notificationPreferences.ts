// Per-category push notification preferences (Slice 8).
//
// Three categories, each defaulting ON. A row is written lazily by `set` — most
// users never have one. Absent row and absent field both mean ON, so shipping a
// new category can never silently mute someone who already toggled another.
//
// The push gate (push.ts sendNotificationPush) reads these via
// `effectiveForUserOrg`, which takes a CLERK org id because that is what the
// push payload carries; it resolves to the Convex organizations id internally.

import { internalQuery } from "./_generated/server";
import { userQuery, userMutation } from "./lib/factories";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/** All three categories resolved to concrete booleans. */
export interface EffectivePushPreferences {
	mentions: boolean;
	automations: boolean;
	paymentsApprovals: boolean;
}

/** Category keys, in the order the settings UI renders them. */
export type PushPreferenceCategory = keyof EffectivePushPreferences;

/**
 * Maps a notification type to the category that gates it.
 * Returns null for unknown types — callers must fail OPEN (send) on null so a
 * newly added pushable type is never muted by an unrelated toggle.
 */
export function categoryForNotificationType(
	notificationType: string
): PushPreferenceCategory | null {
	switch (notificationType) {
		case "client_mention":
		case "project_mention":
		case "quote_mention":
			return "mentions";
		case "automation_message":
			return "automations";
		case "quote_approved":
		case "payment_received":
			return "paymentsApprovals";
		default:
			return null;
	}
}

async function readEffective(
	ctx: QueryCtx,
	userId: Id<"users">,
	orgId: Id<"organizations">
): Promise<EffectivePushPreferences> {
	const row = await ctx.db
		.query("notificationPreferences")
		.withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId))
		.unique();
	// `?? true` covers both "no row" and "row without this field".
	return {
		mentions: row?.mentions ?? true,
		automations: row?.automations ?? true,
		paymentsApprovals: row?.paymentsApprovals ?? true,
	};
}

/** Effective push preferences for the signed-in user in their active org. */
export const get = userQuery({
	args: {},
	handler: async (ctx): Promise<EffectivePushPreferences> =>
		await readEffective(ctx, ctx.user._id, ctx.orgId),
});

/**
 * Upsert the signed-in user's preferences for their active org. Only the
 * categories present in args are written; omitted ones keep their stored value.
 */
export const set = userMutation({
	args: {
		mentions: v.optional(v.boolean()),
		automations: v.optional(v.boolean()),
		paymentsApprovals: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<EffectivePushPreferences> => {
		const patch: {
			mentions?: boolean;
			automations?: boolean;
			paymentsApprovals?: boolean;
		} = {};
		if (args.mentions !== undefined) patch.mentions = args.mentions;
		if (args.automations !== undefined) patch.automations = args.automations;
		if (args.paymentsApprovals !== undefined) {
			patch.paymentsApprovals = args.paymentsApprovals;
		}

		const existing = await ctx.db
			.query("notificationPreferences")
			.withIndex("by_user_org", (q) =>
				q.eq("userId", ctx.user._id).eq("orgId", ctx.orgId)
			)
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, patch);
		} else {
			await ctx.db.insert("notificationPreferences", {
				userId: ctx.user._id,
				orgId: ctx.orgId,
				...patch,
			});
		}

		return await readEffective(ctx, ctx.user._id, ctx.orgId);
	},
});

/**
 * Push-gate read. `clerkOrgId` (NOT a Convex organizations id) because the push
 * pipeline carries the Clerk id end-to-end for the client-side org switch on
 * tap. Fails OPEN — an unresolvable org yields all-true rather than a silent
 * drop.
 */
export const effectiveForUserOrg = internalQuery({
	args: { userId: v.id("users"), clerkOrgId: v.string() },
	handler: async (ctx, args): Promise<EffectivePushPreferences> => {
		const org = await ctx.db
			.query("organizations")
			.withIndex("by_clerk_org", (q) =>
				q.eq("clerkOrganizationId", args.clerkOrgId)
			)
			.unique();
		if (!org) {
			return { mentions: true, automations: true, paymentsApprovals: true };
		}
		return await readEffective(ctx, args.userId, org._id);
	},
});
