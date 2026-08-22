import { describe, it, expect, beforeEach } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import { createTestOrg } from "./test.helpers";
import { PREMIUM_PLAN_SLUG } from "./lib/permissions";
import { PLAN_GRACE_MS } from "./lib/entitlements";

describe("Clerk billing webhook handlers", () => {
	let t: ReturnType<typeof setupConvexTest>;
	let orgId: Id<"organizations">;
	let clerkOrgId: string;

	beforeEach(async () => {
		t = setupConvexTest();
		const setup = await t.run(async (ctx) => createTestOrg(ctx));
		orgId = setup.orgId;
		clerkOrgId = setup.clerkOrgId;
	});

	async function getOrg() {
		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		if (!org) throw new Error("org vanished");
		return org;
	}

	async function makePremium() {
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, {
				clerkPlanSlug: PREMIUM_PLAN_SLUG,
				subscriptionStatus: "active",
				billingCycleStart: 1_000,
			});
		});
	}

	it("subscription.created writes the full mirror and stamps billingSyncedAt", async () => {
		const before = Date.now();
		await t.mutation(internal.billingWebhook.handleSubscriptionCreated, {
			subscriptionId: "sub_1",
			organizationId: clerkOrgId,
			planId: "plan_1",
			planSlug: PREMIUM_PLAN_SLUG,
			status: "active",
			currentPeriodStart: 12345,
		});
		const org = await getOrg();
		expect(org).toMatchObject({
			clerkSubscriptionId: "sub_1",
			clerkPlanId: "plan_1",
			clerkPlanSlug: PREMIUM_PLAN_SLUG,
			subscriptionStatus: "active",
			billingCycleStart: 12345,
		});
		expect(org.billingSyncedAt).toBeGreaterThanOrEqual(before);
	});

	it("subscription.updated without a period start does NOT erase billingCycleStart", async () => {
		await makePremium();
		await t.mutation(internal.billingWebhook.handleSubscriptionUpdated, {
			subscriptionId: "sub_1",
			organizationId: clerkOrgId,
			planId: "plan_1",
			status: "active",
			// currentPeriodStart deliberately absent (common on real events)
		});
		const org = await getOrg();
		expect(org.billingCycleStart).toBe(1_000);
	});

	it("subscription.updated with an unknown status keeps the previous status", async () => {
		await makePremium();
		await t.mutation(internal.billingWebhook.handleSubscriptionUpdated, {
			subscriptionId: "sub_1",
			organizationId: clerkOrgId,
			planId: "plan_1",
			status: "some_future_status",
		});
		const org = await getOrg();
		expect(org.subscriptionStatus).toBe("active");
	});

	it("subscriptionItem.canceled writes canceled and opens the 72h grace window", async () => {
		await makePremium();
		const before = Date.now();
		await t.mutation(internal.billingWebhook.handleSubscriptionItemEvent, {
			eventType: "subscriptionItem.canceled",
			organizationId: clerkOrgId,
			planSlug: PREMIUM_PLAN_SLUG,
		});
		const org = await getOrg();
		expect(org.subscriptionStatus).toBe("canceled");
		expect(org.planGraceUntil).toBeGreaterThanOrEqual(before + PLAN_GRACE_MS);
		expect(org.planGraceUntil).toBeLessThanOrEqual(Date.now() + PLAN_GRACE_MS);
	});

	it("subscription.pastDue opens grace for a premium org", async () => {
		await makePremium();
		await t.mutation(internal.billingWebhook.handleSubscriptionPastDue, {
			subscriptionId: "sub_1",
			organizationId: clerkOrgId,
		});
		const org = await getOrg();
		expect(org.subscriptionStatus).toBe("past_due");
		expect(org.planGraceUntil).toBeGreaterThan(Date.now());
	});

	it("regaining active clears the grace window", async () => {
		await makePremium();
		await t.mutation(internal.billingWebhook.handleSubscriptionItemEvent, {
			eventType: "subscriptionItem.pastDue",
			organizationId: clerkOrgId,
			planSlug: PREMIUM_PLAN_SLUG,
		});
		expect((await getOrg()).planGraceUntil).toBeDefined();
		await t.mutation(internal.billingWebhook.handleSubscriptionItemEvent, {
			eventType: "subscriptionItem.active",
			organizationId: clerkOrgId,
			planSlug: PREMIUM_PLAN_SLUG,
		});
		const org = await getOrg();
		expect(org.subscriptionStatus).toBe("active");
		expect(org.planGraceUntil).toBeUndefined();
	});

	it("a free org losing nothing never gets a grace window", async () => {
		await t.mutation(internal.billingWebhook.handleSubscriptionItemEvent, {
			eventType: "subscriptionItem.canceled",
			organizationId: clerkOrgId,
			planSlug: PREMIUM_PLAN_SLUG,
		});
		const org = await getOrg();
		expect(org.subscriptionStatus).toBe("canceled");
		expect(org.planGraceUntil).toBeUndefined();
	});

	it("an active org is not downgraded by a pre-live sibling item event", async () => {
		await makePremium();
		// Plan-period switch / reopened checkout: Clerk creates a second paid
		// item in a pre-live state and fires created/updated for it.
		await t.mutation(internal.billingWebhook.handleSubscriptionItemEvent, {
			eventType: "subscriptionItem.created",
			organizationId: clerkOrgId,
			planSlug: PREMIUM_PLAN_SLUG,
			status: "incomplete",
		});
		await t.mutation(internal.billingWebhook.handleSubscriptionItemEvent, {
			eventType: "subscriptionItem.updated",
			organizationId: clerkOrgId,
			planSlug: PREMIUM_PLAN_SLUG,
			status: "upcoming",
		});
		await t.mutation(internal.billingWebhook.handleSubscriptionItemEvent, {
			eventType: "subscriptionItem.abandoned",
			organizationId: clerkOrgId,
			planSlug: PREMIUM_PLAN_SLUG,
		});
		const org = await getOrg();
		expect(org.subscriptionStatus).toBe("active");
		expect(org.planGraceUntil).toBeUndefined();
	});

	it("pre-live statuses still write when the mirror is not live", async () => {
		await t.mutation(internal.billingWebhook.handleSubscriptionItemEvent, {
			eventType: "subscriptionItem.created",
			organizationId: clerkOrgId,
			planSlug: PREMIUM_PLAN_SLUG,
			status: "incomplete",
		});
		const org = await getOrg();
		expect(org.subscriptionStatus).toBe("incomplete");
	});

	it("an item event with an unrecognized status is rejected, not written", async () => {
		await makePremium();
		const result = await t.mutation(
			internal.billingWebhook.handleSubscriptionItemEvent,
			{
				eventType: "subscriptionItem.created",
				organizationId: clerkOrgId,
				planSlug: PREMIUM_PLAN_SLUG,
				status: "some_future_status",
			}
		);
		expect(result).toMatchObject({
			success: false,
			error: "Unmapped item event",
		});
		expect((await getOrg()).subscriptionStatus).toBe("active");
	});

	it("informational item events change nothing", async () => {
		await makePremium();
		for (const eventType of [
			"subscriptionItem.freeTrialEnding",
			"subscriptionItem.upcoming",
		]) {
			await t.mutation(internal.billingWebhook.handleSubscriptionItemEvent, {
				eventType,
				organizationId: clerkOrgId,
				planSlug: PREMIUM_PLAN_SLUG,
			});
		}
		const org = await getOrg();
		expect(org.subscriptionStatus).toBe("active");
	});

	it("an org-level override keeps grace out of the picture entirely", async () => {
		await makePremium();
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { hasPremiumFeatureAccess: true });
		});
		await t.mutation(internal.billingWebhook.handleSubscriptionItemEvent, {
			eventType: "subscriptionItem.canceled",
			organizationId: clerkOrgId,
			planSlug: PREMIUM_PLAN_SLUG,
		});
		// Override keeps the org premium, so no grace window opens.
		const org = await getOrg();
		expect(org.subscriptionStatus).toBe("canceled");
		expect(org.planGraceUntil).toBeUndefined();
	});
});

describe("billing reconcile", () => {
	let t: ReturnType<typeof setupConvexTest>;
	let orgId: Id<"organizations">;

	beforeEach(async () => {
		t = setupConvexTest();
		const setup = await t.run(async (ctx) => createTestOrg(ctx));
		orgId = setup.orgId;
	});

	it("lists only subscription-bearing orgs whose mirror is stale", async () => {
		// No subscription → never listed, however stale.
		let result = await t.query(internal.billingWebhook.listStaleBillingOrgs, {
			staleMs: 0,
			limit: 10,
			cursor: null,
		});
		expect(result.stale).toEqual([]);
		expect(result.isDone).toBe(true);

		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { clerkSubscriptionId: "sub_1" });
		});
		result = await t.query(internal.billingWebhook.listStaleBillingOrgs, {
			staleMs: 48 * 60 * 60 * 1000,
			limit: 10,
			cursor: null,
		});
		expect(result.stale.map((o) => o.orgId)).toEqual([orgId]);

		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { billingSyncedAt: Date.now() });
		});
		result = await t.query(internal.billingWebhook.listStaleBillingOrgs, {
			staleMs: 48 * 60 * 60 * 1000,
			limit: 10,
			cursor: null,
		});
		expect(result.stale).toEqual([]);
	});

	it("markBillingSyncAttempt stamps billingSyncedAt so the org leaves the stale list", async () => {
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, { clerkSubscriptionId: "sub_1" });
		});
		await t.mutation(internal.billingWebhook.markBillingSyncAttempt, {
			orgId,
		});
		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org?.billingSyncedAt).toBeDefined();
		const result = await t.query(internal.billingWebhook.listStaleBillingOrgs, {
			staleMs: 48 * 60 * 60 * 1000,
			limit: 10,
			cursor: null,
		});
		expect(result.stale).toEqual([]);
	});

	it("applyReconciledSubscription repairs a deliberately-staled mirror", async () => {
		await t.run(async (ctx) => {
			await ctx.db.patch(orgId, {
				clerkSubscriptionId: "sub_1",
				clerkPlanSlug: PREMIUM_PLAN_SLUG,
				subscriptionStatus: "active",
			});
		});
		// Clerk says the paid item is gone: slug clears, status follows.
		await t.mutation(internal.billingWebhook.applyReconciledSubscription, {
			orgId,
			subscriptionId: "sub_1",
			planId: null,
			planSlug: null,
			status: "canceled",
		});
		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org?.clerkPlanSlug).toBeUndefined();
		expect(org?.subscriptionStatus).toBe("canceled");
		// Losing premium via reconcile opens the same grace window.
		expect(org?.planGraceUntil).toBeGreaterThan(Date.now());
		expect(org?.billingSyncedAt).toBeDefined();
	});
});
