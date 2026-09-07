"use node";
import Stripe from "stripe";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { createStripeSdkClient } from "./lib/stripeSdk";

let stripeFactoryOverride: (() => Stripe) | null = null;
export function __setStripeFactoryForTests(factory: (() => Stripe) | null) {
	stripeFactoryOverride = factory;
}

// The SDK retries within one request; this covers an outage that outlives it,
// while the client secret is still chargeable in the payer's browser.
const MAX_CANCEL_ATTEMPTS = 5;
const CANCEL_RETRY_BASE_MS = 30_000;

/**
 * Retire a PaymentIntent the installment no longer stands behind (amount
 * edit, cancellation, manual settlement). Scheduled from mutations; a cancel
 * that loses to a success is not an error here — the payment_intent.succeeded
 * webhook records that money as an unapplied attempt.
 */
export const cancelPaymentIntent = internalAction({
	args: {
		stripeAccountId: v.string(),
		paymentIntentId: v.string(),
		attempt: v.optional(v.number()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const stripe = stripeFactoryOverride
			? stripeFactoryOverride()
			: createStripeSdkClient();
		const attempt = args.attempt ?? 1;
		try {
			await stripe.paymentIntents.cancel(
				args.paymentIntentId,
				{ cancellation_reason: "abandoned" },
				{ stripeAccount: args.stripeAccountId },
			);
		} catch (err) {
			const transient =
				err instanceof Stripe.errors.StripeConnectionError ||
				err instanceof Stripe.errors.StripeAPIError ||
				err instanceof Stripe.errors.StripeRateLimitError;
			if (transient && attempt < MAX_CANCEL_ATTEMPTS) {
				await ctx.scheduler.runAfter(
					CANCEL_RETRY_BASE_MS * 2 ** (attempt - 1),
					internal.stripePaymentIntentActions.cancelPaymentIntent,
					{ ...args, attempt: attempt + 1 },
				);
				return null;
			}
			console.error(
				`cancelPaymentIntent: could not cancel ${args.paymentIntentId} on ${args.stripeAccountId} (attempt ${attempt}): ` +
					(err instanceof Error ? err.message : String(err)),
			);
		}
		return null;
	},
});
