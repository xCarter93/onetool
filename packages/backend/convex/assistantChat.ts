import {
	listUIMessages,
	saveMessage,
	syncStreams,
	vStreamArgs,
} from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";
import { assistantAgent, INSTRUCTIONS } from "./assistantAgent";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import { userMutation, userQuery } from "./lib/factories";

/**
 * AI assistant chat plumbing.
 *
 * Flow: client calls `createThread` (once), then per message `sendMessage`
 * (mutation — optimistic-update friendly) followed by `streamResponse`
 * (action, called directly from the client so the user's Clerk identity
 * propagates into every tool's ctx.runQuery — org scoping depends on this;
 * scheduled functions would run unauthenticated).
 */

const TITLE_MAX_LENGTH = 60;
// Cost guard until Phase 3 rate limiting: bound what a single message can send
// to the model.
const PROMPT_MAX_LENGTH = 4000;

export const createThread = userMutation({
	args: {},
	handler: async (ctx) => {
		const { threadId } = await assistantAgent.createThread(ctx, {
			userId: ctx.user._id,
		});
		await ctx.db.insert("agentThreadMeta", {
			threadId,
			orgId: ctx.orgId,
			userId: ctx.user._id,
			lastMessageAt: Date.now(),
		});
		return { threadId };
	},
});

export const sendMessage = userMutation({
	args: { threadId: v.string(), prompt: v.string() },
	handler: async (ctx, args) => {
		if (args.prompt.length > PROMPT_MAX_LENGTH) {
			throw new Error(
				`Message is too long (max ${PROMPT_MAX_LENGTH} characters)`
			);
		}
		const meta = await ctx.db
			.query("agentThreadMeta")
			.withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
			.unique();
		if (!meta || meta.orgId !== ctx.orgId || meta.userId !== ctx.user._id) {
			throw new Error("Thread not found");
		}

		const { messageId } = await saveMessage(ctx, components.agent, {
			threadId: args.threadId,
			userId: ctx.user._id,
			prompt: args.prompt,
		});

		await ctx.db.patch(meta._id, {
			lastMessageAt: Date.now(),
			...(meta.title ? {} : { title: args.prompt.slice(0, TITLE_MAX_LENGTH) }),
		});

		return { messageId };
	},
});

/** Auth check usable from the action: identity propagates via ctx.runQuery. */
export const authorizeThread = internalQuery({
	args: { threadId: v.string() },
	handler: async (ctx, args): Promise<{ userId: Id<"users"> }> => {
		const user = await getCurrentUserOrThrow(ctx);
		const orgId = await getCurrentUserOrgId(ctx);
		const meta = await ctx.db
			.query("agentThreadMeta")
			.withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
			.unique();
		if (!meta || meta.orgId !== orgId || meta.userId !== user._id) {
			throw new Error("Thread not found");
		}
		return { userId: user._id };
	},
});

export const streamResponse = action({
	args: { threadId: v.string(), promptMessageId: v.string() },
	// Explicit return type: this module is in the generated api graph, so
	// inferring through ctx.runQuery(internal…) would create a type cycle.
	handler: async (ctx, args): Promise<void> => {
		const { userId } = await ctx.runQuery(
			internal.assistantChat.authorizeThread,
			{ threadId: args.threadId }
		);

		// Per-call `system` overrides the agent's static instructions, letting us
		// anchor relative dates ("this week", "overdue") to the real current date.
		const today = new Date().toISOString();
		await assistantAgent.streamText(
			ctx,
			{ threadId: args.threadId, userId },
			{
				promptMessageId: args.promptMessageId,
				system: `${INSTRUCTIONS}\n\nThe current date and time is ${today} (UTC).`,
			},
			{ saveStreamDeltas: true }
		);
	},
});

export const listThreadMessages = userQuery({
	args: {
		threadId: v.string(),
		paginationOpts: paginationOptsValidator,
		streamArgs: vStreamArgs,
	},
	handler: async (ctx, args) => {
		const meta = await ctx.db
			.query("agentThreadMeta")
			.withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
			.unique();
		if (!meta || meta.orgId !== ctx.orgId || meta.userId !== ctx.user._id) {
			throw new Error("Thread not found");
		}

		const paginated = await listUIMessages(ctx, components.agent, {
			threadId: args.threadId,
			paginationOpts: args.paginationOpts,
		});
		const streams = await syncStreams(ctx, components.agent, {
			threadId: args.threadId,
			streamArgs: args.streamArgs,
		});
		return { ...paginated, streams };
	},
});

export const listThreads = userQuery({
	args: {},
	handler: async (ctx) => {
		const threads = await ctx.db
			.query("agentThreadMeta")
			.withIndex("by_org_user", (q) =>
				q.eq("orgId", ctx.orgId).eq("userId", ctx.user._id)
			)
			.order("desc")
			.take(50);
		return threads.map((t) => ({
			threadId: t.threadId,
			title: t.title ?? "New conversation",
			lastMessageAt: t.lastMessageAt,
		}));
	},
});
