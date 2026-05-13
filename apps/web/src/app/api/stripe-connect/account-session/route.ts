import "server-only";
import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { getOrgConnectAccountForCaller } from "@/lib/stripeConnect";

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
				},
			},
			{ idempotencyKey: crypto.randomUUID() }
		);

		return NextResponse.json({ clientSecret: accountSession.client_secret });
	} catch (err) {
		console.error("Account session creation error:", err);
		const message =
			err instanceof Error ? err.message : "Failed to create account session";
		const status =
			message === "UNAUTHORIZED"
				? 401
				: message === "ORG_NOT_FOUND"
					? 401
					: message === "NOT_ORG_OWNER"
						? 403
						: message.startsWith("OneTool Connect is currently US-only")
							? 400
							: message === "ORG_HAS_NO_EMAIL"
								? 400
								: message.startsWith("DUPLICATE_CONNECT_ACCOUNT")
									? 409
									: 500;
		return NextResponse.json({ error: message }, { status });
	}
}
