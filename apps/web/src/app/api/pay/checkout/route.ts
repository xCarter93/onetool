import { NextRequest, NextResponse } from "next/server";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexClient } from "@/lib/convexClient";
import { getStripeClient } from "@/lib/stripe";
import { env } from "@/env";

// Avoid reusing a Checkout URL too close to expiration.
const REUSE_BUFFER_MS = 60_000;

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

		const origin =
			request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
		if (!origin) {
			return NextResponse.json(
				{
					error:
						"Origin is missing. Provide an Origin header or set NEXT_PUBLIC_APP_URL.",
				},
				{ status: 400 }
			);
		}

		const convex = getConvexClient();

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

			// Reuse an active Checkout Session instead of minting duplicate attempts.
			const now = Date.now();
			const reusableUrl = paymentData.payment.pendingCheckoutSessionUrl;
			const reusableExpiresAt =
				paymentData.payment.pendingCheckoutSessionExpiresAt;
			if (
				reusableUrl &&
				reusableExpiresAt &&
				now < reusableExpiresAt - REUSE_BUFFER_MS
			) {
				return NextResponse.json({ url: reusableUrl });
			}

			const amountInCents = Math.max(
				0,
				Math.round((paymentData.payment.paymentAmount ?? 0) * 100)
			);
			if (!amountInCents) {
				return NextResponse.json(
					{ error: "Payment amount is zero or invalid." },
					{ status: 400 }
				);
			}

			// Fresh attempts get a new idempotency key.
			const attemptId = await convex.mutation(
				api.payments.incrementCheckoutAttemptCounterInternal,
				{ publicToken: paymentData.payment.publicToken }
			);

			const stripe = getStripeClient();

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
							publicToken: paymentData.payment.publicToken,
							paymentId: paymentData.payment._id,
							invoiceNumber: paymentData.invoice.invoiceNumber ?? "",
						},
					},
					metadata: {
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

			// Persist the pending session so a within-window retry reuses the URL.
			if (session.id && session.url && session.expires_at) {
				await convex.mutation(
					api.payments.persistPendingCheckoutSessionInternal,
					{
						publicToken: paymentData.payment.publicToken,
						pendingCheckoutSessionId: session.id,
						pendingCheckoutSessionUrl: session.url,
						pendingCheckoutSessionExpiresAt: session.expires_at * 1000,
					}
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
			Math.round((invoiceData.invoice.total ?? 0) * 100)
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
						publicToken: invoiceData.invoice.publicToken,
						invoiceNumber: invoiceData.invoice.invoiceNumber ?? "",
					},
				},
				metadata: {
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

		return NextResponse.json({ url: session.url });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to start checkout";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
