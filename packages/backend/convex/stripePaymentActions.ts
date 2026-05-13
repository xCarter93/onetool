"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { verifyStripeSession } from "./lib/stripe";

/**
 * Verify payment with Stripe and mark as paid.
 * This action replaces the old public mutation by adding server-side Stripe verification.
 *
 * Phase 14.2-04 — three assertions reject forged or replayed sessions:
 *   1. metadata.publicToken must match the caller's publicToken (anti-replay)
 *   2. amountTotal must equal Math.round(paymentAmount * 100) (anti-tamper)
 *   3. paymentIntentId must be non-null (audit #14 — no empty-string defaulting)
 */
export const verifyAndMarkPaid = action({
	args: {
		publicToken: v.string(),
		stripeSessionId: v.string(),
	},
	handler: async (ctx, args): Promise<Id<"payments">> => {
		// 1. Look up payment by public token
		const payment = await ctx.runQuery(
			internal.payments.getByPublicTokenInternal,
			{ publicToken: args.publicToken }
		);
		if (!payment) throw new Error("Payment not found");
		if (payment.status === "paid") return payment._id;

		// 2. Get the org's Stripe Connect account ID
		const org = await ctx.runQuery(internal.payments.getOrgStripeAccount, {
			orgId: payment.orgId,
		});

		// 3. Verify with Stripe API (four-field shape: paid, paymentIntentId, amountTotal, metadata)
		const result = await verifyStripeSession(
			args.stripeSessionId,
			org?.stripeConnectAccountId ?? undefined
		);

		// 4. Assertion gauntlet (Phase 14.2-04)
		if (!result.paid) {
			throw new Error("Payment not verified by Stripe");
		}
		if (result.metadata.publicToken !== args.publicToken) {
			throw new Error(
				`Session metadata.publicToken mismatch: expected ${args.publicToken}`
			);
		}
		const expectedCents = Math.round(payment.paymentAmount * 100);
		if (result.amountTotal !== expectedCents) {
			throw new Error(
				`Session amount mismatch: expected ${expectedCents} cents, got ${result.amountTotal}`
			);
		}
		if (!result.paymentIntentId) {
			throw new Error("Session has no payment_intent — cannot mark paid");
		}

		// 5. Mark as paid via internal mutation (PI guaranteed non-null by the assert above)
		return await ctx.runMutation(
			internal.payments.markPaidByPublicTokenInternal,
			{
				publicToken: args.publicToken,
				stripeSessionId: args.stripeSessionId,
				stripePaymentIntentId: result.paymentIntentId,
			}
		);
	},
});

/**
 * Verify invoice payment with Stripe and mark as paid (legacy flow).
 * This action replaces the old public mutation for direct invoice payments.
 *
 * Phase 14.2-04 — same three assertions as verifyAndMarkPaid, adapted to invoice.total.
 * FINDINGS L-4: the metadata-key choice (publicToken — matches the checkout route's
 * `metadata: { publicToken, invoiceId }`) is pinned by a happy-path test.
 */
export const verifyAndMarkInvoicePaid = action({
	args: {
		publicToken: v.string(),
		stripeSessionId: v.string(),
	},
	handler: async (ctx, args): Promise<Id<"invoices">> => {
		// 1. Look up invoice by public token
		const invoice = await ctx.runQuery(
			internal.invoices.getByPublicTokenInternal,
			{ publicToken: args.publicToken }
		);
		if (!invoice) throw new Error("Invoice not found");
		if (invoice.status === "paid") return invoice._id;

		// 2. Get the org's Stripe Connect account ID
		const org = await ctx.runQuery(internal.payments.getOrgStripeAccount, {
			orgId: invoice.orgId,
		});

		// 3. Verify with Stripe API
		const result = await verifyStripeSession(
			args.stripeSessionId,
			org?.stripeConnectAccountId ?? undefined
		);

		// 4. Assertion gauntlet (Phase 14.2-04)
		if (!result.paid) {
			throw new Error("Payment not verified by Stripe");
		}
		if (result.metadata.publicToken !== args.publicToken) {
			throw new Error(
				`Session metadata.publicToken mismatch: expected ${args.publicToken}`
			);
		}
		const expectedCents = Math.round(invoice.total * 100);
		if (result.amountTotal !== expectedCents) {
			throw new Error(
				`Session amount mismatch: expected ${expectedCents} cents, got ${result.amountTotal}`
			);
		}
		if (!result.paymentIntentId) {
			throw new Error("Session has no payment_intent — cannot mark paid");
		}

		// 5. Mark as paid via internal mutation
		return await ctx.runMutation(
			internal.invoices.markPaidByPublicTokenInternal,
			{
				publicToken: args.publicToken,
				stripeSessionId: args.stripeSessionId,
				stripePaymentIntentId: result.paymentIntentId,
			}
		);
	},
});
