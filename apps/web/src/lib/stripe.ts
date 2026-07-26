import Stripe from "stripe";
import { env } from "@/env";

const API_VERSION = "2026-04-22.dahlia" as const;

// Do not set `payment_method_types`; Stripe Dashboard configuration controls methods.

/**
 * Shared Stripe client factory.
 * - Key presence is enforced at boot by the t3-env schema.
 * - Pins the requested API version.
 * - Enables built-in retry on transient network/5xx errors.
 */
export function getStripeClient() {
	// Instantiate per-call to avoid accidental reuse with stale config in dev.
	return new Stripe(env.STRIPE_SECRET_KEY, {
		apiVersion: API_VERSION,
		maxNetworkRetries: 2,
	});
}
