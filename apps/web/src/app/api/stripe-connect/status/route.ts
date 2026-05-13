import "server-only";
import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import {
	getOrgConnectAccountForCaller,
	deriveConnectStatusFromV2Account,
	mapConnectError,
} from "@/lib/stripeConnect";

/**
 * Return live Connect status for the caller's organization.
 * Only UI-facing status fields are returned, not the full Stripe account.
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
		const account = await stripe.v2.core.accounts.retrieve(
			ctx.stripeConnectAccountId,
			{
				include: [
					"configuration.merchant",
					"configuration.recipient",
					"identity",
					"requirements",
				],
			}
		);
		const derived = deriveConnectStatusFromV2Account(account);
		return NextResponse.json({
			accountId: account.id,
			chargesEnabled: derived.chargesEnabled,
			payoutsEnabled: derived.payoutsEnabled,
			detailsSubmitted: derived.detailsSubmitted,
			requirements: derived.requirements,
		});
	} catch (err) {
		return mapConnectError(err, "Failed to fetch account status");
	}
}
