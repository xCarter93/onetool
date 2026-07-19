import posthog from "posthog-js";

export interface AnalyticsUserProperties {
	email: string;
	name: string;
	role: "admin" | "member";
	orgId: string;
	orgName: string;
	planType?: "free" | "trial" | "pro";
}

export interface AnalyticsOrgProperties {
	name: string;
	planType: "free" | "trial" | "pro";
	stripeConnected: boolean;
	memberCount?: number;
}

/**
 * Identify a user with PostHog after sign-in.
 * Sets user properties that will be associated with all future events.
 */
export function identifyUser(userId: string, props: AnalyticsUserProperties) {
	posthog.identify(userId, {
		email: props.email,
		name: props.name,
		role: props.role,
		org_id: props.orgId,
		org_name: props.orgName,
		plan_type: props.planType,
	});
}

/**
 * Set user properties that should only be recorded once (e.g., first login date).
 * Uses $set_once to prevent overwriting on subsequent calls.
 */
export function setUserOnce(properties: Record<string, unknown>) {
	posthog.capture("$identify", { $set_once: properties });
}

/**
 * Associate a user with their organization for B2B group analytics.
 * Enables organization-level metrics and segmentation in PostHog.
 */
export function setOrganizationGroup(
	orgId: string,
	props: AnalyticsOrgProperties
) {
	posthog.group("organization", orgId, {
		name: props.name,
		plan_type: props.planType,
		stripe_connected: props.stripeConnected,
		member_count: props.memberCount,
	});
}

/**
 * Reset analytics identity on sign-out.
 * Clears the current user identification and starts a new anonymous session.
 */
export function resetAnalytics() {
	posthog.reset();
}

/**
 * Track a custom event with optional properties.
 * Use this for business events like quote_sent, invoice_paid, etc.
 */
export function trackEvent(
	eventName: string,
	properties?: Record<string, unknown>
) {
	posthog.capture(eventName, properties);
}
