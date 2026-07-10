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
import { SCREEN_CONTEXT_MAX_LENGTH } from "./lib/assistantShared";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import { userMutation, userQuery } from "./lib/factories";
import { hasPremiumAccess } from "./lib/permissions";
import { rateLimiter } from "./rateLimits";

const PREMIUM_REQUIRED_MESSAGE =
	"The AI assistant is available on the Business plan. Upgrade to use it.";

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
// Cost guard: bound what a single message can send to the model.
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
		if (!(await hasPremiumAccess(ctx))) {
			throw new Error(PREMIUM_REQUIRED_MESSAGE);
		}
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

/** Auth + plan check usable from the action: identity propagates via
 *  ctx.runQuery, and hasPremiumAccess needs a database-backed ctx. */
export const authorizeThread = internalQuery({
	args: { threadId: v.string() },
	handler: async (ctx, args): Promise<{ userId: Id<"users"> }> => {
		if (!(await hasPremiumAccess(ctx))) {
			throw new Error(PREMIUM_REQUIRED_MESSAGE);
		}
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
	args: {
		threadId: v.string(),
		promptMessageId: v.string(),
		// Client-serialized snapshot of what the user is looking at (route +
		// view parameters only, never data values — see useScreenContext).
		screenContext: v.optional(v.string()),
	},
	// Explicit return type: this module is in the generated api graph, so
	// inferring through ctx.runQuery(internal…) would create a type cycle.
	handler: async (ctx, args): Promise<void> => {
		// authorizeThread also enforces the plan gate — this action can be
		// invoked directly with an existing promptMessageId, and generation
		// must never start for free-plan callers.
		const { userId } = await ctx.runQuery(
			internal.assistantChat.authorizeThread,
			{ threadId: args.threadId }
		);

		// Rate-limit here, not in sendMessage: this action can be re-invoked
		// directly with an existing promptMessageId, each call costing a full
		// LLM generation.
		await rateLimiter.limit(ctx, "assistantMessage", {
			key: userId,
			throws: true,
		});

		// Per-call `system` overrides the agent's static instructions, letting us
		// anchor relative dates ("this week", "overdue") to the real current date.
		const today = new Date().toISOString();
		// Oversized context is dropped, not truncated — cut JSON is worse than none.
		const screenBlock =
			args.screenContext &&
			args.screenContext.length <= SCREEN_CONTEXT_MAX_LENGTH
				? `\n\n<current-screen>\n${args.screenContext}\n</current-screen>`
				: "";
		await assistantAgent.streamText(
			ctx,
			{ threadId: args.threadId, userId },
			{
				promptMessageId: args.promptMessageId,
				system: `${INSTRUCTIONS}\n\nThe current date and time is ${today} (UTC).${screenBlock}`,
				// No reasoningEffort here: gpt-5.4 chat-completions rejects
				// reasoning_effort combined with function tools (400), and the
				// 5.4 models already default to effort "none" — the fast path.
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
