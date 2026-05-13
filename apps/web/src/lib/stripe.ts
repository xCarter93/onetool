import Stripe from "stripe";

const API_VERSION = "2026-04-22.dahlia" as const;

// CODE-OWNER: Do NOT set `payment_method_types` on Checkout Session creation.
// The Stripe Dashboard's Payment Method Configuration on the connected
// account is the source of truth. Setting this field overrides it and
// silently disables payment methods the merchant has enabled (Apple Pay,
// Klarna, Cash App, etc). See stripe-best-practices skill rule.

/**
 * Shared Stripe client factory.
 * - Validates the secret key is present.
 * - Pins the requested API version.
 * - Enables built-in retry on transient network/5xx errors.
 */
export function getStripeClient() {
	const secretKey = process.env.STRIPE_SECRET_KEY;

	if (!secretKey) {
		throw new Error(
			"STRIPE_SECRET_KEY is missing. Add it to your environment and redeploy."
		);
	}

	// Instantiate per-call to avoid accidental reuse with stale config in dev.
	return new Stripe(secretKey, {
		apiVersion: API_VERSION,
		maxNetworkRetries: 2,
	});
}
