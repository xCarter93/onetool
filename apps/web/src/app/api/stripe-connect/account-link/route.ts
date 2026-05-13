import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import {
	getOrgConnectAccountForCaller,
	mapConnectError,
} from "@/lib/stripeConnect";

/**
 * Create an onboarding link for the caller's connected account.
 * The account ID is session-derived; returnPath is sanitized below.
 */
export async function POST(request: NextRequest) {
	try {
		const ctx = await getOrgConnectAccountForCaller();
		if (!ctx.stripeConnectAccountId) {
			return NextResponse.json(
				{ error: "Stripe account not yet onboarded" },
				{ status: 400 }
			);
		}

		const body = (await request.json().catch(() => ({}))) as {
			returnPath?: string;
		};
		const origin =
			request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
		if (!origin) {
			return NextResponse.json(
				{
					error:
						"Origin is missing. Provide an Origin header or configure NEXT_PUBLIC_APP_URL.",
				},
				{ status: 400 }
			);
		}

		// Only allow same-origin relative paths starting with "/" so a malicious
		// caller cannot redirect onboarding completion to an attacker domain.
		const safeReturnPath =
			typeof body.returnPath === "string" && body.returnPath.startsWith("/")
				? body.returnPath
				: "/organization/profile?tab=payments";
		const returnUrl = `${origin}${safeReturnPath}`;
		const refreshUrl = `${origin}/organization/profile?tab=payments&refresh=1`;

		const stripe = getStripeClient();
		// Collect current and eventual requirements for both merchant and recipient use cases.
		const accountLink = await stripe.v2.core.accountLinks.create(
			{
				account: ctx.stripeConnectAccountId,
				use_case: {
					type: "account_onboarding",
					account_onboarding: {
						configurations: ["merchant", "recipient"],
						collection_options: { fields: "eventually_due" },
						return_url: returnUrl,
						refresh_url: refreshUrl,
					},
				},
			},
			// Fresh UUID per request — short-lived resource (~5min) must NOT reuse keys.
			{ idempotencyKey: crypto.randomUUID() }
		);

		return NextResponse.json({
			url: accountLink.url,
			expires_at: accountLink.expires_at,
		});
	} catch (err) {
		return mapConnectError(err, "Failed to create onboarding link");
	}
}
