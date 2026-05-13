import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { fetchAction } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { getStripeClient } from "@/lib/stripe";
import { env } from "@/env";

/**
 * Plan 14.2-03 — Stripe Connect webhook endpoint.
 *
 * Trust boundary: `stripe.webhooks.constructEventAsync` is the SOLE
 * event-construction codepath. A bad signature returns 400 (Stripe stops
 * retrying — correct for forgeries). A dispatch failure returns 500
 * (FINDINGS W-2 — so Stripe retries transient errors on its standard
 * schedule). Combined with the W-1 status-field lifecycle in
 * `stripeWebhookActions.handleEvent`, the next replay re-enters
 * "processing" so the type-switch runs again.
 *
 * V-1 pivot (Plan 14.2-02 SUMMARY): `handleEvent` is a PUBLIC action because
 * convex/nextjs cannot reach `internal.*`. The signature verification above
 * is what makes that public surface trustworthy.
 */
export async function POST(request: NextRequest) {
	// 1. Read RAW body — MUST be `request.text()`, not `request.json()` — the
	//    signature is computed over raw bytes; parsing first invalidates it.
	const rawBody = await request.text();
	const signature = request.headers.get("stripe-signature");

	if (!signature) {
		return new NextResponse("Missing stripe-signature header", {
			status: 400,
		});
	}

	// 2. Verify signature via constructEventAsync. NO test backdoor — this is
	//    the only path that turns the raw body into a typed Stripe.Event.
	const stripe = getStripeClient();
	let event: Stripe.Event;
	try {
		event = await stripe.webhooks.constructEventAsync(
			rawBody,
			signature,
			env.STRIPE_CONNECT_WEBHOOK_SECRET
		);
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Verification failed";
		console.error("Stripe webhook verification failed:", msg);
		// 400 — Stripe will not retry on 4xx (correct for bad signatures).
		return new NextResponse(`Webhook Error: ${msg}`, { status: 400 });
	}

	// 3. Dispatch to the Convex action. FINDINGS W-2 status table:
	//    duplicate / orgFound:false / success → 200
	//    fetchAction throw OR handleEvent throw → 500 (Stripe retries).
	try {
		const result = await fetchAction(api.stripeWebhookActions.handleEvent, {
			eventId: event.id,
			eventType: event.type,
			account: event.account ?? null,
			created: event.created,
			data: event.data,
		});
		return NextResponse.json({ received: true, ...result });
	} catch (err) {
		console.error("Stripe webhook dispatch failed:", err);
		// 500 — transient; Stripe retries; W-1 status-field lifecycle ensures
		// the next replay re-enters "processing" so the type-switch runs again.
		return new NextResponse("Internal error processing webhook", {
			status: 500,
		});
	}
}
