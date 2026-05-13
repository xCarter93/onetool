import "server-only";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";

export interface ConnectContext {
	userId: Id<"users">;
	orgId: Id<"organizations">;
	stripeConnectAccountId: string | null;
	organization: {
		_id: Id<"organizations">;
		name: string;
		email?: string;
		addressCountry?: string;
		stripeConnectAccountId?: string;
		ownerUserId: Id<"users">;
	};
}

// REGRESSION GUARD: Every /api/stripe-connect/* route MUST funnel through
// getOrgConnectAccountForCaller(). Plan 14.2-02 implements the body.
// CI grep:
//   grep -rn 'body\.\(accountId\|country\|email\|currency\)' \
//     apps/web/src/app/api/stripe-connect/
// Must return zero results.
export async function getOrgConnectAccountForCaller(): Promise<ConnectContext> {
	const { userId } = await auth();
	if (!userId) {
		throw new Error("UNAUTHORIZED");
	}

	// FINDINGS V-1 pivot: api.* (public) — handler derives clerkUserId from
	// ctx.auth.getUserIdentity() and orgId from Clerk's activeOrgId claim, so
	// no client-supplied value can influence which org is loaded.
	const ctx = (await fetchQuery(
		api.organizations.getOrgForCallerInternal,
		{}
	)) as ConnectContext | null;
	if (!ctx) {
		throw new Error("ORG_NOT_FOUND");
	}
	// Defense-in-depth — the Convex query already asserts ownership but a
	// future migration that loosens the query body would otherwise become
	// a silent escalation vector.
	if (ctx.organization.ownerUserId !== ctx.userId) {
		throw new Error("NOT_ORG_OWNER");
	}
	return ctx;
}

export function deriveConnectFieldsFromOrg(
	ctx: ConnectContext,
	currentUserEmail: string | null
): { country: string; currency: string; email: string } {
	const country = ctx.organization.addressCountry?.toUpperCase() ?? "";
	if (country !== "US") {
		throw new Error(
			"OneTool Connect is currently US-only - contact support for other countries."
		);
	}
	const email = ctx.organization.email ?? currentUserEmail ?? "";
	if (!email) {
		throw new Error("ORG_HAS_NO_EMAIL");
	}
	return { country: "US", currency: "usd", email };
}

/**
 * Plan 14.2.1-03 (CONTEXT.md "Accounts v2 Migration Strategy") - clean
 * cutover to /v2/core/accounts. Mirrors the v1 controller-properties
 * configuration into the v2 defaults.responsibilities + configuration
 * blocks (Pitfall 1 value-flip on fees_collector; Pitfall 2 applied:true
 * on each configuration). Idempotency key bumped to acct-create-v2-${orgId}
 * to avoid the 24h cache collision with v1 keys (Pitfall 5). Include list
 * widened to include configuration.recipient + requirements so the create
 * response carries enough state for deriveConnectStatusFromV2Account to
 * return real values immediately (REVIEWS.md MEDIUM).
 */
export async function createConnectAccount(
	ctx: ConnectContext,
	currentUserEmail: string | null
): Promise<Stripe.V2.Core.Account> {
	const { country, email } = deriveConnectFieldsFromOrg(ctx, currentUserEmail);
	const stripe = getStripeClient();
	// Body cast: SDK 22.1.1 AccountCreateParams.Configuration.{Merchant,Recipient}
	// omit the `applied?: boolean` field present on the corresponding
	// AccountUpdateParams namespaces. Per the v2 REST contract (Pitfall 2),
	// `applied: true` on create activates each configuration immediately so the
	// merchant + recipient capabilities are requested in the same call. The cast
	// preserves the Pitfall 2 invariant until the SDK type definitions catch up.
	const body: Stripe.V2.Core.AccountCreateParams = {
		contact_email: email,
		dashboard: "none",
		include: [
			"configuration.merchant",
			"configuration.recipient",
			"identity",
			"requirements",
		],
		defaults: {
			currency: "usd",
			responsibilities: {
				// Pitfall 1 value-flip: v1 fees.payer="account" -> v2 fees_collector="stripe"
				fees_collector: "stripe",
				// v1 losses.payments="stripe" -> v2 losses_collector="stripe" (value unchanged)
				losses_collector: "stripe",
			},
		},
		identity: { country },
		configuration: {
			merchant: {
				applied: true,
				capabilities: {
					card_payments: { requested: true },
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any,
			recipient: {
				applied: true,
				capabilities: {
					// v1 capabilities.transfers -> v2 configuration.recipient.capabilities.stripe_balance.stripe_transfers
					stripe_balance: {
						stripe_transfers: { requested: true },
					},
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any,
		},
	};
	return stripe.v2.core.accounts.create(body, {
		idempotencyKey: `acct-create-v2-${ctx.orgId}`,
	});
}

/**
 * Plan 14.2.1-03 (Pitfall 6) - v2 Account responses do NOT carry top-level
 * charges_enabled / payouts_enabled / details_submitted booleans. Derive
 * them from the capability statuses + requirements entries.
 *
 * payoutsEnabled reads from configuration.recipient.capabilities.stripe_balance.stripe_transfers.status
 * (the v2 path for the v1 "transfers" capability) per REVIEWS.md.
 */
export function deriveConnectStatusFromV2Account(
	account: Stripe.V2.Core.Account
): {
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	detailsSubmitted: boolean;
	requirements: NonNullable<Stripe.V2.Core.Account["requirements"]> | null;
} {
	const merchantCaps = account.configuration?.merchant?.capabilities;
	const recipientCaps = account.configuration?.recipient?.capabilities;
	return {
		chargesEnabled: merchantCaps?.card_payments?.status === "active",
		payoutsEnabled:
			recipientCaps?.stripe_balance?.stripe_transfers?.status === "active",
		detailsSubmitted:
			(account.requirements?.entries?.filter(
				(e) => e.awaiting_action_from === "user"
			).length ?? 0) === 0,
		requirements: account.requirements ?? null,
	};
}
