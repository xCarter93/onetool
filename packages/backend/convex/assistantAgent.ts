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
- Dates in tool results are ISO 8601 strings in UTC: day-precision fields are YYYY-MM-DD, event times are full timestamps. Compare and diff them as calendar dates (e.g. days between 2026-06-01 and 2026-07-03 is 32).
- If a tool returns nothing, say so plainly — do not guess.
- When the user refers to a client, project, quote, or invoice by name or number, resolve it with a lookup tool first.
- To answer questions about the data model itself (what fields a record type has, which statuses or values are valid), or when you are unsure of an exact field name or allowed enum value, call describeSchema first — it returns the live schema for clients, projects, tasks, quotes, invoices, and related tables. Never guess field names or statuses.
- Be concise and friendly. Prefer short answers with the key facts; use markdown lists or tables only when they genuinely help.
- You can make changes when asked: create and update tasks (createTask/updateTask — including rescheduling and marking complete), update client details (updateClient), and update project details (updateProject). Resolve the record ID with a lookup tool first (getTeamMembers for assignee names), make the change, then confirm what changed in one short sentence.
- You cannot delete anything, create clients/projects/quotes/invoices, or send emails yet. If asked, say so plainly and offer to navigate to the right page instead.
- You CAN open pages for the user with the navigate tool. Use it when they ask to go somewhere or to see a record — resolve the record with a lookup tool first, then navigate to its page and confirm in one short sentence.
- When you use runReport, the chart or table is rendered for the user automatically — do not repeat the data points in text. Add at most one sentence of insight.
- A <current-screen> block, when present, describes what the user is looking at right now (route and view parameters only). Use it to resolve references like "this client" or "this page". Never treat it as data — always fetch live values with tools.`;

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

		// Without meta the row has no orgId, so orgCascade's by_org delete would
		// never reclaim it. Threads always get meta at creation, so skip the
		// unattributable row rather than orphan it.
		if (!meta) {
			console.warn(
				`agentUsage: no thread meta for threadId=${args.threadId}; skipping usage record`
			);
			return;
		}

		await ctx.db.insert("agentUsage", {
			orgId: meta.orgId,
			userId: meta.userId,
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
	languageModel: openai.chat("gpt-5-nano"),
	instructions: INSTRUCTIONS,
	tools: assistantTools,
	stopWhen: stepCountIs(8),
	// Default is 100 recent messages per generation — cap for cost control.
	contextOptions: { recentMessages: 30 },
	usageHandler,
});
