import "server-only";
import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import {
	getOrgConnectAccountForCaller,
	mapConnectError,
} from "@/lib/stripeConnect";

/**
 * Create an Account Session for the caller's connected account.
 * Each call uses a fresh key because returned client secrets expire quickly.
 */
export async function POST() {
	try {
		const ctx = await getOrgConnectAccountForCaller();
		if (!ctx.stripeConnectAccountId) {
			return NextResponse.json(
				{ error: "Stripe account not yet onboarded" },
				{ status: 400 }
			);
		}

		const stripe = getStripeClient();
		const accountSession = await stripe.accountSessions.create(
			{
				account: ctx.stripeConnectAccountId,
				components: {
					payouts: {
						enabled: true,
						features: {
							instant_payouts: true,
							standard_payouts: true,
							edit_payout_schedule: true,
							external_account_collection: true,
						},
					},
					// Stripe-maintained banner for risk interventions and new
					// requirements — the remediation surface a dashboard-less
					// (dashboard:"none") account otherwise lacks.
					notification_banner: {
						enabled: true,
						features: { external_account_collection: true },
					},
					// Self-serve editing of already-submitted business details.
					account_management: {
						enabled: true,
						features: { external_account_collection: true },
					},
					// Dispute response: submit evidence, accept, or refund to
					// resolve — without this, orgs lose every chargeback by default.
					disputes_list: {
						enabled: true,
						features: {
							dispute_management: true,
							refund_management: true,
							capture_payments: true,
						},
					},
				},
			},
			{ idempotencyKey: crypto.randomUUID() }
		);

		return NextResponse.json({ clientSecret: accountSession.client_secret });
	} catch (err) {
		console.error("Account session creation error:", err);
		return mapConnectError(err, "Failed to create account session");
	}
}
