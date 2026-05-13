import "server-only";
import { NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { getStripeClient } from "@/lib/stripe";
import {
	getOrgConnectAccountForCaller,
	createConnectAccount,
	deriveConnectStatusFromV2Account,
	type ConnectContext,
} from "@/lib/stripeConnect";

/**
 * Plan 14.2-02 (Connect cross-tenant lockdown) + Plan 14.2.1-03 (Accounts v2
 * migration).
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
 *
 * v2 cutover (Plan 14.2.1-03):
 *   - createConnectAccount uses stripe.v2.core.accounts.create (CONTEXT.md
 *     "Accounts v2 Migration Strategy").
 *   - retrieve uses stripe.v2.core.accounts.retrieve with the widened
 *     include list (configuration.merchant + configuration.recipient +
 *     identity + requirements) so deriveConnectStatusFromV2Account returns
 *     real values immediately (REVIEWS.md MEDIUM).
 *   - On Stripe 404 (account deleted out-of-band), clear Convex state via
 *     clearStripeConnectStateInternal and re-enter the create branch so the
 *     caller gets a fresh v2 account on the same request (REVIEWS.md HIGH-1).
 */
export async function POST() {
	try {
		const ctx = await getOrgConnectAccountForCaller();
		const accountId = ctx.stripeConnectAccountId;
		if (!accountId) {
			return await createPersistAndReturn(ctx);
		}

		const stripe = getStripeClient();
		try {
			const account = await stripe.v2.core.accounts.retrieve(accountId, {
				include: [
					"configuration.merchant",
					"configuration.recipient",
					"identity",
					"requirements",
				],
			});
			const derived = deriveConnectStatusFromV2Account(account);
			return NextResponse.json({
				accountId: account.id,
				chargesEnabled: derived.chargesEnabled,
				payoutsEnabled: derived.payoutsEnabled,
				detailsSubmitted: derived.detailsSubmitted,
				requirements: derived.requirements,
			});
		} catch (retrieveErr) {
			// REVIEWS.md HIGH-1 (404 fallback): when the stored accountId no longer
			// resolves on Stripe's side (operator pre-cutover cleanup, or runtime
			// data loss), clear the Convex state and re-enter the create branch so
			// the caller gets a fresh v2 account on the same request. Any non-404
			// error re-throws to the outer catch / mapConnectError.
			const isStripeError =
				retrieveErr instanceof Error &&
				retrieveErr.constructor.name === "StripeInvalidRequestError";
			const statusCode = (retrieveErr as { statusCode?: number })?.statusCode;
			const code = (retrieveErr as { code?: string })?.code;
			if (isStripeError && (statusCode === 404 || code === "account_invalid")) {
				await fetchMutation(
					api.organizations.clearStripeConnectStateInternal,
					{ orgId: ctx.orgId },
					{ token: ctx.convexToken }
				);
				return await createPersistAndReturn(ctx);
			}
			throw retrieveErr;
		}
	} catch (err) {
		return mapConnectError(err, "Failed to create or retrieve account");
	}
}

async function createPersistAndReturn(
	ctx: ConnectContext
): Promise<NextResponse> {
	const currentUser = await fetchQuery(
		api.users.current,
		{},
		{ token: ctx.convexToken }
	);
	const account = await createConnectAccount(ctx, currentUser?.email ?? null);
	await fetchMutation(
		api.organizations.setStripeConnectAccountIdInternal,
		{ accountId: account.id },
		{ token: ctx.convexToken }
	);
	const derived = deriveConnectStatusFromV2Account(account);
	return NextResponse.json({
		accountId: account.id,
		chargesEnabled: derived.chargesEnabled,
		payoutsEnabled: derived.payoutsEnabled,
		detailsSubmitted: derived.detailsSubmitted,
		requirements: derived.requirements,
	});
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
