"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyStripeSession } from "./lib/stripe";

/**
 * Verify payment with Stripe and mark as paid.
 * This action replaces the old public mutation by adding server-side Stripe verification.
 */
export const verifyAndMarkPaid = action({
	args: {
		publicToken: v.string(),
		stripeSessionId: v.string(),
	},
	handler: async (ctx, args) => {
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

		// 3. Verify with Stripe API
		const result = await verifyStripeSession(
			args.stripeSessionId,
			org?.stripeConnectAccountId ?? undefined
		);
		if (!result.paid) {
			throw new Error("Payment not verified by Stripe");
		}

		// 4. Mark as paid via internal mutation
		return await ctx.runMutation(
			internal.payments.markPaidByPublicTokenInternal,
			{
				publicToken: args.publicToken,
				stripeSessionId: args.stripeSessionId,
				stripePaymentIntentId: result.paymentIntentId ?? "",
			}
		);
	},
});

/**
 * Verify invoice payment with Stripe and mark as paid (legacy flow).
 * This action replaces the old public mutation for direct invoice payments.
 */
export const verifyAndMarkInvoicePaid = action({
	args: {
		publicToken: v.string(),
		stripeSessionId: v.string(),
	},
	handler: async (ctx, args) => {
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
		if (!result.paid) {
			throw new Error("Payment not verified by Stripe");
		}

		// 4. Mark as paid via internal mutation
		return await ctx.runMutation(
			internal.invoices.markPaidByPublicTokenInternal,
			{
				publicToken: args.publicToken,
				stripeSessionId: args.stripeSessionId,
				stripePaymentIntentId: result.paymentIntentId ?? "",
			}
		);
	},
});
