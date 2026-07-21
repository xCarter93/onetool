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

import {
	mutation,
	internalQuery,
	internalMutation,
	internalAction,
	type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getCurrentUserOrThrow } from "./lib/auth";
import { externalIoPool } from "./externalIoPool";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_CHUNK_SIZE = 100;

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

// Sends one push per device token in <=100-message chunks to the Expo Push API.
// Stays in the default runtime (no "use node") — bare fetch + scheduler/runMutation.
export const sendNotificationPush = internalAction({
	args: {
		taggedUserId: v.id("users"),
		title: v.string(),
		body: v.string(),
		url: v.string(),
		notificationId: v.id("notifications"),
		orgId: v.string(),
	},
	handler: async (ctx, args) => {
		const tokens = await ctx.runQuery(internal.push.tokensForUser, {
			userId: args.taggedUserId,
		});
		if (tokens.length === 0) return;

		// data carries url + notificationId + orgId so the client tap can switch
		// the active org (cross-org) then mark the notification read (PUSH-04).
		const messages = tokens.map((t) => ({
			to: t.token,
			title: args.title,
			body: args.body,
			data: {
				url: args.url,
				notificationId: args.notificationId,
				orgId: args.orgId,
			},
			sound: "default" as const,
		}));

		for (let i = 0; i < messages.length; i += EXPO_CHUNK_SIZE) {
			const chunk = messages.slice(i, i + EXPO_CHUNK_SIZE);
			const response = await fetch(EXPO_PUSH_URL, {
				method: "POST",
				headers: {
					Accept: "application/json",
					"Accept-Encoding": "gzip, deflate",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(chunk),
			});
			if (!response.ok) {
				console.error(
					`Expo push failed: ${response.status} ${response.statusText}`
				);
				continue;
			}
			const json = (await response.json()) as {
				data?: Array<{
					status?: string;
					details?: { error?: string };
				}>;
			};
			const tickets = json.data ?? [];
			// AWAIT each prune (never an un-awaited forEach) so dead tokens are removed.
			for (let idx = 0; idx < tickets.length; idx++) {
				const ticket = tickets[idx];
				if (
					ticket?.status === "error" &&
					ticket?.details?.error === "DeviceNotRegistered"
				) {
					await ctx.runMutation(internal.push.pruneToken, {
						token: chunk[idx].to,
					});
				}
			}
		}
	},
});

// v1 allowlist: ONLY the 3 mention literals push. Adding a future push type is a
// ~2-line diff (add the literal here; call enqueuePush at its creation site).
export const PUSHABLE_TYPES = new Set<string>([
	"client_mention",
	"project_mention",
	"quote_mention",
	// Workflow-automation team messages (send_team_message action).
	"automation_message",
]);

// Single extensibility seam: self-gates on PUSHABLE_TYPES, then schedules the send.
export async function enqueuePush(
	ctx: { scheduler: MutationCtx["scheduler"] },
	args: {
		notificationType: string;
		taggedUserId: Id<"users">;
		title: string;
		body: string;
		url: string;
		notificationId: Id<"notifications">;
		orgId: string;
	}
) {
	if (!PUSHABLE_TYPES.has(args.notificationType)) return;
	await ctx.scheduler.runAfter(0, internal.push.sendNotificationPush, {
		taggedUserId: args.taggedUserId,
		title: args.title,
		body: args.body,
		url: args.url,
		notificationId: args.notificationId,
		orgId: args.orgId,
	});
}

// Pool-routed variant of enqueuePush: same PUSHABLE_TYPES gate and payload,
// but dispatches sendNotificationPush through the shared externalIoPool
// (maxParallelism-bounded) instead of a raw scheduler.runAfter. Used by
// automation fan-out sites (send_notification/send_team_message), which can
// enqueue many recipients per run and would otherwise burst the deployment's
// scheduled-function slots. Other enqueuePush callers are unaffected.
export async function enqueuePushViaPool(
	ctx: { runMutation: MutationCtx["runMutation"]; runQuery: MutationCtx["runQuery"] },
	args: {
		notificationType: string;
		taggedUserId: Id<"users">;
		title: string;
		body: string;
		url: string;
		notificationId: Id<"notifications">;
		orgId: string;
	}
) {
	if (!PUSHABLE_TYPES.has(args.notificationType)) return;
	await externalIoPool.enqueueAction(ctx, internal.push.sendNotificationPush, {
		taggedUserId: args.taggedUserId,
		title: args.title,
		body: args.body,
		url: args.url,
		notificationId: args.notificationId,
		orgId: args.orgId,
	});
}
