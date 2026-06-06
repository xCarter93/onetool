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

function fulfilled<T>(result: PromiseSettledResult<unknown>): T | undefined {
	return result.status === "fulfilled" ? (result.value as T) : undefined;
}

// Canonical service list — the single source of truth for both the mapping
// below and updateStatuses' row pruning. Adding a service here is enough.
const SERVICES = [
	{ name: "convex", provider: "convex" },
	{ name: "clerk_auth", provider: "clerk" },
	{ name: "clerk_billing", provider: "clerk" },
	{ name: "boldsign_esignature", provider: "boldsign" },
	{ name: "stripe", provider: "stripe" },
] as const;

export const checkServiceStatus = internalAction({
	handler: async (ctx) => {
		try {
			// Per-provider isolation: one unreachable status page only marks its
			// own services unknown, not all of them.
			const [convexResult, clerkResult, boldsignResult, stripeResult] =
				await Promise.allSettled([
					fetch("https://status.convex.dev/api/v2/summary.json").then((r) =>
						r.json()
					),
					fetch("https://status.clerk.com/api/v2/summary.json").then((r) =>
						r.json()
					),
					fetch("https://status.boldsign.com/api/v2/summary.json").then((r) =>
						r.json()
					),
					fetch("https://status.stripe.com/current").then((r) => r.json()),
				]);

			const convexData = fulfilled<StatuspageSummary>(convexResult);
			const clerkData = fulfilled<StatuspageSummary>(clerkResult);
			const boldsignData = fulfilled<StatuspageSummary>(boldsignResult);
			const stripeData = fulfilled<StripeStatus>(stripeResult);

			// Any missing/undefined field flows through normalizeStatus(undefined)
			// → "unknown", so a failed provider degrades cleanly.
			const statuses: Record<string, { status: ServiceStatus; updated?: string }> = {
				// Convex no longer exposes per-subsystem components (Database/Functions);
				// its summary groups by plan tier, so use the page-level indicator.
				convex: {
					status: normalizeStatus(convexData?.status?.indicator),
					updated: convexData?.page?.updated_at,
				},
				clerk_auth: resolve(
					clerkData?.components?.find((c) => c.name === "User and authentication"),
					clerkData?.status?.indicator
				),
				clerk_billing: resolve(
					clerkData?.components?.find((c) => c.name === "Billing"),
					clerkData?.status?.indicator
				),
				boldsign_esignature: resolve(
					boldsignData?.components?.find(
						(c) => c.name === "API" && c.group === true
					),
					boldsignData?.status?.indicator
				),
				// Stripe's overall indicator; fall back to its payments API component.
				stripe: {
					status: normalizeStatus(
						stripeData?.largestatus ?? stripeData?.statuses?.api
					),
					updated: undefined,
				},
			};

			await ctx.runMutation(internal.serviceStatus.updateStatuses, {
				services: SERVICES.map((s) => ({
					name: s.name,
					provider: s.provider,
					status: statuses[s.name].status,
					updated: statuses[s.name].updated,
				})),
				checkedAt: Date.now(),
			});
		} catch (error) {
			// Reached only if the mutation itself fails; per-provider fetch errors
			// are already handled above. Leave existing rows untouched.
			console.error("Failed to check service status:", error);
		}
	},
});
