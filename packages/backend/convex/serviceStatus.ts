import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";

// Internal mutation to update service statuses (called from action)
export const updateStatuses = internalMutation({
	args: {
		services: v.array(
			v.object({
				name: v.string(),
				provider: v.string(),
				status: v.string(),
				updated: v.optional(v.string()),
			})
		),
		checkedAt: v.number(),
	},
	handler: async (ctx, args) => {
		// Upsert each service status (update if exists, insert if not)
		for (const service of args.services) {
			const existing = await ctx.db
				.query("serviceStatus")
				.withIndex("by_service", (q) => q.eq("serviceName", service.name))
				.first();

			if (existing) {
				await ctx.db.patch(existing._id, {
					status: service.status as
						| "operational"
						| "degraded"
						| "partial_outage"
						| "major_outage"
						| "unknown",
					lastChecked: args.checkedAt,
					lastUpdated: service.updated
						? new Date(service.updated).getTime()
						: args.checkedAt,
				});
			} else {
				await ctx.db.insert("serviceStatus", {
					serviceName: service.name,
					provider: service.provider,
					status: service.status as
						| "operational"
						| "degraded"
						| "partial_outage"
						| "major_outage"
						| "unknown",
					lastChecked: args.checkedAt,
					lastUpdated: service.updated
						? new Date(service.updated).getTime()
						: args.checkedAt,
				});
			}
		}
	},
});

// INTENTIONAL: raw public query — global read-only service status data.
export const getAll = query({
	handler: async (ctx) => {
		return await ctx.db.query("serviceStatus").collect();
	},
});
