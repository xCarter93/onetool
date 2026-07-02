import { openai } from "@ai-sdk/openai";
import { Agent, stepCountIs, type UsageHandler } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { assistantTools } from "./assistantTools";

export const INSTRUCTIONS = `You are the OneTool assistant — a helpful teammate inside OneTool, a business management platform for small field-service businesses (cleaning, landscaping, HVAC, trades).

You answer questions about the user's own organization data: clients, projects, tasks, schedule, quotes, invoices, emails, documents, and business analytics.

Rules:
- Always use tools to fetch live data. Never invent clients, numbers, dates, or statuses.
- All data is already scoped to the user's organization; you never need to ask which organization.
- Monetary amounts are stored in dollars. Format as currency (e.g. $1,250.00).
- Dates in tool results are Unix timestamps in milliseconds unless stated otherwise.
- If a tool returns nothing, say so plainly — do not guess.
- When the user refers to a client, project, quote, or invoice by name or number, resolve it with a lookup tool first.
- Be concise and friendly. Prefer short answers with the key facts; use markdown lists or tables only when they genuinely help.
- You currently have read-only access. If asked to create, change, send, or delete something, explain that you can't do that yet.`;

const usageHandler: UsageHandler = async (ctx, args) => {
	await ctx.runMutation(internal.assistantAgent.recordUsage, {
		threadId: args.threadId,
		agentName: args.agentName,
		model: args.model,
		provider: args.provider,
		inputTokens: args.usage.inputTokens ?? 0,
		outputTokens: args.usage.outputTokens ?? 0,
		totalTokens: args.usage.totalTokens ?? 0,
	});
};

export const recordUsage = internalMutation({
	args: {
		threadId: v.optional(v.string()),
		agentName: v.optional(v.string()),
		model: v.string(),
		provider: v.string(),
		inputTokens: v.number(),
		outputTokens: v.number(),
		totalTokens: v.number(),
	},
	handler: async (ctx, args) => {
		const meta = args.threadId
			? await ctx.db
					.query("agentThreadMeta")
					.withIndex("by_thread", (q) => q.eq("threadId", args.threadId!))
					.unique()
			: null;

		await ctx.db.insert("agentUsage", {
			orgId: meta?.orgId,
			userId: meta?.userId,
			threadId: args.threadId,
			agentName: args.agentName,
			model: args.model,
			provider: args.provider,
			inputTokens: args.inputTokens,
			outputTokens: args.outputTokens,
			totalTokens: args.totalTokens,
		});
	},
});

export const assistantAgent = new Agent(components.agent, {
	name: "onetool-assistant",
	languageModel: openai.chat("gpt-4o-mini"),
	instructions: INSTRUCTIONS,
	tools: assistantTools,
	stopWhen: stepCountIs(8),
	// Default is 100 recent messages per generation — cap for cost control.
	contextOptions: { recentMessages: 30 },
	usageHandler,
});
