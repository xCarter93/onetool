"use node";
// PaymentIntent minter for the portal. An installment has at most one live
// intent: a cached one is resumed, reported (processing / succeeded), or
// canceled on Stripe before a replacement is minted. The
// checkoutAttemptCounter advances ONLY after a successful Stripe call so a
// transient failure does not burn the next idempotency key.
import Stripe from "stripe";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
import { dollarsToCents } from "../lib/money";
import { createStripeSdkClient } from "../lib/stripeSdk";

// Test seam: vi.mock("stripe") wires this in tests so SDK calls never network out.
let stripeFactoryOverride: (() => Stripe) | null = null;
export function __setStripeFactoryForTests(factory: (() => Stripe) | null) {
	stripeFactoryOverride = factory;
}
function buildStripeClient(): Stripe {
	if (stripeFactoryOverride) return stripeFactoryOverride();
	return createStripeSdkClient();
}

/**
 * `ready`: confirm with `clientSecret`. `processing`: an async method (e.g.
 * ACH) is settling — show a waiting state, do not offer payment again.
 * `succeeded_pending_confirmation`: Stripe has the money; the webhook that
 * marks the row paid has not landed yet. `clientSecret` is always the cached
 * secret so the client can poll the intent in the latter two states.
 */
type PaymentIntentStatus =
	| "ready"
	| "processing"
	| "succeeded_pending_confirmation";

type CreatePaymentIntentResult = {
	status: PaymentIntentStatus;
	clientSecret: string;
	publishableKey: string;
	stripeAccountId: string;
	paymentId: import("../_generated/dataModel").Id<"payments">;
	amount: number;
};

export const createPaymentIntent = action({
	args: { invoiceId: v.id("invoices") },
	returns: v.object({
		status: v.union(
			v.literal("ready"),
			v.literal("processing"),
			v.literal("succeeded_pending_confirmation"),
		),
		clientSecret: v.string(),
		publishableKey: v.string(),
		stripeAccountId: v.string(),
		paymentId: v.id("payments"),
		amount: v.number(),
	}),
	handler: async (ctx, args): Promise<CreatePaymentIntentResult> => {
		const session = await ctx.runQuery(
			internal.portal.invoices._getPortalSessionForAction,
			{},
		);
		await ctx.runMutation(internal.portal.invoices._rateLimitPreflight, {
			sessionJti: session.tokenJti,
		});

		const resolved = await ctx.runQuery(
			internal.portal.invoices._getPaymentTargetInternal,
			{
				invoiceId: args.invoiceId,
				sessionClientContactId: session.clientContactId,
				sessionOrgId: session.orgId,
			},
		);

		// Money already moved on this row without landing; a second charge would double-bill.
		if (resolved.payment.unappliedStripePaymentIntentIds.length > 0) {
			throw new ConvexError({ code: "PAYMENT_NEEDS_REVIEW" });
		}

		if (resolved.org.stripeChargesEnabled !== true) {
			throw new ConvexError({ code: "PAYMENTS_NOT_ENABLED" });
		}
		const stripeAccountId = resolved.org.stripeConnectAccountId;
		if (!stripeAccountId) {
			throw new ConvexError({ code: "PAYMENTS_NOT_ENABLED" });
		}

		const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
		if (!publishableKey) {
			throw new ConvexError({ code: "STRIPE_KEYS_MISSING" });
		}

		const stripe = buildStripeClient();
		const now = Date.now();
		const amountCents = dollarsToCents(resolved.payment.paymentAmount);
		if (amountCents <= 0) {
			throw new ConvexError({ code: "INVALID_AMOUNT" });
		}
		const base = {
			publishableKey,
			stripeAccountId,
			paymentId: resolved.payment._id,
			amount: resolved.payment.paymentAmount,
		};

		const cachedId = resolved.payment.pendingPaymentIntentId;
		if (cachedId) {
			let cached: Stripe.PaymentIntent;
			try {
				cached = await stripe.paymentIntents.retrieve(cachedId, undefined, {
					stripeAccount: stripeAccountId,
				});
			} catch (err) {
				// Minting blind could leave two chargeable intents; make the client retry.
				console.error(
					`createPaymentIntent: retrieve ${cachedId} failed: ${err instanceof Error ? err.message : String(err)}`,
				);
				throw new ConvexError({ code: "STRIPE_UNAVAILABLE" });
			}
			const clientSecret =
				cached.client_secret ??
				resolved.payment.pendingPaymentIntentClientSecret ??
				"";
			switch (cached.status) {
				case "processing":
				case "requires_capture":
					return { ...base, status: "processing", clientSecret };
				case "succeeded":
					return {
						...base,
						status: "succeeded_pending_confirmation",
						clientSecret,
					};
				case "requires_payment_method":
				case "requires_confirmation":
				case "requires_action":
					if (cached.amount === amountCents && cached.currency === "usd") {
						return { ...base, status: "ready", clientSecret };
					}
					// The installment changed under the intent; retire it first.
					try {
						await stripe.paymentIntents.cancel(
							cachedId,
							{ cancellation_reason: "abandoned" },
							{ stripeAccount: stripeAccountId },
						);
					} catch (err) {
						console.error(
							`createPaymentIntent: cancel ${cachedId} failed: ${err instanceof Error ? err.message : String(err)}`,
						);
						throw new ConvexError({ code: "STRIPE_UNAVAILABLE" });
					}
					break;
				case "canceled":
					break;
			}
		}

		const attemptId = (resolved.payment.checkoutAttemptCounter ?? 0) + 1;

		const applicationFeeCents = Number(
			process.env.STRIPE_APPLICATION_FEE_CENTS ?? 0,
		);

		const pi = await stripe.paymentIntents.create(
			{
				amount: amountCents,
				currency: "usd",
				// Omit entirely when no fee — never claim an explicit $0 fee.
				...(applicationFeeCents > 0
					? { application_fee_amount: applicationFeeCents }
					: {}),
				receipt_email: resolved.contact.email,
				automatic_payment_methods: { enabled: true },
				metadata: {
					// Correlation key for the payment_intent.succeeded webhook. publicToken
					// is retired (no longer stamped); the webhook keys off paymentId.
					paymentId: resolved.payment._id,
					invoiceId: resolved.invoice._id,
					orgId: resolved.org._id,
					source: "portal",
				},
			},
			{
				stripeAccount: stripeAccountId,
				idempotencyKey: `acct-pi-${resolved.payment._id}-${attemptId}`,
			},
		);

		if (!pi.client_secret) {
			throw new ConvexError({ code: "STRIPE_CLIENT_SECRET_MISSING" });
		}

		await ctx.runMutation(
			internal.payments.persistPendingPaymentIntentInternal,
			{
				paymentId: resolved.payment._id,
				stripeAccountId,
				pendingPaymentIntentId: pi.id,
				pendingPaymentIntentClientSecret: pi.client_secret,
				pendingPaymentIntentExpiresAt: now + 24 * 60 * 60 * 1000,
				amount: resolved.payment.paymentAmount,
			},
		);
		// Counter only advances after a successful Stripe mint.
		await ctx.runMutation(
			internal.payments.incrementCheckoutAttemptCounter,
			{ paymentId: resolved.payment._id },
		);

		return { ...base, status: "ready", clientSecret: pi.client_secret };
	},
});
