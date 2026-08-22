import { MutationCtx, internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/triggers";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { logWebhookReceived, logWebhookSuccess, logWebhookError } from "./lib/webhooks";
import { orgHasPremiumPlan } from "./lib/permissions";
import { PLAN_GRACE_MS } from "./lib/entitlements";

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
 * Subscription status values this mirror accepts. Clerk's real set plus the
 * legacy Stripe-shaped literals older org docs may still hold.
 */
const KNOWN_SUBSCRIPTION_STATUSES = [
	"active",
	"past_due",
	"canceled",
	"incomplete",
	"incomplete_expired",
	"trialing",
	"unpaid",
	"ended",
	"abandoned",
	"expired",
	"upcoming",
] as const;

type SubscriptionStatus = (typeof KNOWN_SUBSCRIPTION_STATUSES)[number];

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
 * Validate a raw status string. Returns null for unknown values so handlers
 * skip the status write instead of failing schema validation.
 */
function toSubscriptionStatus(status: string): SubscriptionStatus | null {
	return (KNOWN_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
		? (status as SubscriptionStatus)
		: null;
}

type BillingPatch = Partial<
	Pick<
		Doc<"organizations">,
		| "clerkSubscriptionId"
		| "clerkPlanId"
		| "clerkPlanSlug"
		| "subscriptionStatus"
		| "billingCycleStart"
		| "planGraceUntil"
		| "billingSyncedAt"
	>
>;

/**
 * Apply a billing-mirror patch with grace-window bookkeeping: losing premium
 * via a billing change starts the 72h grace; regaining it clears the window.
 * Overrides don't churn grace (they keep orgHasPremiumPlan true throughout).
 * Every billing write also stamps billingSyncedAt for the nightly reconcile.
 */
async function applyBillingPatch(
	ctx: MutationCtx,
	org: Doc<"organizations">,
	patch: BillingPatch,
	now: number = Date.now()
): Promise<void> {
	const wasPremium = orgHasPremiumPlan(org);
	const nowPremium = orgHasPremiumPlan({ ...org, ...patch });
	const grace: BillingPatch =
		wasPremium && !nowPremium
			? { planGraceUntil: now + PLAN_GRACE_MS }
			: nowPremium
				? { planGraceUntil: undefined }
				: {};
	await ctx.db.patch(org._id, {
		...patch,
		...grace,
		billingSyncedAt: now,
	});
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

		const status = toSubscriptionStatus(args.status);
		await applyBillingPatch(ctx, org, {
			clerkSubscriptionId: args.subscriptionId,
			clerkPlanId: args.planId,
			// Only overwrite when the event carried plan items — patching
			// undefined would unset the field.
			...(args.planSlug !== undefined ? { clerkPlanSlug: args.planSlug } : {}),
			...(status !== null ? { subscriptionStatus: status } : {}),
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

		await applyBillingPatch(ctx, org, {
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

		const status = toSubscriptionStatus(args.status);
		await applyBillingPatch(ctx, org, {
			clerkSubscriptionId: args.subscriptionId,
			clerkPlanId: args.planId,
			...(args.planSlug !== undefined ? { clerkPlanSlug: args.planSlug } : {}),
			...(status !== null ? { subscriptionStatus: status } : {}),
			// Only when present — patching undefined would ERASE the existing
			// cycle start (events without current_period_start are common).
			...(args.currentPeriodStart !== undefined
				? { billingCycleStart: args.currentPeriodStart }
				: {}),
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

		await applyBillingPatch(ctx, org, {
			subscriptionStatus: "past_due",
		});

		logWebhookSuccess(WEBHOOK_SERVICE, "subscription.pastDue", org._id);
		return { success: true };
	},
});

// ============================================================================
// Subscription Item Handlers
// ============================================================================

/** Item-level statuses that map straight onto the org mirror. */
const ITEM_STATUS_BY_EVENT: Record<string, SubscriptionStatus> = {
	"subscriptionItem.active": "active",
	"subscriptionItem.canceled": "canceled",
	"subscriptionItem.ended": "ended",
	"subscriptionItem.abandoned": "abandoned",
	"subscriptionItem.incomplete": "incomplete",
	"subscriptionItem.pastDue": "past_due",
};

/**
 * Handle every subscriptionItem.* event for the PAID plan item (http.ts drops
 * free_* items before calling this). Cancellation only ever fires at the item
 * level — there is no subscription.canceled event — so this is the sole path
 * that can write subscriptionStatus: "canceled".
 */
export const handleSubscriptionItemEvent = internalMutation({
	args: {
		eventType: v.string(),
		organizationId: v.string(),
		planId: v.optional(v.string()),
		planSlug: v.optional(v.string()),
		status: v.optional(v.string()),
		currentPeriodStart: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		logWebhookReceived(WEBHOOK_SERVICE, args.eventType, args.organizationId);

		const org = await getOrganizationByClerkId(ctx, args.organizationId);
		if (!org) {
			return { success: false, error: "Organization not found" };
		}

		// Informational events: no mirror change.
		if (
			args.eventType === "subscriptionItem.freeTrialEnding" ||
			args.eventType === "subscriptionItem.upcoming"
		) {
			logWebhookSuccess(WEBHOOK_SERVICE, args.eventType, org._id);
			return { success: true };
		}

		// created/updated carry the item's own status; the rest imply theirs.
		const status =
			args.eventType === "subscriptionItem.updated" ||
			args.eventType === "subscriptionItem.created"
				? args.status !== undefined
					? toSubscriptionStatus(args.status)
					: null
				: (ITEM_STATUS_BY_EVENT[args.eventType] ?? null);

		if (status === null) {
			logWebhookError(
				WEBHOOK_SERVICE,
				args.eventType,
				`No status mapping for event (status=${args.status ?? "-"})`,
				org._id
			);
			return { success: false, error: "Unmapped item event" };
		}

		await applyBillingPatch(ctx, org, {
			...(args.planId !== undefined ? { clerkPlanId: args.planId } : {}),
			...(args.planSlug !== undefined ? { clerkPlanSlug: args.planSlug } : {}),
			subscriptionStatus: status,
			...(args.currentPeriodStart !== undefined
				? { billingCycleStart: args.currentPeriodStart }
				: {}),
		});

		logWebhookSuccess(WEBHOOK_SERVICE, args.eventType, org._id);
		return { success: true };
	},
});

// ============================================================================
// Nightly reconcile (repairs orgs a missed webhook left stale)
// ============================================================================

/**
 * Orgs whose billing mirror hasn't been written in `staleMs`. Bounded scan:
 * only orgs that ever had a subscription (clerkSubscriptionId set) qualify.
 */
export const listStaleBillingOrgs = internalQuery({
	args: { staleMs: v.number(), limit: v.number() },
	handler: async (
		ctx,
		args
	): Promise<Array<{ orgId: Id<"organizations">; clerkOrganizationId: string }>> => {
		const cutoff = Date.now() - args.staleMs;
		const orgs = await ctx.db.query("organizations").collect();
		return orgs
			.filter(
				(org) =>
					org.clerkSubscriptionId !== undefined &&
					(org.billingSyncedAt ?? 0) < cutoff
			)
			.slice(0, args.limit)
			.map((org) => ({
				orgId: org._id,
				clerkOrganizationId: org.clerkOrganizationId,
			}));
	},
});

/**
 * Write the authoritative subscription state fetched from Clerk's backend
 * billing API. planSlug is null when Clerk reports no paid item — that's a
 * real downgrade signal (unlike webhooks, where an absent slug means "event
 * carried no items"), so it clears the slug.
 */
export const applyReconciledSubscription = internalMutation({
	args: {
		orgId: v.id("organizations"),
		subscriptionId: v.optional(v.string()),
		planId: v.union(v.string(), v.null()),
		planSlug: v.union(v.string(), v.null()),
		status: v.string(),
		currentPeriodStart: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const org = await ctx.db.get(args.orgId);
		if (!org) {
			return { success: false, error: "Organization not found" };
		}
		const status = toSubscriptionStatus(args.status);
		await applyBillingPatch(ctx, org, {
			...(args.subscriptionId !== undefined
				? { clerkSubscriptionId: args.subscriptionId }
				: {}),
			clerkPlanId: args.planId ?? undefined,
			clerkPlanSlug: args.planSlug ?? undefined,
			...(status !== null ? { subscriptionStatus: status } : {}),
			...(args.currentPeriodStart !== undefined
				? { billingCycleStart: args.currentPeriodStart }
				: {}),
		});
		logWebhookSuccess(WEBHOOK_SERVICE, "reconcile", org._id);
		return { success: true };
	},
});

/** Reconcile couldn't reach Clerk for this org — stamp the attempt so one bad
 * org can't be retried forever at the head of the stale list. */
export const markBillingSyncAttempt = internalMutation({
	args: { orgId: v.id("organizations") },
	handler: async (ctx, args) => {
		const org = await ctx.db.get(args.orgId);
		if (!org) return { success: false };
		await ctx.db.patch(org._id, { billingSyncedAt: Date.now() });
		return { success: true };
	},
});
