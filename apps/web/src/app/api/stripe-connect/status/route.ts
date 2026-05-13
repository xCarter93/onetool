import "server-only";
import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import {
	getOrgConnectAccountForCaller,
	deriveConnectStatusFromV2Account,
} from "@/lib/stripeConnect";

/**
 * Plan 14.2-02 — return live Connect status for the caller's organization.
 * Response shape is reduced (audit #9): no full Stripe.Account leak — only
 * the booleans and the requirements object the workspace UI renders.
 *
 * Plan 14.2.1-03: v2 cutover — retrieve via stripe.v2.core.accounts.retrieve
 * with the widened include list, then derive booleans via
 * deriveConnectStatusFromV2Account (recipient-path payoutsEnabled).
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
		const message =
			err instanceof Error ? err.message : "Failed to fetch account status";
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
