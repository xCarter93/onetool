import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestOrg } from "./test.helpers";
import {
	buildStripeEvent,
	buildPayoutPaidEvent,
	buildPayoutFailedEvent,
	buildCapabilityUpdatedEvent,
	buildExternalAccountCreatedEvent,
	buildExternalAccountUpdatedEvent,
} from "./__tests__/fixtures/stripeEvents";
import type { Id } from "./_generated/dataModel";
import type Stripe from "stripe";

/**
 * Webhook integration tests for `stripeWebhookActions.handleEvent` covering
 * Phase 14.2 Plan 05's acceptance gates:
 *   - idempotent replay (Plan 01 already pinned the lifecycle row test;
 *     this re-asserts at the action layer)
 *   - account.updated patches org Connect status fields
 *   - charge.refunded transitions payment to "refunded"
 *   - checkout.session.completed happy path delegates to canonical paid
 *     mutation (FINDINGS M-1)
 *   - W-1 failed event becomes retryable on Stripe replay
 *   - W-4 incrementCheckoutAttemptCounter + persistPendingCheckoutSession
 *     lifecycle (the route-level twice-call mock test lives in apps/web —
 *     see SUMMARY notes; here we exercise the mutation contract)
 */

async function seedConnectedOrg(
	t: ReturnType<typeof convexTest>,
	overrides: { accountId: string } = { accountId: "acct_test_webhook" }
) {
	return await t.run(async (ctx) => {
		const { orgId, userId } = await createTestOrg(ctx, {
			clerkOrgId: `org_wh_${Math.random().toString(36).slice(2)}`,
		});
		await ctx.db.patch(orgId, {
			stripeConnectAccountId: overrides.accountId,
		});
		return { orgId, userId };
	});
}

async function seedPayment(
	t: ReturnType<typeof convexTest>,
	args: {
		orgId: Id<"organizations">;
		publicToken: string;
		paymentAmount: number;
		paymentIntentId?: string;
	}
) {
	return await t.run(async (ctx) => {
		const clientId = await ctx.db.insert("clients", {
			orgId: args.orgId,
			companyName: "Webhook Test Client",
			status: "lead",
		});
		const invoiceId = await ctx.db.insert("invoices", {
			orgId: args.orgId,
			clientId,
			invoiceNumber: "INV-WH-001",
			status: "sent",
			subtotal: args.paymentAmount,
			total: args.paymentAmount,
			issuedDate: Date.now(),
			dueDate: Date.now() + 86400000,
			publicToken: `tok_inv_${Math.random().toString(36).slice(2)}`,
		});
		const paymentId = await ctx.db.insert("payments", {
			orgId: args.orgId,
			invoiceId,
			paymentAmount: args.paymentAmount,
			dueDate: Date.now() + 86400000,
			sortOrder: 0,
			status: "pending",
			publicToken: args.publicToken,
			stripePaymentIntentId: args.paymentIntentId,
		});
		return { clientId, invoiceId, paymentId };
	});
}

function buildHandleEventArgs(event: Stripe.Event) {
	return {
		eventId: event.id,
		eventType: event.type,
		account: event.account ?? null,
		created: event.created,
		data: event.data,
	};
}

describe("stripeWebhookActions.handleEvent integration", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("idempotent replay: second call with same eventId returns duplicate=true and does not re-mark payment", async () => {
		const { orgId } = await seedConnectedOrg(t);
		const { paymentId } = await seedPayment(t, {
			orgId,
			publicToken: "tok_idemp_1",
			paymentAmount: 50,
		});

		const event = buildStripeEvent({
			id: "evt_idemp_1",
			type: "checkout.session.completed",
			account: "acct_test_webhook",
			data: {
				object: {
					id: "cs_idemp_1",
					payment_intent: "pi_idemp_1",
					amount_total: 5000,
					metadata: { publicToken: "tok_idemp_1" },
				} as never,
			},
		});

		const first = await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);
		expect(first.duplicate).toBe(false);
		expect(first.orgFound).toBe(true);

		const paymentAfterFirst = await t.run((ctx) => ctx.db.get(paymentId));
		expect(paymentAfterFirst?.status).toBe("paid");
		const paidAtFirst = paymentAfterFirst?.paidAt;

		const second = await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);
		expect(second.duplicate).toBe(true);

		const paymentAfterSecond = await t.run((ctx) => ctx.db.get(paymentId));
		expect(paymentAfterSecond?.status).toBe("paid");
		// paidAt should not be re-stamped on the second (duplicate) call.
		expect(paymentAfterSecond?.paidAt).toBe(paidAtFirst);
	});

	it("account.updated patches org Connect status cache", async () => {
		const { orgId } = await seedConnectedOrg(t);

		const event = buildStripeEvent({
			id: "evt_acct_updated_1",
			type: "account.updated",
			account: "acct_test_webhook",
			data: {
				object: {
					id: "acct_test_webhook",
					charges_enabled: true,
					payouts_enabled: true,
					details_submitted: true,
					requirements: { currently_due: [], disabled_reason: null },
				} as never,
			},
		});

		await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);

		const org = await t.run((ctx) => ctx.db.get(orgId));
		expect(org?.stripeChargesEnabled).toBe(true);
		expect(org?.stripePayoutsEnabled).toBe(true);
		expect(org?.stripeDetailsSubmitted).toBe(true);
	});

	it("charge.refunded transitions payment to refunded", async () => {
		const { orgId } = await seedConnectedOrg(t);
		const { paymentId } = await seedPayment(t, {
			orgId,
			publicToken: "tok_refund_1",
			paymentAmount: 25,
			paymentIntentId: "pi_refund_1",
		});

		const event = buildStripeEvent({
			id: "evt_refund_1",
			type: "charge.refunded",
			account: "acct_test_webhook",
			data: {
				object: {
					id: "ch_refund_1",
					payment_intent: "pi_refund_1",
				} as never,
			},
		});

		await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("refunded");
		expect(payment?.refundedAt).toBeGreaterThan(0);
	});

	it("checkout.session.completed happy path delegates to canonical paid cascade (FINDINGS M-1)", async () => {
		const { orgId } = await seedConnectedOrg(t);
		const { paymentId } = await seedPayment(t, {
			orgId,
			publicToken: "tok_happy_1",
			paymentAmount: 100,
		});

		const event = buildStripeEvent({
			id: "evt_happy_1",
			type: "checkout.session.completed",
			account: "acct_test_webhook",
			data: {
				object: {
					id: "cs_happy_1",
					payment_intent: "pi_happy_1",
					amount_total: 10000,
					metadata: { publicToken: "tok_happy_1" },
				} as never,
			},
		});

		const res = await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);
		expect(res.duplicate).toBe(false);
		expect(res.orgFound).toBe(true);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("paid");
		expect(payment?.stripePaymentIntentId).toBe("pi_happy_1");
		// pendingCheckoutSession* clearing path runs even on a payment that
		// never had a pending session — should remain undefined.
		expect(payment?.pendingCheckoutSessionId).toBeUndefined();
	});

	it("amount mismatch is terminal: event marked processed, payment left unpaid", async () => {
		// Stripe redelivers the same event payload on retry, so a deterministic
		// amount discrepancy cannot self-heal. Throwing would burn ~70 retries.
		// markPaidFromWebhookInternal must log and ack instead.
		const { orgId } = await seedConnectedOrg(t);
		const { paymentId } = await seedPayment(t, {
			orgId,
			publicToken: "tok_retry_1",
			paymentAmount: 100,
		});

		const failingEvent = buildStripeEvent({
			id: "evt_w1_retry",
			type: "checkout.session.completed",
			account: "acct_test_webhook",
			data: {
				object: {
					id: "cs_w1_retry",
					payment_intent: "pi_w1_retry",
					// MISMATCH — payment is $100 (10000 cents); 9999 should not crash.
					amount_total: 9999,
					metadata: { publicToken: "tok_retry_1" },
				} as never,
			},
		});

		const res = await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(failingEvent)
		);
		expect(res).toEqual({ duplicate: false, orgFound: true });

		const allRows = await t.run((ctx) =>
			ctx.db.query("stripeWebhookEvents").collect()
		);
		const row = allRows.find((r) => r.stripeEventId === "evt_w1_retry");
		expect(row?.status).toBe("processed");
		expect(row?.attemptCount).toBe(1);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("pending");
	});

	it("W-4 pending-session lifecycle: increment + persist mutations match the route contract", async () => {
		// The route-level "called twice, mock fires once" test belongs in
		// apps/web (route harness — see SUMMARY note on test location).
		// Here we pin the BACKEND mutation contract that backs the W-4 flow:
		// incrementCheckoutAttemptCounterInternal returns monotonically
		// increasing values and persistPendingCheckoutSessionInternal writes
		// the three pending-session fields back to the payment row.
		const { orgId } = await seedConnectedOrg(t);
		const { paymentId } = await seedPayment(t, {
			orgId,
			publicToken: "tok_w4_1",
			paymentAmount: 75,
		});

		const attempt1 = await t.mutation(
			api.payments.incrementCheckoutAttemptCounterInternal,
			{ publicToken: "tok_w4_1" }
		);
		expect(attempt1).toBe(1);
		const attempt2 = await t.mutation(
			api.payments.incrementCheckoutAttemptCounterInternal,
			{ publicToken: "tok_w4_1" }
		);
		expect(attempt2).toBe(2);

		const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
		await t.mutation(api.payments.persistPendingCheckoutSessionInternal, {
			publicToken: "tok_w4_1",
			pendingCheckoutSessionId: "cs_test_w4abc1",
			pendingCheckoutSessionUrl: "https://checkout.stripe.com/cs_test_w4abc1",
			pendingCheckoutSessionExpiresAt: expiresAt,
		});

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.pendingCheckoutSessionId).toBe("cs_test_w4abc1");
		expect(payment?.pendingCheckoutSessionUrl).toBe(
			"https://checkout.stripe.com/cs_test_w4abc1"
		);
		expect(payment?.pendingCheckoutSessionExpiresAt).toBe(expiresAt);
		expect(payment?.checkoutAttemptCounter).toBe(2);

		// `markPaidFromWebhookInternal` clears the three pending fields when
		// session.id matches — confirm via a happy-path webhook event.
		const completedEvent = buildStripeEvent({
			id: "evt_w4_complete",
			type: "checkout.session.completed",
			account: "acct_test_webhook",
			data: {
				object: {
					id: "cs_test_w4abc1",
					payment_intent: "pi_w4_1",
					amount_total: 7500,
					metadata: { publicToken: "tok_w4_1" },
				} as never,
			},
		});
		await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(completedEvent)
		);
		const cleared = await t.run((ctx) => ctx.db.get(paymentId));
		expect(cleared?.pendingCheckoutSessionId).toBeUndefined();
		expect(cleared?.pendingCheckoutSessionUrl).toBeUndefined();
		expect(cleared?.pendingCheckoutSessionExpiresAt).toBeUndefined();
	});

	// Plan 14.2.1-02 Wave 2 — five new Connect lifecycle webhook events.

	it("T-14.2.1-01: payout.paid emits payout_paid notification with dollars + arrival", async () => {
		const accountId = "acct_test_payout_paid";
		const { orgId } = await seedConnectedOrg(t, { accountId });

		const event = buildPayoutPaidEvent({
			accountId,
			payoutId: "po_test_t01",
			amount: 5000,
			currency: "usd",
			arrivalDate: 1778716800, // 2026-05-14 UTC
		});

		const result = await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);
		expect(result).toEqual({ duplicate: false, orgFound: true });

		const notifications = await t.run(async (ctx) =>
			ctx.db
				.query("notifications")
				.filter((q) => q.eq(q.field("orgId"), orgId))
				.collect()
		);
		expect(notifications).toHaveLength(1);
		expect(notifications[0].notificationType).toBe("payout_paid");
		expect(notifications[0].priority).toBe("normal");
		expect(notifications[0].message).toMatch(/\$50\.00 USD/);
		expect(notifications[0].message).toMatch(/2026-05-14/);
	});

	it("T-14.2.1-02: payout.failed emits payout_failed high-priority notification with failure code/message", async () => {
		const accountId = "acct_test_payout_failed";
		const { orgId } = await seedConnectedOrg(t, { accountId });

		const event = buildPayoutFailedEvent({
			accountId,
			payoutId: "po_test_t02",
			amount: 2500,
			currency: "usd",
			failureCode: "insufficient_funds",
			failureMessage: "Bank rejected",
		});

		await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);

		const notifications = await t.run(async (ctx) =>
			ctx.db
				.query("notifications")
				.filter((q) => q.eq(q.field("orgId"), orgId))
				.collect()
		);
		expect(notifications).toHaveLength(1);
		expect(notifications[0].notificationType).toBe("payout_failed");
		expect(notifications[0].priority).toBe("high");
		expect(notifications[0].message).toMatch(/insufficient_funds: Bank rejected/);
	});

	it("T-14.2.1-03: capability.updated card_payments active->inactive patches charges-enabled cache + emits capability_degraded", async () => {
		const accountId = "acct_test_t03";
		const { orgId } = await seedConnectedOrg(t, { accountId });
		await t.run((ctx) =>
			ctx.db.patch(orgId, { stripeChargesEnabled: true })
		);

		const event = buildCapabilityUpdatedEvent({
			accountId,
			capabilityId: "card_payments",
			status: "inactive",
			currentlyDue: ["external_account"],
			disabledReason: "requirements.past_due",
		});

		await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);

		const org = await t.run((ctx) => ctx.db.get(orgId));
		expect(org?.stripeChargesEnabled).toBe(false);
		expect(org?.stripeRequirementsDisabledReason).toBe("requirements.past_due");
		expect(org?.stripeRequirementsCurrentlyDue).toEqual(["external_account"]);

		const notifications = await t.run(async (ctx) =>
			ctx.db
				.query("notifications")
				.filter((q) => q.eq(q.field("orgId"), orgId))
				.collect()
		);
		const degraded = notifications.filter(
			(n) => n.notificationType === "capability_degraded"
		);
		expect(degraded).toHaveLength(1);
		expect(degraded[0].priority).toBe("high");
		expect(degraded[0].message).toMatch(
			/Stripe charges have been disabled.*requirements\.past_due/
		);
	});

	it("T-14.2.1-04: capability.updated inactive->active does NOT emit capability_degraded (gate, no-clobber)", async () => {
		const accountId = "acct_test_t04";
		const { orgId } = await seedConnectedOrg(t, { accountId });
		await t.run((ctx) =>
			ctx.db.patch(orgId, {
				stripeChargesEnabled: false,
				stripeRequirementsCurrentlyDue: ["existing_value"],
				stripeRequirementsDisabledReason: "existing_reason",
			})
		);

		const event = buildCapabilityUpdatedEvent({
			accountId,
			capabilityId: "card_payments",
			status: "active",
			currentlyDue: [],
			disabledReason: null,
		});

		await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);

		const org = await t.run((ctx) => ctx.db.get(orgId));
		expect(org?.stripeChargesEnabled).toBe(true);
		// No-clobber: requirement fields stay at their seeded values because
		// account.updated owns the canonical fuller snapshot.
		expect(org?.stripeRequirementsCurrentlyDue).toEqual(["existing_value"]);
		expect(org?.stripeRequirementsDisabledReason).toBe("existing_reason");

		const notifications = await t.run(async (ctx) =>
			ctx.db
				.query("notifications")
				.filter((q) => q.eq(q.field("orgId"), orgId))
				.collect()
		);
		const degraded = notifications.filter(
			(n) => n.notificationType === "capability_degraded"
		);
		expect(degraded).toHaveLength(0);
	});

	it("T-14.2.1-05: account.external_account.created bank_account -> persists last4/bankName + emits bank_account_changed", async () => {
		const accountId = "acct_test_t05";
		const { orgId } = await seedConnectedOrg(t, { accountId });

		const before = Date.now();
		const event = buildExternalAccountCreatedEvent({
			accountId,
			object: "bank_account",
			last4: "0002",
			bankName: "STRIPE TEST BANK",
			currency: "usd",
		});

		await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);

		const org = await t.run((ctx) => ctx.db.get(orgId));
		expect(org?.stripeExternalAccountLast4).toBe("0002");
		expect(org?.stripeExternalAccountBankName).toBe("STRIPE TEST BANK");
		expect(org?.stripeExternalAccountUpdatedAt).toBeGreaterThanOrEqual(before);

		const notifications = await t.run(async (ctx) =>
			ctx.db
				.query("notifications")
				.filter((q) => q.eq(q.field("orgId"), orgId))
				.collect()
		);
		const bankNotifs = notifications.filter(
			(n) => n.notificationType === "bank_account_changed"
		);
		expect(bankNotifs).toHaveLength(1);
		expect(bankNotifs[0].priority).toBe("normal");
	});

	it("T-14.2.1-06: account.external_account.updated overwrites prior last4/bankName (idempotent)", async () => {
		const accountId = "acct_test_t06";
		const { orgId } = await seedConnectedOrg(t, { accountId });
		await t.run((ctx) =>
			ctx.db.patch(orgId, {
				stripeExternalAccountLast4: "0002",
				stripeExternalAccountBankName: "OLD",
				stripeExternalAccountUpdatedAt: 1700000000000,
			})
		);

		const event = buildExternalAccountUpdatedEvent({
			accountId,
			last4: "9999",
			bankName: "NEW",
			currency: "usd",
		});

		await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);

		const org = await t.run((ctx) => ctx.db.get(orgId));
		expect(org?.stripeExternalAccountLast4).toBe("9999");
		expect(org?.stripeExternalAccountBankName).toBe("NEW");
	});

	it("T-14.2.1-07: account.external_account.created card -> no-op + log (discrimination negative)", async () => {
		const accountId = "acct_test_t07";
		const { orgId } = await seedConnectedOrg(t, { accountId });
		await t.run((ctx) =>
			ctx.db.patch(orgId, {
				stripeExternalAccountLast4: "0002",
				stripeExternalAccountBankName: "EXISTING BANK",
			})
		);

		const event = buildExternalAccountCreatedEvent({
			accountId,
			object: "card",
			last4: "4242",
		});

		const result = await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);
		expect(result).toEqual({ duplicate: false, orgFound: true });

		const org = await t.run((ctx) => ctx.db.get(orgId));
		// Bank-account fields unchanged — card events must never touch them.
		expect(org?.stripeExternalAccountLast4).toBe("0002");
		expect(org?.stripeExternalAccountBankName).toBe("EXISTING BANK");

		const notifications = await t.run(async (ctx) =>
			ctx.db
				.query("notifications")
				.filter((q) => q.eq(q.field("orgId"), orgId))
				.collect()
		);
		const bankNotifs = notifications.filter(
			(n) => n.notificationType === "bank_account_changed"
		);
		expect(bankNotifs).toHaveLength(0);
	});

	it("T-14.2.1-09: capability.updated transfers active->inactive patches stripePayoutsEnabled=false + emits capability_degraded for payouts", async () => {
		const accountId = "acct_test_t09";
		const { orgId } = await seedConnectedOrg(t, { accountId });
		await t.run((ctx) =>
			ctx.db.patch(orgId, {
				stripeChargesEnabled: true,
				stripePayoutsEnabled: true,
			})
		);

		const event = buildCapabilityUpdatedEvent({
			accountId,
			capabilityId: "transfers",
			status: "inactive",
			currentlyDue: ["external_account"],
			disabledReason: "requirements.past_due",
		});

		await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);

		const org = await t.run((ctx) => ctx.db.get(orgId));
		expect(org?.stripePayoutsEnabled).toBe(false);
		// Charges cache must NOT be flipped by a transfers-capability event.
		expect(org?.stripeChargesEnabled).toBe(true);

		const notifications = await t.run(async (ctx) =>
			ctx.db
				.query("notifications")
				.filter((q) => q.eq(q.field("orgId"), orgId))
				.collect()
		);
		const degraded = notifications.filter(
			(n) => n.notificationType === "capability_degraded"
		);
		expect(degraded).toHaveLength(1);
		expect(degraded[0].priority).toBe("high");
		expect(degraded[0].message).toMatch(/Stripe payouts have been disabled/);
		expect(degraded[0].message).not.toMatch(/charges/);
	});

	it("T-14.2.1-10: capability.updated with null event.account resolves org via data.object.account fallback (L-3 extension)", async () => {
		const accountId = "acct_test_l3";
		const { orgId } = await seedConnectedOrg(t, { accountId });
		await t.run((ctx) =>
			ctx.db.patch(orgId, { stripeChargesEnabled: true })
		);

		const event = buildCapabilityUpdatedEvent({
			accountId,
			capabilityId: "card_payments",
			status: "inactive",
			currentlyDue: ["external_account"],
			disabledReason: "requirements.past_due",
			nullEventAccount: true,
		});
		// Sanity check on the fixture: event.account must be null for this test.
		expect(event.account).toBeNull();

		const result = await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);
		expect(result).toEqual({ duplicate: false, orgFound: true });

		const org = await t.run((ctx) => ctx.db.get(orgId));
		expect(org?.stripeChargesEnabled).toBe(false);
	});
});
