/**
 * Stripe verification helpers for Convex actions.
 * Uses plain fetch (no Stripe SDK) to verify Checkout Sessions.
 */

export interface StripeSessionVerification {
	paid: boolean;
	paymentIntentId: string | null;
}

interface StripeCheckoutSession {
	payment_status: string;
	payment_intent: string | { id: string } | null;
}

/**
 * Verify a Stripe Checkout Session's payment status via the Stripe API.
 * Uses the platform's STRIPE_SECRET_KEY and optionally a Connect account ID.
 */
export async function verifyStripeSession(
	sessionId: string,
	stripeAccountId?: string
): Promise<StripeSessionVerification> {
	const apiKey = process.env.STRIPE_SECRET_KEY;
	if (!apiKey) {
		throw new Error("STRIPE_SECRET_KEY not configured");
	}

	const headers: Record<string, string> = {
		Authorization: `Bearer ${apiKey}`,
	};
	if (stripeAccountId) {
		headers["Stripe-Account"] = stripeAccountId;
	}

	const url = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent`;
	const res = await fetch(url, { headers });

	if (!res.ok) {
		const errorBody = await res.text().catch(() => "");
		throw new Error(
			`Stripe API error: ${res.status} ${errorBody}`
		);
	}

	const session = (await res.json()) as StripeCheckoutSession;

	// Extract payment intent ID (may be expanded object or string)
	let paymentIntentId: string | null = null;
	if (typeof session.payment_intent === "object" && session.payment_intent?.id) {
		paymentIntentId = session.payment_intent.id;
	} else if (typeof session.payment_intent === "string") {
		paymentIntentId = session.payment_intent;
	}

	return {
		paid: session.payment_status === "paid",
		paymentIntentId,
	};
}
