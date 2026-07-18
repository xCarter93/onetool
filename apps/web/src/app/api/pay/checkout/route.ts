import { NextRequest, NextResponse } from "next/server";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexClient } from "@/lib/convexClient";
import { getStripeClient } from "@/lib/stripe";
import { dollarsToCents } from "@/lib/money";
import { getRequestIp } from "@/lib/portal/ip";
import { env } from "@/env";

// Avoid reusing a Checkout URL too close to expiration.
const REUSE_BUFFER_MS = 60_000;

// PUB-06: this route is public, so the Origin header is attacker-forgeable.
// Only honor it when it exactly matches the configured app URL; otherwise fall
// back to the trusted env value. This keeps Stripe's success/cancel redirects
// pinned to our own origin rather than an attacker-supplied one.
function resolveRedirectOrigin(request: NextRequest): string | null {
	const appUrl = process.env.NEXT_PUBLIC_APP_URL;
	const headerOrigin = request.headers.get("origin");
	if (appUrl && headerOrigin === appUrl) {
		return headerOrigin;
	}
	return appUrl ?? null;
}

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json().catch(() => ({}))) as {
			token?: string;
		};

		if (!body.token) {
			return NextResponse.json(
				{ error: "Missing token" },
				{ status: 400 }
			);
		}

		const origin = resolveRedirectOrigin(request);
		if (!origin) {
			return NextResponse.json(
				{
					error:
						"Origin is missing. Set NEXT_PUBLIC_APP_URL.",
				},
				{ status: 400 }
			);
		}

		const convex = getConvexClient();

		// PUB-11: throttle Stripe session minting per pay-link token and per
		// client IP before any lookup or mint.
		const rateLimit = await convex.mutation(
			api.payments.checkCheckoutRateLimit,
			{ token: body.token, ip: getRequestIp(request) }
		);
		if (!rateLimit.ok) {
			return NextResponse.json(
				{ error: "Too many attempts. Please try again shortly." },
				{ status: 429 }
			);
		}

		// First, try to find a payment by token (new payment splitting flow)
		const paymentData = await convex.query(api.payments.getByPublicToken, {
			publicToken: body.token,
		});

		// If payment found, use payment-specific flow
		if (paymentData) {
			if (paymentData.payment.status === "paid") {
				return NextResponse.json(
					{ error: "This payment has already been paid." },
					{ status: 400 }
				);
			}

			const accountId = paymentData.org?.stripeConnectAccountId;
			if (!accountId) {
				return NextResponse.json(
					{
						error:
							"Payments are not enabled for this organization. Complete onboarding first.",
					},
					{ status: 400 }
				);
			}

			const amountInCents = Math.max(
				0,
				dollarsToCents(paymentData.payment.paymentAmount ?? 0)
			);
			if (!amountInCents) {
				return NextResponse.json(
					{ error: "Payment amount is zero or invalid." },
					{ status: 400 }
				);
			}

			const stripe = getStripeClient();

			// Reuse an active Checkout Session instead of minting duplicate attempts.
			// PUB-01: the cached URL/id is persisted through a public mutation, so it
			// cannot be trusted blindly. Re-fetch the session scoped to THIS org's
			// connected account (retrieve 404s for any session minted elsewhere) and
			// reuse it only when it is still open, its amount matches, AND its
			// metadata binds it to THIS pay link (flow + publicToken) — so a valid
			// same-account session for a different payment cannot be substituted in.
			const now = Date.now();
			const reusableUrl = paymentData.payment.pendingCheckoutSessionUrl;
			const reusableSessionId =
				paymentData.payment.pendingCheckoutSessionId;
			const reusableExpiresAt =
				paymentData.payment.pendingCheckoutSessionExpiresAt;
			if (
				reusableUrl &&
				reusableSessionId &&
				reusableExpiresAt &&
				now < reusableExpiresAt - REUSE_BUFFER_MS
			) {
				try {
					const cached = await stripe.checkout.sessions.retrieve(
						reusableSessionId,
						undefined,
						{ stripeAccount: accountId }
					);
					if (
						cached.status === "open" &&
						cached.url &&
						cached.amount_total === amountInCents &&
						cached.metadata?.flow === "payment" &&
						cached.metadata?.publicToken ===
							paymentData.payment.publicToken
					) {
						return NextResponse.json({ url: cached.url });
					}
					// Otherwise fall through and mint a fresh session.
				} catch {
					// retrieve() throws if the session isn't under this connected
					// account (poisoned cache) or has expired — mint a fresh one.
				}
			}

			// Compute the next attempt id without committing it. Counter only
			// advances if Stripe actually mints a session — otherwise a
			// transient failure here would burn a key the customer never used,
			// and Stripe's idempotency cache would block the same key from
			// retrying that failure cleanly.
			const attemptId =
				(paymentData.payment.checkoutAttemptCounter ?? 0) + 1;

			// Build descriptive name for the line item
			const paymentDescription = paymentData.payment.description
				? `${paymentData.invoice.invoiceNumber} - ${paymentData.payment.description}`
				: `${paymentData.invoice.invoiceNumber} - Payment ${paymentData.paymentContext.paymentNumber} of ${paymentData.paymentContext.totalPayments}`;

			const session = await stripe.checkout.sessions.create(
				{
					customer_creation: "always",
					invoice_creation: {
						enabled: true,
					},
					mode: "payment",
					line_items: [
						{
							price_data: {
								currency: "usd",
								product_data: {
									name: paymentDescription,
									description: `Payment for ${paymentData.org?.name ?? "organization"}`,
								},
								unit_amount: amountInCents,
							},
							quantity: 1,
						},
					],
					payment_intent_data: {
						application_fee_amount: env.STRIPE_APPLICATION_FEE_CENTS,
						metadata: {
							flow: "payment",
							publicToken: paymentData.payment.publicToken,
							paymentId: paymentData.payment._id,
							invoiceNumber: paymentData.invoice.invoiceNumber ?? "",
						},
					},
					metadata: {
						flow: "payment",
						publicToken: paymentData.payment.publicToken,
						paymentId: paymentData.payment._id,
						invoiceId: paymentData.invoice._id,
					},
					success_url: `${origin}/pay/${paymentData.payment.publicToken}?session_id={CHECKOUT_SESSION_ID}`,
					cancel_url: `${origin}/pay/${paymentData.payment.publicToken}?canceled=1`,
				},
				{
					stripeAccount: accountId,
					idempotencyKey: `pay-${paymentData.payment.publicToken}-${attemptId}`,
				}
			);

			if (!session.url) {
				return NextResponse.json(
					{ error: "Stripe did not return a checkout URL. Please try again." },
					{ status: 502 }
				);
			}

			// Persist the pending session so a within-window retry reuses the URL,
			// and commit the attempt counter so the next mint gets a fresh key.
			if (session.id && session.expires_at) {
				await convex.mutation(
					api.payments.persistPendingCheckoutSessionInternal,
					{
						publicToken: paymentData.payment.publicToken,
						pendingCheckoutSessionId: session.id,
						pendingCheckoutSessionUrl: session.url,
						pendingCheckoutSessionExpiresAt: session.expires_at * 1000,
					}
				);
				await convex.mutation(
					api.payments.incrementCheckoutAttemptCounter,
					{ publicToken: paymentData.payment.publicToken }
				);
			}

			return NextResponse.json({ url: session.url });
		}

		// Fall back to legacy invoice token flow
		const invoiceData = await convex.query(api.invoices.getByPublicToken, {
			publicToken: body.token,
		});

		if (!invoiceData) {
			return NextResponse.json({ error: "Invoice or payment not found" }, { status: 404 });
		}

		if (invoiceData.invoice.status === "paid") {
			return NextResponse.json(
				{ error: "Invoice is already paid." },
				{ status: 400 }
			);
		}
		// PUB-35: draft/cancelled invoices are rejected at the trust boundary —
		// invoices.getByPublicToken returns null for them, so they never reach here.

		const accountId = invoiceData.org?.stripeConnectAccountId;
		if (!accountId) {
			return NextResponse.json(
				{
					error:
						"Payments are not enabled for this organization. Complete onboarding first.",
				},
				{ status: 400 }
			);
		}

		const amountInCents = Math.max(
			0,
			dollarsToCents(invoiceData.invoice.total ?? 0)
		);
		if (!amountInCents) {
			return NextResponse.json(
				{ error: "Invoice total is zero or invalid." },
				{ status: 400 }
			);
		}

		const stripe = getStripeClient();

		const session = await stripe.checkout.sessions.create(
			{
				customer_creation: "always",
				invoice_creation: {
					enabled: true,
				},
				mode: "payment",
				line_items: [
					{
						price_data: {
							currency: "usd",
							product_data: {
								name: invoiceData.invoice.invoiceNumber ?? "Invoice payment",
								description: `Invoice payment for ${
									invoiceData.org?.name ?? "organization"
								}`,
							},
							unit_amount: amountInCents,
						},
						quantity: 1,
					},
				],
				payment_intent_data: {
					application_fee_amount: env.STRIPE_APPLICATION_FEE_CENTS,
					metadata: {
						flow: "invoice",
						publicToken: invoiceData.invoice.publicToken,
						invoiceNumber: invoiceData.invoice.invoiceNumber ?? "",
					},
				},
				metadata: {
					flow: "invoice",
					publicToken: invoiceData.invoice.publicToken,
					invoiceId: invoiceData.invoice._id,
				},
				success_url: `${origin}/pay/${invoiceData.invoice.publicToken}?session_id={CHECKOUT_SESSION_ID}`,
				cancel_url: `${origin}/pay/${invoiceData.invoice.publicToken}?canceled=1`,
			},
			{
				stripeAccount: accountId,
			}
		);

		if (!session.url) {
			return NextResponse.json(
				{ error: "Stripe did not return a checkout URL. Please try again." },
				{ status: 502 }
			);
		}

		return NextResponse.json({ url: session.url });
	} catch (error) {
		// PUB-15: never echo raw SDK errors to unauthenticated callers.
		console.error("[pay/checkout] error:", error);
		return NextResponse.json(
			{ error: "Failed to start checkout. Please try again." },
			{ status: 500 }
		);
	}
}
