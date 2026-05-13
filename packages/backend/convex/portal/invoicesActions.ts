"use node";
// PaymentIntent minter for the portal. Cache reuse is gated on
// requires_payment_method; any other PI status forces a fresh mint. The
// checkoutAttemptCounter advances ONLY after a successful Stripe call so a
// transient failure does not burn the next idempotency key.
import Stripe from "stripe";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";

const REUSE_BUFFER_MS = 60_000;

// Test seam: vi.mock("stripe") wires this in tests so SDK calls never network out.
let stripeFactoryOverride: (() => Stripe) | null = null;
export function __setStripeFactoryForTests(factory: (() => Stripe) | null) {
	stripeFactoryOverride = factory;
}
function buildStripeClient(): Stripe {
	if (stripeFactoryOverride) return stripeFactoryOverride();
	return new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
		apiVersion: "2026-04-22.dahlia" as Stripe.LatestApiVersion,
	});
}

export const createPaymentIntent = action({
	args: { invoiceId: v.id("invoices") },
	returns: v.object({
		clientSecret: v.string(),
		publishableKey: v.string(),
		stripeAccountId: v.string(),
		paymentId: v.id("payments"),
		amount: v.number(),
	}),
	handler: async (ctx, args) => {
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

		// Cache reuse: only on requires_payment_method AND within the expiry buffer.
		const cachedId = resolved.payment.pendingPaymentIntentId;
		const cachedSecret = resolved.payment.pendingPaymentIntentClientSecret;
		const cachedExp = resolved.payment.pendingPaymentIntentExpiresAt;
		if (
			cachedId &&
			cachedSecret &&
			cachedExp &&
			now < cachedExp - REUSE_BUFFER_MS
		) {
			try {
				const cachedPi = await stripe.paymentIntents.retrieve(cachedId, {
					stripeAccount: stripeAccountId,
				});
				if (cachedPi.status === "requires_payment_method") {
					return {
						clientSecret: cachedSecret,
						publishableKey,
						stripeAccountId,
						paymentId: resolved.payment._id,
						amount: resolved.payment.paymentAmount,
					};
				}
			} catch {
				// Fall through to fresh mint.
			}
		}

		const attemptId = (resolved.payment.checkoutAttemptCounter ?? 0) + 1;
		const amountCents = Math.round(resolved.payment.paymentAmount * 100);
		if (amountCents <= 0) {
			throw new ConvexError({ code: "INVALID_AMOUNT" });
		}

		const applicationFeeCents = Number(
			process.env.STRIPE_APPLICATION_FEE_CENTS ?? 0,
		);

		const pi = await stripe.paymentIntents.create(
			{
				amount: amountCents,
				currency: "usd",
				application_fee_amount: applicationFeeCents,
				receipt_email: resolved.contact.email,
				automatic_payment_methods: { enabled: true },
				metadata: {
					publicToken: resolved.payment.publicToken,
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
				publicToken: resolved.payment.publicToken,
				pendingPaymentIntentId: pi.id,
				pendingPaymentIntentClientSecret: pi.client_secret,
				pendingPaymentIntentExpiresAt: now + 24 * 60 * 60 * 1000,
			},
		);
		// Counter only advances after a successful Stripe mint.
		await ctx.runMutation(
			internal.payments.incrementCheckoutAttemptCounterInternal,
			{ publicToken: resolved.payment.publicToken },
		);

		return {
			clientSecret: pi.client_secret,
			publishableKey,
			stripeAccountId,
			paymentId: resolved.payment._id,
			amount: resolved.payment.paymentAmount,
		};
	},
});
