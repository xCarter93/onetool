import Stripe from "stripe";

const API_VERSION = "2026-04-22.dahlia" as const;

// Do not set `payment_method_types`; Stripe Dashboard configuration controls methods.

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
