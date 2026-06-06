import { internalMutation } from "../_generated/server";

export const seedServiceStatus = internalMutation({
	handler: async (ctx) => {
		const now = Date.now();
		const services = [
			{ serviceName: "convex", provider: "convex" },
			{ serviceName: "clerk_auth", provider: "clerk" },
			{ serviceName: "clerk_billing", provider: "clerk" },
			{ serviceName: "boldsign_esignature", provider: "boldsign" },
			{ serviceName: "stripe", provider: "stripe" },
		];

		for (const service of services) {
			const existing = await ctx.db
				.query("serviceStatus")
				.withIndex("by_service", (q) =>
					q.eq("serviceName", service.serviceName)
				)
				.first();

			if (!existing) {
				await ctx.db.insert("serviceStatus", {
					...service,
					status: "operational",
					lastChecked: now,
					lastUpdated: now,
				});
			}
		}
	},
});
