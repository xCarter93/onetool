import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { getOrgConnectAccountForCaller } from "@/lib/stripeConnect";

/**
 * Plan 14.2-02 — create an onboarding account link for the caller's
 * connected account. The account ID is derived server-side; the only
 * client-influenced field is the optional returnPath (sanitized below).
 *
 * Idempotency: account links are short-lived (~5 minutes — Stripe pitfall
 * #8). A stable key would return the same expired link forever on retry;
 * RESEARCH Pattern 4 mandates a fresh UUID per request so each invocation
 * mints a fresh URL.
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
		// Plan 14.2.1-03: v2 cutover. use_case wrapping carries the v2 configurations
		// list (merchant + recipient) so onboarding collects requirements for both
		// configurations applied in createConnectAccount.
		//
		// collection_options.fields = "eventually_due": collect both currently_due
		// AND eventually_due requirements in a single onboarding flow. Default is
		// "currently_due", which makes Stripe segment onboarding into multiple
		// rounds (basic info → return to platform → identity verification → return),
		// confusing for users whose activation is gated on completing payouts setup.
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
		const message =
			err instanceof Error ? err.message : "Failed to create onboarding link";
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
