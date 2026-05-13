import "server-only";
import { NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { getStripeClient } from "@/lib/stripe";
import {
	getOrgConnectAccountForCaller,
	deriveConnectFieldsFromOrg,
} from "@/lib/stripeConnect";

/**
 * Plan 14.2-02 (Connect cross-tenant lockdown).
 *
 * Create or retrieve a Stripe Connect account for the caller's organization.
 *
 * Lockdown contract (audit #2):
 *   - The handler MUST NOT read any account-identifying field from the
 *     request body (see apps/web/src/lib/stripeConnect.ts for the CI grep
 *     gate that pins this invariant). Everything is derived from the
 *     Clerk session via getOrgConnectAccountForCaller().
 *   - On create, the account ID is persisted server-side via
 *     setStripeConnectAccountIdInternal (which carries the FINDINGS M-2
 *     duplicate-account guard) BEFORE the response returns.
 *   - The response shape is reduced to non-PII fields only — no full
 *     Stripe.Account object leaks to the client.
 */
export async function POST() {
	try {
		const ctx = await getOrgConnectAccountForCaller();
		const stripe = getStripeClient();

		let accountId = ctx.stripeConnectAccountId;
		if (!accountId) {
			// Fetch the caller's email from the Clerk-synced user row as a
			// fallback for orgs that haven't set organization.email yet.
			const currentUser = await fetchQuery(api.users.current, {});
			const { country, email } = deriveConnectFieldsFromOrg(
				ctx,
				currentUser?.email ?? null
			);

			// Stable idempotency key — accounts are permanent so the same key
			// returns the same account on retry within Stripe's 24h cache.
			const account = await stripe.accounts.create(
				{
					country,
					email,
					controller: {
						fees: { payer: "account" },
						losses: { payments: "stripe" },
						stripe_dashboard: { type: "none" },
					},
					capabilities: {
						card_payments: { requested: true },
						transfers: { requested: true },
					},
				},
				{ idempotencyKey: `acct-create-${ctx.orgId}` }
			);

			accountId = account.id;

			// Persist immediately via the lockdown mutation (M-2 dup guard
			// fires here if Stripe handed back an accountId already mapped to
			// a different org — extremely rare but possible during operator
			// dashboard linking).
			await fetchMutation(
				api.organizations.setStripeConnectAccountIdInternal,
				{ accountId }
			);

			return NextResponse.json({
				accountId,
				chargesEnabled: account.charges_enabled ?? false,
				payoutsEnabled: account.payouts_enabled ?? false,
				detailsSubmitted: account.details_submitted ?? false,
				requirements: account.requirements ?? null,
			});
		}

		// Existing account — fetch fresh status and return the reduced shape.
		const account = await stripe.accounts.retrieve(accountId);
		return NextResponse.json({
			accountId: account.id,
			chargesEnabled: account.charges_enabled ?? false,
			payoutsEnabled: account.payouts_enabled ?? false,
			detailsSubmitted: account.details_submitted ?? false,
			requirements: account.requirements ?? null,
		});
	} catch (err) {
		return mapConnectError(err, "Failed to create or retrieve account");
	}
}

function mapConnectError(err: unknown, fallback: string): NextResponse {
	const message = err instanceof Error ? err.message : fallback;
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
