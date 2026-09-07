"use node";

import Stripe from "stripe";
import { ConvexError } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createStripeSdkClient } from "./lib/stripeSdk";
import {
	deriveConnectStatusFromV2Account,
	type ConnectStatus,
} from "./lib/stripeConnectStatus";

// Every binding and readiness value persisted here comes from a Stripe
// response made in this action, never from request input.

type StripeClient = ReturnType<typeof createStripeSdkClient>;
let stripeClientOverride: StripeClient | null = null;
export function __setStripeClientForTests(client: StripeClient | null): void {
	stripeClientOverride = client;
}
function getStripeClient(): StripeClient {
	return stripeClientOverride ?? createStripeSdkClient();
}

// Stripe-side record of which org an account was created for.
const ORG_METADATA_KEY = "onetool_org_id";

const ACCOUNT_INCLUDE = [
	"configuration.merchant",
	"configuration.recipient",
	"identity",
	"requirements",
] satisfies Stripe.V2.Core.AccountRetrieveParams["include"];

type ConnectContext = {
	userId: Id<"users">;
	userEmail: string | null;
	orgId: Id<"organizations">;
	stripeConnectAccountId: string | null;
	organization: { email?: string; addressCountry?: string };
};

export type AccountStatus = ConnectStatus & { accountId: string };

async function connectContext(ctx: ActionCtx): Promise<ConnectContext> {
	return await ctx.runQuery(api.organizations.getOrgForCallerInternal, {});
}

// Normalize the human-readable country stored by the org profile form.
const US_ALIASES = new Set(["US", "USA", "UNITED STATES", "U.S.", "U.S.A."]);

function deriveConnectFields(context: ConnectContext): {
	country: "US";
	email: string;
} {
	const country =
		context.organization.addressCountry?.trim().toUpperCase() ?? "";
	if (!US_ALIASES.has(country)) {
		throw new ConvexError("US_ONLY");
	}
	const email = context.organization.email ?? context.userEmail ?? "";
	if (!email) {
		throw new ConvexError("ORG_HAS_NO_EMAIL");
	}
	return { country: "US", email };
}

async function retrieveOwnedAccount(
	stripe: StripeClient,
	accountId: string,
	orgId: Id<"organizations">
): Promise<Stripe.V2.Core.Account> {
	const account = await stripe.v2.core.accounts.retrieve(accountId, {
		include: ACCOUNT_INCLUDE,
	});
	// Accounts created before metadata binding shipped carry no key; only a
	// key naming another org is proof the binding is wrong.
	const boundOrgId = account.metadata?.[ORG_METADATA_KEY];
	if (boundOrgId !== undefined && boundOrgId !== orgId) {
		throw new ConvexError("ACCOUNT_ORG_MISMATCH");
	}
	return account;
}

function isMissingAccountError(err: unknown): boolean {
	if (!(err instanceof Stripe.errors.StripeInvalidRequestError)) return false;
	return err.statusCode === 404 || err.code === "account_invalid";
}

function withAccountId(account: Stripe.V2.Core.Account): AccountStatus {
	return { accountId: account.id, ...deriveConnectStatusFromV2Account(account) };
}

async function createAndBind(
	ctx: ActionCtx,
	stripe: StripeClient,
	context: ConnectContext,
	idempotencyKeySuffix?: string
): Promise<AccountStatus> {
	const { country, email } = deriveConnectFields(context);
	const body: Stripe.V2.Core.AccountCreateParams = {
		contact_email: email,
		dashboard: "none",
		metadata: { [ORG_METADATA_KEY]: context.orgId },
		include: ACCOUNT_INCLUDE,
		defaults: {
			currency: "usd",
			responsibilities: {
				fees_collector: "stripe",
				losses_collector: "stripe",
			},
		},
		identity: { country },
		configuration: {
			merchant: {
				capabilities: {
					card_payments: { requested: true },
				},
			},
			recipient: {
				capabilities: {
					stripe_balance: {
						stripe_transfers: { requested: true },
					},
				},
			},
		},
	};
	// The recovery path keys off the stale account id so every retry replays the
	// same fresh account instead of minting one per attempt.
	const idempotencyKey = idempotencyKeySuffix
		? `acct-create-v2-${context.orgId}-${idempotencyKeySuffix}`
		: `acct-create-v2-${context.orgId}`;
	const account = await stripe.v2.core.accounts.create(body, {
		idempotencyKey,
	});
	await ctx.runMutation(internal.organizations.bindStripeConnectAccountInternal, {
		orgId: context.orgId,
		accountId: account.id,
	});
	return withAccountId(account);
}

/** Create the caller's connected account, or return live status for the bound one. */
export const ensureAccount = action({
	args: {},
	handler: async (ctx): Promise<AccountStatus> => {
		const context = await connectContext(ctx);
		const stripe = getStripeClient();
		if (!context.stripeConnectAccountId) {
			return await createAndBind(ctx, stripe, context);
		}
		try {
			const account = await retrieveOwnedAccount(
				stripe,
				context.stripeConnectAccountId,
				context.orgId
			);
			return withAccountId(account);
		} catch (err) {
			if (!isMissingAccountError(err)) throw err;
			await ctx.runMutation(
				internal.organizations.clearStripeConnectStateInternal,
				{ orgId: context.orgId }
			);
			return await createAndBind(
				ctx,
				stripe,
				context,
				context.stripeConnectAccountId
			);
		}
	},
});

// v2 accounts don't surface external accounts; the v1 list endpoint does.
async function readDefaultBank(
	stripe: StripeClient,
	accountId: string
): Promise<{ last4: string; bankName: string | null } | null> {
	try {
		const externals = await stripe.accounts.listExternalAccounts(accountId, {
			object: "bank_account",
			limit: 10,
		});
		const banks = externals.data as Array<{
			last4?: string | null;
			bank_name?: string | null;
			default_for_currency?: boolean | null;
		}>;
		const chosen = banks.find((b) => b.default_for_currency) ?? banks[0];
		return chosen?.last4
			? { last4: chosen.last4, bankName: chosen.bank_name ?? null }
			: null;
	} catch (err) {
		console.error("[stripeConnectActions] external account read failed", err);
		return null;
	}
}

/** Live status for the bound account, written through to the org cache. */
export const refreshStatus = action({
	args: {},
	handler: async (ctx): Promise<AccountStatus> => {
		const context = await connectContext(ctx);
		if (!context.stripeConnectAccountId) {
			throw new ConvexError("NOT_ONBOARDED");
		}
		const stripe = getStripeClient();
		const account = await retrieveOwnedAccount(
			stripe,
			context.stripeConnectAccountId,
			context.orgId
		);
		const status = withAccountId(account);
		const bank = await readDefaultBank(stripe, account.id);
		// Best-effort: a transient write failure must not fail the live read.
		try {
			await ctx.runMutation(
				internal.organizations.syncStripeConnectStatusInternal,
				{
					orgId: context.orgId,
					actorUserId: context.userId,
					chargesEnabled: status.chargesEnabled,
					payoutsEnabled: status.payoutsEnabled,
					detailsSubmitted: status.detailsSubmitted,
					...(bank ? { bankLast4: bank.last4, bankName: bank.bankName } : {}),
				}
			);
		} catch (err) {
			console.error("[stripeConnectActions] status write-through failed", err);
		}
		return status;
	},
});
