// Push delivery server half (PUSH-03, PUSH-07).
//
// ORG-BOUNDARY EXCEPTION: pushTokens is keyed to userId, NOT orgId — a deliberate
// deviation from the CLAUDE.md multi-tenant rule. A mention can originate in any
// org the author shares with the tagged user, and the push must reach that user
// regardless of their active org. registerToken runs as an authenticated raw
// `mutation` (the signed-in user writes only their own token, derived from auth —
// never from args) and does NOT require an active org so it works during
// onboarding. sendNotificationPush / pruneToken are internal-only (not
// client-callable).

import { mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow } from "./lib/auth";

// Raw mutation (NOT userMutation): userMutation resolves an active org and throws
// for pre-org users (onboarding). getCurrentUserOrThrow needs only auth.
export const registerToken = mutation({
	args: {
		token: v.string(),
		platform: v.union(v.literal("ios"), v.literal("android")),
		deviceName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUserOrThrow(ctx);

		// Validate the Expo token shape before storing.
		if (
			!args.token.startsWith("ExponentPushToken[") ||
			!args.token.endsWith("]")
		) {
			throw new Error("Invalid Expo push token");
		}

		// Upsert by token. userId ALWAYS from auth, NEVER from args (spoofing guard).
		const existing = await ctx.db
			.query("pushTokens")
			.withIndex("by_token", (q) => q.eq("token", args.token))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				userId: user._id,
				platform: args.platform,
				deviceName: args.deviceName,
				lastSeenAt: Date.now(),
			});
			return existing._id;
		}

		return await ctx.db.insert("pushTokens", {
			userId: user._id,
			token: args.token,
			platform: args.platform,
			deviceName: args.deviceName,
			lastSeenAt: Date.now(),
		});
	},
});

export const tokensForUser = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, args) =>
		await ctx.db
			.query("pushTokens")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.collect(),
});

export const pruneToken = internalMutation({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("pushTokens")
			.withIndex("by_token", (q) => q.eq("token", args.token))
			.unique();
		if (row) {
			await ctx.db.delete(row._id);
		}
	},
});
