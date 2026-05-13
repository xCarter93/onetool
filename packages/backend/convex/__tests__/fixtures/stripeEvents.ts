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

// Plan 14.2.1-02 — new event builders for the five new types.

export function buildPayoutPaidEvent(opts: {
	accountId: string;
	payoutId?: string;
	amount?: number; // cents
	currency?: string; // lowercase ISO
	arrivalDate?: number; // epoch seconds
}): Stripe.Event {
	return buildStripeEvent({
		type: "payout.paid",
		account: opts.accountId,
		data: {
			object: {
				id: opts.payoutId ?? "po_test_1",
				object: "payout",
				amount: opts.amount ?? 5000,
				currency: opts.currency ?? "usd",
				arrival_date:
					opts.arrivalDate ?? Math.floor(Date.now() / 1000) + 86400,
				status: "paid",
				type: "bank_account",
				failure_code: null,
				failure_message: null,
			} as unknown as Stripe.Event.Data.Object,
		},
	});
}

export function buildPayoutFailedEvent(opts: {
	accountId: string;
	payoutId?: string;
	amount?: number;
	currency?: string;
	failureCode?: string;
	failureMessage?: string;
}): Stripe.Event {
	return buildStripeEvent({
		type: "payout.failed",
		account: opts.accountId,
		data: {
			object: {
				id: opts.payoutId ?? "po_test_failed_1",
				object: "payout",
				amount: opts.amount ?? 2500,
				currency: opts.currency ?? "usd",
				arrival_date: Math.floor(Date.now() / 1000),
				status: "failed",
				type: "bank_account",
				failure_code: opts.failureCode ?? "insufficient_funds",
				failure_message: opts.failureMessage ?? "Bank rejected",
			} as unknown as Stripe.Event.Data.Object,
		},
	});
}

export function buildCapabilityUpdatedEvent(opts: {
	accountId: string;
	capabilityId: "card_payments" | "transfers" | string;
	status: "active" | "inactive" | "pending" | "unrequested";
	currentlyDue?: string[];
	disabledReason?: string | null;
	// Test hook for T-14.2.1-10: when true, the builder sets event.account=null
	// but keeps data.object.account=opts.accountId so the L-3 fallback can resolve.
	nullEventAccount?: boolean;
}): Stripe.Event {
	return buildStripeEvent({
		type: "capability.updated",
		account: opts.nullEventAccount ? null : opts.accountId,
		data: {
			object: {
				id: opts.capabilityId,
				object: "capability",
				account: opts.accountId,
				status: opts.status,
				requested: true,
				requested_at: Math.floor(Date.now() / 1000),
				requirements: {
					currently_due: opts.currentlyDue ?? [],
					disabled_reason: opts.disabledReason ?? null,
					eventually_due: [],
					past_due: [],
					pending_verification: [],
				},
			} as unknown as Stripe.Event.Data.Object,
		},
	});
}

export function buildExternalAccountCreatedEvent(opts: {
	accountId: string;
	object?: "bank_account" | "card";
	last4?: string;
	bankName?: string | null;
	currency?: string;
}): Stripe.Event {
	const isBank = (opts.object ?? "bank_account") === "bank_account";
	return buildStripeEvent({
		type: "account.external_account.created",
		account: opts.accountId,
		data: {
			object: isBank
				? ({
						id: "ba_test_1",
						object: "bank_account",
						last4: opts.last4 ?? "0002",
						bank_name: opts.bankName ?? "STRIPE TEST BANK",
						currency: opts.currency ?? "usd",
						country: "US",
						status: "new",
					} as unknown as Stripe.Event.Data.Object)
				: ({
						id: "card_test_1",
						object: "card",
						last4: opts.last4 ?? "4242",
						brand: "Visa",
						country: "US",
					} as unknown as Stripe.Event.Data.Object),
		},
	});
}

export function buildExternalAccountUpdatedEvent(opts: {
	accountId: string;
	last4?: string;
	bankName?: string | null;
	currency?: string;
}): Stripe.Event {
	return buildStripeEvent({
		type: "account.external_account.updated",
		account: opts.accountId,
		data: {
			object: {
				id: "ba_test_1",
				object: "bank_account",
				last4: opts.last4 ?? "9999",
				bank_name: opts.bankName ?? "NEW BANK",
				currency: opts.currency ?? "usd",
				country: "US",
				status: "validated",
			} as unknown as Stripe.Event.Data.Object,
		},
	});
}
