import { internalMutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { logWebhookReceived, logWebhookSuccess, logWebhookError } from "./lib/webhooks";

/**
 * Clerk Billing Webhook Handlers
 *
 * Handles subscription and payment events from Clerk Billing
 * Note: Only organization-level billing is supported
 */

// ============================================================================
// Constants
// ============================================================================

const WEBHOOK_SERVICE = "Clerk Billing";

// ============================================================================
// Types
// ============================================================================

/**
 * Valid subscription status values from Clerk
 */
type SubscriptionStatus =
	| "active"
	| "past_due"
	| "canceled"
	| "incomplete"
	| "incomplete_expired"
	| "trialing"
	| "unpaid";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Look up organization by Clerk organization ID
 * Returns null if not found (logs error internally)
 */
async function getOrganizationByClerkId(
	ctx: MutationCtx,
	clerkOrganizationId: string
): Promise<Doc<"organizations"> | null> {
	const org = await ctx.db
		.query("organizations")
		.withIndex("by_clerk_org", (q) =>
			q.eq("clerkOrganizationId", clerkOrganizationId)
		)
		.first();

	if (!org) {
		logWebhookError(
			WEBHOOK_SERVICE,
			"organization lookup",
			`Organization not found for Clerk ID: ${clerkOrganizationId}`,
			clerkOrganizationId
		);
	}

	return org;
}

/**
 * Cast raw status string to typed SubscriptionStatus
 */
function toSubscriptionStatus(status: string): SubscriptionStatus {
	return status as SubscriptionStatus;
}

// ============================================================================
// Payment Attempt Handlers
// ============================================================================

/**
 * Handle paymentAttempt.created event
 */
export const handlePaymentAttemptCreated = internalMutation({
	args: {
		paymentAttemptId: v.string(),
		organizationId: v.optional(v.string()),
		amount: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		logWebhookReceived(WEBHOOK_SERVICE, "paymentAttempt.created", args.paymentAttemptId);

		// Log the payment attempt - you could store this in a payments table if needed
		// For now, we just log it

		return { success: true };
	},
});

/**
 * Handle paymentAttempt.updated event
 */
export const handlePaymentAttemptUpdated = internalMutation({
	args: {
		paymentAttemptId: v.string(),
		status: v.optional(v.string()),
		organizationId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		logWebhookReceived(
			WEBHOOK_SERVICE,
			`paymentAttempt.updated (${args.status})`,
			args.paymentAttemptId
		);

		// You could update a payments table here if tracking payment history
		// For now, we just log the status change

		return { success: true };
	},
});

// ============================================================================
// Subscription Handlers
// ============================================================================

/**
 * Handle subscription.created event
 */
export const handleSubscriptionCreated = internalMutation({
	args: {
		subscriptionId: v.string(),
		organizationId: v.string(),
		planId: v.string(),
		planSlug: v.optional(v.string()),
		status: v.string(),
		currentPeriodStart: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		logWebhookReceived(WEBHOOK_SERVICE, "subscription.created", args.subscriptionId);

		const org = await getOrganizationByClerkId(ctx, args.organizationId);
		if (!org) {
			return { success: false, error: "Organization not found" };
		}

		await ctx.db.patch(org._id, {
			clerkSubscriptionId: args.subscriptionId,
			clerkPlanId: args.planId,
			// Only overwrite when the event carried plan items — patching
			// undefined would unset the field.
			...(args.planSlug !== undefined ? { clerkPlanSlug: args.planSlug } : {}),
			subscriptionStatus: toSubscriptionStatus(args.status),
			billingCycleStart: args.currentPeriodStart || Date.now(),
		});

		logWebhookSuccess(WEBHOOK_SERVICE, "subscription.created", org._id);
		return { success: true };
	},
});

/**
 * Handle subscription.active event
 */
export const handleSubscriptionActive = internalMutation({
	args: {
		subscriptionId: v.string(),
		organizationId: v.string(),
		planId: v.string(),
		planSlug: v.optional(v.string()),
		currentPeriodStart: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		logWebhookReceived(WEBHOOK_SERVICE, "subscription.active", args.subscriptionId);

		const org = await getOrganizationByClerkId(ctx, args.organizationId);
		if (!org) {
			return { success: false, error: "Organization not found" };
		}

		await ctx.db.patch(org._id, {
			clerkSubscriptionId: args.subscriptionId,
			clerkPlanId: args.planId,
			...(args.planSlug !== undefined ? { clerkPlanSlug: args.planSlug } : {}),
			subscriptionStatus: "active",
			billingCycleStart: args.currentPeriodStart || Date.now(),
		});

		logWebhookSuccess(WEBHOOK_SERVICE, "subscription.active", org._id);
		return { success: true };
	},
});

/**
 * Handle subscription.updated event
 */
export const handleSubscriptionUpdated = internalMutation({
	args: {
		subscriptionId: v.string(),
		organizationId: v.string(),
		planId: v.string(),
		planSlug: v.optional(v.string()),
		status: v.string(),
		currentPeriodStart: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		logWebhookReceived(
			WEBHOOK_SERVICE,
			`subscription.updated (${args.status})`,
			args.subscriptionId
		);

		const org = await getOrganizationByClerkId(ctx, args.organizationId);
		if (!org) {
			return { success: false, error: "Organization not found" };
		}

		await ctx.db.patch(org._id, {
			clerkSubscriptionId: args.subscriptionId,
			clerkPlanId: args.planId,
			...(args.planSlug !== undefined ? { clerkPlanSlug: args.planSlug } : {}),
			subscriptionStatus: toSubscriptionStatus(args.status),
			billingCycleStart: args.currentPeriodStart,
		});

		logWebhookSuccess(WEBHOOK_SERVICE, "subscription.updated", org._id);
		return { success: true };
	},
});

/**
 * Handle subscription.pastDue event
 */
export const handleSubscriptionPastDue = internalMutation({
	args: {
		subscriptionId: v.string(),
		organizationId: v.string(),
	},
	handler: async (ctx, args) => {
		logWebhookReceived(WEBHOOK_SERVICE, "subscription.pastDue", args.subscriptionId);

		const org = await getOrganizationByClerkId(ctx, args.organizationId);
		if (!org) {
			return { success: false, error: "Organization not found" };
		}

		await ctx.db.patch(org._id, {
			subscriptionStatus: "past_due",
		});

		logWebhookSuccess(WEBHOOK_SERVICE, "subscription.pastDue", org._id);
		return { success: true };
	},
});
