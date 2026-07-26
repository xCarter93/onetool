import Stripe from "stripe";

// Single source of truth for the backend's pinned Stripe API version.
export const STRIPE_API_VERSION = "2026-04-22.dahlia" as const;

/**
 * Shared Stripe SDK client for the backend.
 *
 * Only import this from "use node" action files — the Stripe SDK cannot be
 * bundled into the default Convex runtime (http.ts verifies webhooks with
 * lib/webhooks.ts precisely to avoid loading the SDK there).
 */
export function createStripeSdkClient(): Stripe {
	const secretKey = process.env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		throw new Error("STRIPE_SECRET_KEY not configured");
	}
	return new Stripe(secretKey, {
		apiVersion: STRIPE_API_VERSION,
		maxNetworkRetries: 2,
	});
}
