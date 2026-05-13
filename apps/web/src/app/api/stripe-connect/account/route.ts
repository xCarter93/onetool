import "server-only";
import { NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { getStripeClient } from "@/lib/stripe";
import {
	getOrgConnectAccountForCaller,
	createConnectAccount,
	deriveConnectStatusFromV2Account,
	mapConnectError,
	type ConnectContext,
} from "@/lib/stripeConnect";

/**
 * Create or retrieve the caller's Stripe Connect account.
 * Account identity comes from the Clerk session, and responses expose only the
 * status fields rendered by the UI.
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
			// If Stripe no longer has the stored account, clear local state and
			// recreate it in the same request.
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

