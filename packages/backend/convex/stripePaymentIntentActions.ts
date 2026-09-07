"use node";
import Stripe from "stripe";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { createStripeSdkClient } from "./lib/stripeSdk";

let stripeFactoryOverride: (() => Stripe) | null = null;
export function __setStripeFactoryForTests(factory: (() => Stripe) | null) {
	stripeFactoryOverride = factory;
}

/**
 * Retire a PaymentIntent the installment no longer stands behind (amount
 * edit, cancellation, manual settlement). Scheduled from mutations; a cancel
 * that loses to a success is not an error here — the payment_intent.succeeded
 * webhook records that money as an unapplied attempt.
 */
export const cancelPaymentIntent = internalAction({
	args: { stripeAccountId: v.string(), paymentIntentId: v.string() },
	returns: v.null(),
	handler: async (_ctx, args): Promise<null> => {
		const stripe = stripeFactoryOverride
			? stripeFactoryOverride()
			: createStripeSdkClient();
		try {
			await stripe.paymentIntents.cancel(
				args.paymentIntentId,
				{ cancellation_reason: "abandoned" },
				{ stripeAccount: args.stripeAccountId },
			);
		} catch (err) {
			console.error(
				`cancelPaymentIntent: could not cancel ${args.paymentIntentId} on ${args.stripeAccountId}: ` +
					(err instanceof Error ? err.message : String(err)),
			);
		}
		return null;
	},
});
