import Stripe from "stripe";

/**
 * Build a synthetic Stripe.Event with sensible defaults. Override any field
 * via `overrides`. Used by webhook handler tests and integration tests.
 */
export function buildStripeEvent(
	overrides: Partial<Stripe.Event> & { type: Stripe.Event["type"] }
): Stripe.Event {
	const now = Math.floor(Date.now() / 1000);
	return {
		id: overrides.id ?? `evt_test_${Math.random().toString(36).slice(2, 10)}`,
		object: "event",
		api_version: "2026-04-22.dahlia",
		created: overrides.created ?? now,
		livemode: false,
		pending_webhooks: 0,
		request: { id: null, idempotency_key: null },
		account: overrides.account,
		data: overrides.data ?? { object: {} as Stripe.Event.Data["object"] },
		...overrides,
	} as Stripe.Event;
}

/**
 * Build the (rawBody, signature) tuple a real Stripe webhook delivers.
 * Uses Stripe SDK's documented `generateTestHeaderString` so multi-`v1=`
 * rotation headers and any future signature-format tweaks stay in lockstep
 * with what `constructEventAsync` verifies against (FINDINGS M-3 — replaces
 * the prior hand-rolled HMAC signer).
 */
export function buildSignedWebhookRequest(
	event: Stripe.Event,
	secret: string,
	timestamp: number = Math.floor(Date.now() / 1000)
): { rawBody: string; signature: string; timestamp: number } {
	const rawBody = JSON.stringify(event);
	const signature = Stripe.webhooks.generateTestHeaderString({
		payload: rawBody,
		secret,
		timestamp,
	});
	return { rawBody, signature, timestamp };
}
