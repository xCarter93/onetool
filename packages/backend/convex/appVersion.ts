import { query } from "./_generated/server";
import { internalMutation } from "./lib/triggers";
import { v } from "convex/values";

// Deliberately public raw query: returns only the live deployment's generated
// URL (no org data) so workspace clients can compare against their own build.
export const get = query({
	args: {},
	handler: async (ctx) => {
		const doc = await ctx.db.query("appVersion").first();
		return doc ? { deploymentUrl: doc.deploymentUrl } : null;
	},
});

// Rollback payloads carry only deployment IDs (no URL), and clients can't
// compare IDs — so a rollback clears the singleton instead. No client toasts
// until the next promote records a URL again.
export const clear = internalMutation({
	args: {},
	handler: async (ctx) => {
		const existing = await ctx.db.query("appVersion").first();
		if (existing) {
			await ctx.db.delete(existing._id);
		}
	},
});

// Called by the Vercel deploy webhook (http.ts) after signature verification.
export const record = internalMutation({
	args: { deploymentUrl: v.string(), commitSha: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const existing = await ctx.db.query("appVersion").first();
		if (existing) {
			if (existing.deploymentUrl === args.deploymentUrl) return;
			await ctx.db.patch(existing._id, {
				deploymentUrl: args.deploymentUrl,
				commitSha: args.commitSha,
				deployedAt: Date.now(),
			});
		} else {
			await ctx.db.insert("appVersion", {
				deploymentUrl: args.deploymentUrl,
				commitSha: args.commitSha,
				deployedAt: Date.now(),
			});
		}
	},
});
