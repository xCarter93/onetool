"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

type ServiceStatus =
	| "operational"
	| "degraded"
	| "partial_outage"
	| "major_outage"
	| "unknown";

type StatuspageSummary = {
	status: { indicator: string; description: string };
	page?: { updated_at?: string };
	components: Array<{
		name: string;
		group?: boolean;
		status: string;
		updated_at?: string;
	}>;
};

// Stripe uses its own status API shape, not statuspage.io.
type StripeStatus = {
	largestatus?: string;
	statuses?: Record<string, string>;
};

// Maps provider status strings (statuspage.io components + page-level
// indicators, and Stripe's up/degraded/down) to our enum.
function normalizeStatus(raw: string | undefined): ServiceStatus {
	switch (raw) {
		case "operational":
		case "none":
		case "up":
			return "operational";
		case "degraded_performance":
		case "under_maintenance":
		case "minor":
		case "maintenance":
		case "degraded":
			return "degraded";
		case "partial_outage":
		case "major":
			return "partial_outage";
		case "major_outage":
		case "critical":
		case "down":
			return "major_outage";
		default:
			return "unknown";
	}
}

// Prefer the matched component; fall back to the page-level indicator if the
// component was renamed or removed, so a status-page restructure degrades
// gracefully instead of silently reporting an outage.
function resolve(
	component: { status: string; updated_at?: string } | undefined,
	pageIndicator: string | undefined
): { status: ServiceStatus; updated?: string } {
	return component
		? { status: normalizeStatus(component.status), updated: component.updated_at }
		: { status: normalizeStatus(pageIndicator), updated: undefined };
}

export const checkServiceStatus = internalAction({
	handler: async (ctx) => {
		try {
			const [convexResponse, clerkResponse, boldsignResponse, stripeResponse] =
				await Promise.all([
					fetch("https://status.convex.dev/api/v2/summary.json"),
					fetch("https://status.clerk.com/api/v2/summary.json"),
					fetch("https://status.boldsign.com/api/v2/summary.json"),
					fetch("https://status.stripe.com/current"),
				]);

			const [convexData, clerkData, boldsignData, stripeData] =
				(await Promise.all([
					convexResponse.json(),
					clerkResponse.json(),
					boldsignResponse.json(),
					stripeResponse.json(),
				])) as [
					StatuspageSummary,
					StatuspageSummary,
					StatuspageSummary,
					StripeStatus,
				];

			// Convex no longer exposes per-subsystem components (Database/Functions);
			// its summary now groups by plan tier, so use the page-level indicator.
			const convex = {
				status: normalizeStatus(convexData.status?.indicator),
				updated: convexData.page?.updated_at,
			};

			const clerkAuth = resolve(
				clerkData.components.find((c) => c.name === "User and authentication"),
				clerkData.status?.indicator
			);
			const clerkBilling = resolve(
				clerkData.components.find((c) => c.name === "Billing"),
				clerkData.status?.indicator
			);
			const boldsign = resolve(
				boldsignData.components.find((c) => c.name === "API" && c.group === true),
				boldsignData.status?.indicator
			);

			// Stripe's overall indicator; fall back to its payments API component.
			const stripe = normalizeStatus(
				stripeData.largestatus ?? stripeData.statuses?.api
			);

			await ctx.runMutation(internal.serviceStatus.updateStatuses, {
				services: [
					{
						name: "convex",
						provider: "convex",
						status: convex.status,
						updated: convex.updated,
					},
					{
						name: "clerk_auth",
						provider: "clerk",
						status: clerkAuth.status,
						updated: clerkAuth.updated,
					},
					{
						name: "clerk_billing",
						provider: "clerk",
						status: clerkBilling.status,
						updated: clerkBilling.updated,
					},
					{
						name: "boldsign_esignature",
						provider: "boldsign",
						status: boldsign.status,
						updated: boldsign.updated,
					},
					{
						name: "stripe",
						provider: "stripe",
						status: stripe,
						updated: undefined,
					},
				],
				checkedAt: Date.now(),
			});
		} catch (error) {
			console.error("Failed to check service status:", error);
			// Mark all services as unknown if the check fails
			await ctx.runMutation(internal.serviceStatus.updateStatuses, {
				services: [
					{ name: "convex", provider: "convex", status: "unknown", updated: undefined },
					{ name: "clerk_auth", provider: "clerk", status: "unknown", updated: undefined },
					{ name: "clerk_billing", provider: "clerk", status: "unknown", updated: undefined },
					{
						name: "boldsign_esignature",
						provider: "boldsign",
						status: "unknown",
						updated: undefined,
					},
					{ name: "stripe", provider: "stripe", status: "unknown", updated: undefined },
				],
				checkedAt: Date.now(),
			});
		}
	},
});
