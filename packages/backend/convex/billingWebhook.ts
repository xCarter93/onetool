import { MutationCtx, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
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
	// Keep Clerk's per-org seat cap in step with the resolved plan (trial and
	// override orgs sit outside Clerk's plan-level seat limits). Scheduled
	// UNCONDITIONALLY: a premium loss starts the 72h grace (still business at
	// T+0), and by the time grace lapses wasPremium === nowPremium — a
	// transition-gated schedule would never sync the org down. The nightly
	// reconcile re-runs this, and the sync is idempotent.
	await ctx.scheduler.runAfter(0, internal.seatSync.syncSeatCap, {
		orgId: org._id,
	});
	// Published automations follow the plan the same way, on the same
	// unconditional + grace-lapse pair: a run at T+0 no-ops while grace (or a
	// trial) still resolves business, and the +60s run catches the real lapse.
	await ctx.scheduler.runAfter(
		0,
		internal.automationExecutor.reclassifyAutomationsForOrg,
		{ orgId: org._id }
	);
	if (grace.planGraceUntil !== undefined && grace.planGraceUntil !== null) {
		await ctx.scheduler.runAt(
			grace.planGraceUntil + 60_000,
			internal.seatSync.syncSeatCap,
			{ orgId: org._id }
		);
		await ctx.scheduler.runAt(
			grace.planGraceUntil + 60_000,
			internal.automationExecutor.reclassifyAutomationsForOrg,
			{ orgId: org._id }
		);
	}
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
			// Prefer the event's period start; keep the existing value when the
			// event omits it; Date.now() only when neither exists.
			billingCycleStart:
				args.currentPeriodStart ?? org.billingCycleStart ?? Date.now(),
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
			billingCycleStart:
				args.currentPeriodStart ?? org.billingCycleStart ?? Date.now(),
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

/**
 * Pre-live item statuses: a plan-period switch or reopened checkout creates a
 * SECOND paid item in one of these states — it must never displace a live
 * subscription (writing "incomplete" over "active" would lock a paying org).
 */
const PRE_LIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
	"incomplete",
	"upcoming",
	"abandoned",
]);

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

		const mirrorIsLive =
			org.subscriptionStatus === "active" ||
			org.subscriptionStatus === "trialing";
		if (PRE_LIVE_STATUSES.has(status) && mirrorIsLive) {
			logWebhookSuccess(
				WEBHOOK_SERVICE,
				`${args.eventType} (pre-live sibling ignored)`,
				org._id
			);
			return { success: true };
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

// Page by the caller's limit: a post-filter slice would drop qualifying orgs
// the cursor then skips past.
const pageSize = (limit: number) => Math.max(1, Math.min(limit, 200));

/**
 * Orgs whose billing mirror hasn't been written in `staleMs`. Bounded scan:
 * only orgs that ever had a subscription (clerkSubscriptionId set) qualify.
 */
export const listStaleBillingOrgs = internalQuery({
	args: {
		staleMs: v.number(),
		limit: v.number(),
		cursor: v.union(v.string(), v.null()),
	},
	handler: async (
		ctx,
		args
	): Promise<{
		stale: Array<{ orgId: Id<"organizations">; clerkOrganizationId: string }>;
		continueCursor: string;
		isDone: boolean;
	}> => {
		const cutoff = Date.now() - args.staleMs;
		// Unset billingSyncedAt sorts before every number, so lt(cutoff) includes never-synced orgs.
		const page = await ctx.db
			.query("organizations")
			.withIndex("by_billing_synced", (q) => q.lt("billingSyncedAt", cutoff))
			.paginate({ numItems: pageSize(args.limit), cursor: args.cursor });
		const stale = page.page
			.filter((org) => org.clerkSubscriptionId !== undefined)
			.map((org) => ({
				orgId: org._id,
				clerkOrganizationId: org.clerkOrganizationId,
			}));
		return { stale, continueCursor: page.continueCursor, isDone: page.isDone };
	},
});

/**
 * The orgs the stale scan above can't see: no `clerkSubscriptionId` at all —
 * trial-only and override orgs, plus any org whose FIRST billing webhook was
 * missed — whose trial lapsed inside `lapsedWithinMs`. That window is the
 * bound: a long-lapsed free org must not be re-fetched from Clerk nightly
 * forever, and the lapse is the only moment their seats and automations need
 * to re-resolve (the one-shot trial wake is a single unretried scheduler shot).
 */
export const listLapsedTrialOrgs = internalQuery({
	args: {
		lapsedWithinMs: v.number(),
		staleMs: v.number(),
		limit: v.number(),
		cursor: v.union(v.string(), v.null()),
	},
	handler: async (
		ctx,
		args
	): Promise<{
		lapsed: Array<{ orgId: Id<"organizations">; clerkOrganizationId: string }>;
		continueCursor: string;
		isDone: boolean;
	}> => {
		const now = Date.now();
		const staleCutoff = now - args.staleMs;
		const lapsedAfter = now - args.lapsedWithinMs;
		const page = await ctx.db
			.query("organizations")
			.withIndex("by_billing_synced", (q) =>
				q.lt("billingSyncedAt", staleCutoff)
			)
			.paginate({ numItems: pageSize(args.limit), cursor: args.cursor });
		const lapsed = page.page
			.filter(
				(org) =>
					org.clerkSubscriptionId === undefined &&
					org.trialEndsAt !== undefined &&
					org.trialEndsAt <= now &&
					org.trialEndsAt > lapsedAfter
			)
			.map((org) => ({
				orgId: org._id,
				clerkOrganizationId: org.clerkOrganizationId,
			}));
		return { lapsed, continueCursor: page.continueCursor, isDone: page.isDone };
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
