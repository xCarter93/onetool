// Plan 15-03 — payment_intent.succeeded gauntlet + handleEvent integration.
// Task 1 lands four gauntlet bodies that hit the mutation directly; Task 2
// lands the remaining two bodies (cardBrand extraction + idempotent dedupe)
// once handleEvent's new case + DI seam are wired.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "../_generated/api";
import { setupConvexTest } from "../test.setup";
import { createTestOrg } from "../test.helpers";
import { buildStripeEvent } from "./fixtures/stripeEvents";
import { __setStripeClientForTests } from "../stripeWebhookActions";
import type { Id } from "../_generated/dataModel";
import type Stripe from "stripe";

async function seedConnectedOrg(
	t: ReturnType<typeof convexTest>,
	accountId = "acct_test_pi_webhook",
) {
	return await t.run(async (ctx) => {
		const { orgId, userId } = await createTestOrg(ctx, {
			clerkOrgId: `org_pi_${Math.random().toString(36).slice(2)}`,
		});
		await ctx.db.patch(orgId, {
			stripeConnectAccountId: accountId,
			stripeChargesEnabled: true,
		});
		return { orgId, userId };
	});
}

type SeedPaymentArgs = {
	orgId: Id<"organizations">;
	publicToken: string;
	paymentAmount: number;
	pendingPaymentIntentId?: string;
	pendingPaymentIntentClientSecret?: string;
	pendingPaymentIntentExpiresAt?: number;
};

async function seedPayment(
	t: ReturnType<typeof convexTest>,
	args: SeedPaymentArgs,
) {
	return await t.run(async (ctx) => {
		const clientId = await ctx.db.insert("clients", {
			orgId: args.orgId,
			companyName: "PI Webhook Test Client",
			status: "lead",
		});
		const invoiceId = await ctx.db.insert("invoices", {
			orgId: args.orgId,
			clientId,
			invoiceNumber: "INV-PI-001",
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
			pendingPaymentIntentId: args.pendingPaymentIntentId,
			pendingPaymentIntentClientSecret: args.pendingPaymentIntentClientSecret,
			pendingPaymentIntentExpiresAt: args.pendingPaymentIntentExpiresAt,
		});
		return { clientId, invoiceId, paymentId };
	});
}

describe("stripeWebhookActions: payment_intent.succeeded", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	// -------------------------------------------------------------------------
	// Gauntlet — direct calls to markPaidFromPaymentIntentWebhookInternal.
	// Task 1 owns these four; the remaining two (handleEvent layer) are below.
	// -------------------------------------------------------------------------

	it("payment_intent.succeeded: three-assertion gauntlet — publicToken match, amount_received === Math.round(paymentAmount * 100), paymentIntentId non-null", async () => {
		const { orgId } = await seedConnectedOrg(t);
		const { paymentId } = await seedPayment(t, {
			orgId,
			publicToken: "tok_gauntlet_happy",
			paymentAmount: 100,
		});

		await t.mutation(
			internal.payments.markPaidFromPaymentIntentWebhookInternal,
			{
				orgId,
				paymentIntentId: "pi_gauntlet_happy",
				amountReceived: 10000,
				metadata: { publicToken: "tok_gauntlet_happy" },
			},
		);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("paid");
		expect(payment?.paidAt).toBeGreaterThan(0);
		expect(payment?.stripePaymentIntentId).toBe("pi_gauntlet_happy");
	});

	it("payment_intent.succeeded: amount-tamper resistance — pi.amount_received !== Math.round(payment.paymentAmount * 100) throws and does NOT mark paid", async () => {
		const { orgId } = await seedConnectedOrg(t);
		const { paymentId } = await seedPayment(t, {
			orgId,
			publicToken: "tok_tamper_1",
			paymentAmount: 100,
		});

		await expect(
			t.mutation(
				internal.payments.markPaidFromPaymentIntentWebhookInternal,
				{
					orgId,
					paymentIntentId: "pi_tamper_1",
					amountReceived: 9999, // expected 10000 cents
					metadata: { publicToken: "tok_tamper_1" },
				},
			),
		).rejects.toThrow();

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("pending");
		expect(payment?.paidAt).toBeUndefined();
	});

	it("payment_intent.succeeded: publicToken-replay resistance — metadata.publicToken mismatch throws and does NOT mark paid", async () => {
		const { orgId } = await seedConnectedOrg(t);
		const { paymentId } = await seedPayment(t, {
			orgId,
			publicToken: "tok_replay_actual",
			paymentAmount: 50,
		});

		await expect(
			t.mutation(
				internal.payments.markPaidFromPaymentIntentWebhookInternal,
				{
					orgId,
					paymentIntentId: "pi_replay_1",
					amountReceived: 5000,
					metadata: { publicToken: "tok_replay_DOES_NOT_EXIST" },
				},
			),
		).rejects.toThrow();

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("pending");
	});

	it("payment_intent.succeeded: clears pendingPaymentIntent* fields on the payment row on success (single canonical writer via applyMarkPaidCascade helper — no nested ctx.runMutation)", async () => {
		const { orgId } = await seedConnectedOrg(t);
		const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
		const { paymentId } = await seedPayment(t, {
			orgId,
			publicToken: "tok_clear_1",
			paymentAmount: 75,
			pendingPaymentIntentId: "pi_clear_pending_1",
			pendingPaymentIntentClientSecret: "pi_clear_pending_1_secret_xyz",
			pendingPaymentIntentExpiresAt: expiresAt,
		});

		await t.mutation(
			internal.payments.markPaidFromPaymentIntentWebhookInternal,
			{
				orgId,
				paymentIntentId: "pi_clear_succeed_1",
				amountReceived: 7500,
				metadata: { publicToken: "tok_clear_1" },
				cardBrand: "visa",
				cardLast4: "4242",
				stripeReceiptUrl: "https://stripe.com/receipt/clear-xyz",
			},
		);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("paid");
		expect(payment?.paidAt).toBeGreaterThan(0);
		expect(payment?.pendingPaymentIntentId).toBeUndefined();
		expect(payment?.pendingPaymentIntentClientSecret).toBeUndefined();
		expect(payment?.pendingPaymentIntentExpiresAt).toBeUndefined();
		expect(payment?.cardBrand).toBe("visa");
		expect(payment?.cardLast4).toBe("4242");
		expect(payment?.stripeReceiptUrl).toBe(
			"https://stripe.com/receipt/clear-xyz",
		);
	});

	// -------------------------------------------------------------------------
	// handleEvent integration — DI mock at the Stripe SDK layer (REVIEWS ISSUE-7).
	// -------------------------------------------------------------------------

	afterEach(() => {
		__setStripeClientForTests(null);
	});

	function buildHandleEventArgs(event: Stripe.Event) {
		return {
			eventId: event.id,
			eventType: event.type,
			account: event.account ?? null,
			created: event.created,
			data: event.data,
		};
	}

	it("payment_intent.succeeded: extracts cardBrand, cardLast4, stripeReceiptUrl from latest_charge and persists onto the payment row", async () => {
		const accountId = "acct_test_pi_extract";
		const { orgId } = await seedConnectedOrg(t, accountId);
		const { paymentId } = await seedPayment(t, {
			orgId,
			publicToken: "tok_extract_1",
			paymentAmount: 50,
		});

		const chargesRetrieve = vi.fn().mockResolvedValue({
			payment_method_details: { card: { brand: "visa", last4: "4242" } },
			receipt_url: "https://stripe.com/receipt/extract-1",
		});
		const stripeMock = {
			charges: { retrieve: chargesRetrieve },
			paymentIntents: { retrieve: vi.fn() },
		} as unknown as Parameters<typeof __setStripeClientForTests>[0];
		__setStripeClientForTests(stripeMock);

		const event = buildStripeEvent({
			id: "evt_pi_extract_1",
			type: "payment_intent.succeeded",
			account: accountId,
			data: {
				object: {
					id: "pi_extract_1",
					amount_received: 5000,
					latest_charge: "ch_extract_1",
					metadata: { publicToken: "tok_extract_1" },
				} as never,
			},
		});

		const result = await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event),
		);
		expect(result.duplicate).toBe(false);
		expect(result.orgFound).toBe(true);

		expect(chargesRetrieve).toHaveBeenCalledTimes(1);
		expect(chargesRetrieve).toHaveBeenCalledWith(
			"ch_extract_1",
			undefined,
			{ stripeAccount: accountId },
		);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("paid");
		expect(payment?.cardBrand).toBe("visa");
		expect(payment?.cardLast4).toBe("4242");
		expect(payment?.stripeReceiptUrl).toBe(
			"https://stripe.com/receipt/extract-1",
		);
	});

	it("payment_intent.succeeded: dedupes idempotently — re-firing the same event_id yields { duplicate: true } and does not double-write", async () => {
		const accountId = "acct_test_pi_dedupe";
		const { orgId } = await seedConnectedOrg(t, accountId);
		const { paymentId } = await seedPayment(t, {
			orgId,
			publicToken: "tok_dedupe_1",
			paymentAmount: 25,
		});

		const chargesRetrieve = vi.fn().mockResolvedValue({
			payment_method_details: { card: { brand: "mastercard", last4: "5555" } },
			receipt_url: "https://stripe.com/receipt/dedupe-1",
		});
		__setStripeClientForTests({
			charges: { retrieve: chargesRetrieve },
			paymentIntents: { retrieve: vi.fn() },
		} as unknown as Parameters<typeof __setStripeClientForTests>[0]);

		const event = buildStripeEvent({
			id: "evt_pi_dedupe_1",
			type: "payment_intent.succeeded",
			account: accountId,
			data: {
				object: {
					id: "pi_dedupe_1",
					amount_received: 2500,
					latest_charge: "ch_dedupe_1",
					metadata: { publicToken: "tok_dedupe_1" },
				} as never,
			},
		});

		const first = await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event),
		);
		expect(first.duplicate).toBe(false);
		const paymentAfterFirst = await t.run((ctx) => ctx.db.get(paymentId));
		const paidAtFirst = paymentAfterFirst?.paidAt;
		expect(paymentAfterFirst?.status).toBe("paid");

		const second = await t.action(
			internal.stripeWebhookActions.handleEvent,
			buildHandleEventArgs(event),
		);
		expect(second.duplicate).toBe(true);

		// charges.retrieve was NOT called again on the duplicate event.
		expect(chargesRetrieve).toHaveBeenCalledTimes(1);

		const paymentAfterSecond = await t.run((ctx) => ctx.db.get(paymentId));
		expect(paymentAfterSecond?.paidAt).toBe(paidAtFirst);
	});
});
