"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const checkServiceStatus = internalAction({
	handler: async (ctx) => {
		try {
			// Fetch all three APIs in parallel for better performance
			const [convexResponse, clerkResponse, boldsignResponse] =
				await Promise.all([
					fetch("https://status.convex.dev/api/v2/summary.json"),
					fetch("https://status.clerk.com/api/v2/summary.json"),
					fetch("https://status.boldsign.com/api/v2/summary.json"),
				]);

			const [convexData, clerkData, boldsignData] = (await Promise.all([
				convexResponse.json(),
				clerkResponse.json(),
				boldsignResponse.json(),
			])) as [
				{ components: Array<{ name: string; status: string; updated_at?: string }> },
				{ components: Array<{ name: string; status: string; updated_at?: string }> },
				{ components: Array<{ name: string; group?: boolean; status: string; updated_at?: string }> },
			];

			// Extract specific service statuses
			const convexDatabase = convexData.components.find(
				(c: { name: string }) => c.name === "Database Services"
			);
			const convexFunctions = convexData.components.find(
				(c: { name: string }) => c.name === "Function Runtime"
			);
			const clerkAuth = clerkData.components.find(
				(c: { name: string }) => c.name === "User and authentication"
			);
			const clerkBilling = clerkData.components.find(
				(c: { name: string }) => c.name === "Billing"
			);
			const boldsignAPI = boldsignData.components.find(
				(c) => c.name === "API" && c.group === true
			);

			// Update database with results (with error handling for missing data)
			await ctx.runMutation(internal.serviceStatus.updateStatuses, {
				services: [
					{
						name: "convex_database",
						provider: "convex",
						status: convexDatabase?.status || "unknown",
						updated: convexDatabase?.updated_at,
					},
					{
						name: "convex_functions",
						provider: "convex",
						status: convexFunctions?.status || "unknown",
						updated: convexFunctions?.updated_at,
					},
					{
						name: "clerk_auth",
						provider: "clerk",
						status: clerkAuth?.status || "unknown",
						updated: clerkAuth?.updated_at,
					},
					{
						name: "clerk_billing",
						provider: "clerk",
						status: clerkBilling?.status || "unknown",
						updated: clerkBilling?.updated_at,
					},
					{
						name: "boldsign_esignature",
						provider: "boldsign",
						status: boldsignAPI?.status || "unknown",
						updated: boldsignAPI?.updated_at,
					},
				],
				checkedAt: Date.now(),
			});
		} catch (error) {
			console.error("Failed to check service status:", error);
			// Mark all services as unknown if the check fails
			await ctx.runMutation(internal.serviceStatus.updateStatuses, {
				services: [
					{
						name: "convex_database",
						provider: "convex",
						status: "unknown",
						updated: undefined,
					},
					{
						name: "convex_functions",
						provider: "convex",
						status: "unknown",
						updated: undefined,
					},
					{
						name: "clerk_auth",
						provider: "clerk",
						status: "unknown",
						updated: undefined,
					},
					{
						name: "clerk_billing",
						provider: "clerk",
						status: "unknown",
						updated: undefined,
					},
					{
						name: "boldsign_esignature",
						provider: "boldsign",
						status: "unknown",
						updated: undefined,
					},
				],
				checkedAt: Date.now(),
			});
		}
	},
});
