import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestOrg } from "./test.helpers";
import { buildStripeEvent } from "./__tests__/fixtures/stripeEvents";
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
			api.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event)
		);
		expect(first.duplicate).toBe(false);
		expect(first.orgFound).toBe(true);

		const paymentAfterFirst = await t.run((ctx) => ctx.db.get(paymentId));
		expect(paymentAfterFirst?.status).toBe("paid");
		const paidAtFirst = paymentAfterFirst?.paidAt;

		const second = await t.action(
			api.stripeWebhookActions.handleEvent,
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
			api.stripeWebhookActions.handleEvent,
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
			api.stripeWebhookActions.handleEvent,
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
			api.stripeWebhookActions.handleEvent,
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

	it("failed event becomes retryable on Stripe replay (FINDINGS W-1)", async () => {
		const { orgId } = await seedConnectedOrg(t);
		const { paymentId } = await seedPayment(t, {
			orgId,
			publicToken: "tok_retry_1",
			paymentAmount: 100,
		});

		// First call: amount mismatch forces markPaidFromWebhookInternal to throw.
		const failingEvent = buildStripeEvent({
			id: "evt_w1_retry",
			type: "checkout.session.completed",
			account: "acct_test_webhook",
			data: {
				object: {
					id: "cs_w1_retry",
					payment_intent: "pi_w1_retry",
					// MISMATCH — payment is $100 (10000 cents); 9999 will throw.
					amount_total: 9999,
					metadata: { publicToken: "tok_retry_1" },
				} as never,
			},
		});

		await expect(
			t.action(
				api.stripeWebhookActions.handleEvent,
				buildHandleEventArgs(failingEvent)
			)
		).rejects.toThrow();

		const allRowsAfterFail = await t.run((ctx) =>
			ctx.db.query("stripeWebhookEvents").collect()
		);
		const rowsAfterFail = allRowsAfterFail.filter(
			(r) => r.stripeEventId === "evt_w1_retry"
		);
		expect(rowsAfterFail).toHaveLength(1);
		expect(rowsAfterFail[0].status).toBe("failed");
		expect(rowsAfterFail[0].attemptCount).toBe(1);

		// Replay the SAME eventId with a CORRECTED amount. Must NOT short-circuit
		// as duplicate (status is "failed", not "processed") — the type-switch
		// runs again, succeeds, and the row transitions to processed @ attempt 2.
		const replayEvent = buildStripeEvent({
			id: "evt_w1_retry",
			type: "checkout.session.completed",
			account: "acct_test_webhook",
			data: {
				object: {
					id: "cs_w1_retry",
					payment_intent: "pi_w1_retry",
					amount_total: 10000,
					metadata: { publicToken: "tok_retry_1" },
				} as never,
			},
		});

		const replayRes = await t.action(
			api.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(replayEvent)
		);
		expect(replayRes.duplicate).toBe(false);

		const allRowsAfterReplay = await t.run((ctx) =>
			ctx.db.query("stripeWebhookEvents").collect()
		);
		const rowsAfterReplay = allRowsAfterReplay.filter(
			(r) => r.stripeEventId === "evt_w1_retry"
		);
		expect(rowsAfterReplay[0].status).toBe("processed");
		expect(rowsAfterReplay[0].attemptCount).toBe(2);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("paid");
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
			pendingCheckoutSessionId: "cs_w4_1",
			pendingCheckoutSessionUrl: "https://checkout.stripe.com/cs_w4_1",
			pendingCheckoutSessionExpiresAt: expiresAt,
		});

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.pendingCheckoutSessionId).toBe("cs_w4_1");
		expect(payment?.pendingCheckoutSessionUrl).toBe(
			"https://checkout.stripe.com/cs_w4_1"
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
					id: "cs_w4_1",
					payment_intent: "pi_w4_1",
					amount_total: 7500,
					metadata: { publicToken: "tok_w4_1" },
				} as never,
			},
		});
		await t.action(
			api.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(completedEvent)
		);
		const cleared = await t.run((ctx) => ctx.db.get(paymentId));
		expect(cleared?.pendingCheckoutSessionId).toBeUndefined();
		expect(cleared?.pendingCheckoutSessionUrl).toBeUndefined();
		expect(cleared?.pendingCheckoutSessionExpiresAt).toBeUndefined();
	});
});

// Suppress unused-import warning for internal — referenced by reachability above.
void internal;
