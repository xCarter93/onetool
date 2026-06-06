import "server-only";
import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { getStripeClient } from "@/lib/stripe";
import {
	getOrgConnectAccountForCaller,
	deriveConnectStatusFromV2Account,
	mapConnectError,
} from "@/lib/stripeConnect";

/**
 * Return live Connect status for the caller's organization.
 * Only UI-facing status fields are returned, not the full Stripe account.
 *
 * Side effect: write-throughs the live status + default bank account into the
 * cached org fields. Those fields gate the client portal and the Payments-tab
 * bank row but are otherwise only set by webhooks, so accounts onboarded before
 * the status webhooks shipped self-heal on the next refresh.
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

		// v2 accounts don't surface external accounts; the v1 list endpoint does.
		// Best-effort: a miss must not block status persistence (many accounts
		// legitimately have no bank yet).
		let bank: { last4: string; bankName: string | null } | null = null;
		try {
			const externals = await stripe.accounts.listExternalAccounts(
				ctx.stripeConnectAccountId,
				{ object: "bank_account", limit: 10 }
			);
			const banks = externals.data as Array<{
				last4?: string | null;
				bank_name?: string | null;
				default_for_currency?: boolean | null;
			}>;
			const chosen = banks.find((b) => b.default_for_currency) ?? banks[0];
			if (chosen?.last4) {
				bank = { last4: chosen.last4, bankName: chosen.bank_name ?? null };
			}
		} catch (bankErr) {
			console.error(
				"[stripe-connect/status] external account read failed",
				bankErr
			);
		}

		// Best-effort write-through: the route's contract is returning live
		// status (it also auto-runs on tab focus), so a transient Convex error
		// must not fail the read. The heal is idempotent and retried on every
		// refresh, so a logged miss self-corrects on the next call.
		try {
			await fetchMutation(
				api.organizations.syncStripeConnectStatusFromLive,
				{
					chargesEnabled: derived.chargesEnabled,
					payoutsEnabled: derived.payoutsEnabled,
					detailsSubmitted: derived.detailsSubmitted,
					...(bank
						? {
								bankLast4: bank.last4,
								bankName: bank.bankName,
								bankUpdatedAt: Date.now(),
							}
						: {}),
				},
				{ token: ctx.convexToken }
			);
		} catch (cacheErr) {
			console.error(
				"[stripe-connect/status] cache write-through failed",
				cacheErr
			);
		}

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
