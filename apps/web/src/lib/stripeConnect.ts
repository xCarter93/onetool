import "server-only";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
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
	// convex/nextjs calls need the Clerk JWT passed explicitly as `{ token }`.
	convexToken: string;
}

// All /api/stripe-connect/* routes derive account context here.
export async function getOrgConnectAccountForCaller(): Promise<ConnectContext> {
	const { userId, getToken } = await auth();
	if (!userId) {
		throw new Error("UNAUTHORIZED");
	}
	const convexToken = await getToken({ template: "convex" });
	if (!convexToken) {
		// Clerk session exists, but the Convex JWT template is missing or unavailable.
		throw new Error("UNAUTHORIZED");
	}

	const ctx = (await fetchQuery(
		api.organizations.getOrgForCallerInternal,
		{},
		{ token: convexToken }
	)) as Omit<ConnectContext, "convexToken"> | null;
	if (!ctx) {
		throw new Error("ORG_NOT_FOUND");
	}
	// Keep ownership enforced even if the Convex query changes later.
	if (ctx.organization.ownerUserId !== ctx.userId) {
		throw new Error("NOT_ORG_OWNER");
	}
	return { ...ctx, convexToken };
}

// Normalize the human-readable country stored by the org profile form.
const US_ALIASES = new Set(["US", "USA", "UNITED STATES", "U.S.", "U.S.A."]);

export function deriveConnectFieldsFromOrg(
	ctx: ConnectContext,
	currentUserEmail: string | null
): { country: string; currency: string; email: string } {
	const country = ctx.organization.addressCountry?.trim().toUpperCase() ?? "";
	if (!US_ALIASES.has(country)) {
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
 * Create an Accounts v2 connected account with merchant and recipient capabilities.
 */
export async function createConnectAccount(
	ctx: ConnectContext,
	currentUserEmail: string | null,
	options: { idempotencyKeySuffix?: string } = {}
): Promise<Stripe.V2.Core.Account> {
	const { country, email } = deriveConnectFieldsFromOrg(ctx, currentUserEmail);
	const stripe = getStripeClient();
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
	// Suffix rotates the key for the recovery path so Stripe doesn't replay a
	// cached stale account from the prior (now-invalid) create call.
	const idempotencyKey = options.idempotencyKeySuffix
		? `acct-create-v2-${ctx.orgId}-${options.idempotencyKeySuffix}`
		: `acct-create-v2-${ctx.orgId}`;
	return stripe.v2.core.accounts.create(body, { idempotencyKey });
}

/**
 * Derive UI status booleans from Accounts v2 capability and requirement fields.
 *
 * `requirements` is normalised to a v1-shaped `{ currently_due }` list so the
 * UI and the webhook-cached `account.updated` payload (which is still v1)
 * share one rendering path. The v2 entries[] live under `entries` if a caller
 * needs the richer structure (errors, impact, deadlines).
 */
export function deriveConnectStatusFromV2Account(
	account: Stripe.V2.Core.Account
): {
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	detailsSubmitted: boolean;
	requirements: {
		currently_due: string[];
		entries: NonNullable<Stripe.V2.Core.Account["requirements"]>["entries"];
	} | null;
} {
	const merchantCaps = account.configuration?.merchant?.capabilities;
	const recipientCaps = account.configuration?.recipient?.capabilities;
	const entries = account.requirements?.entries;
	const currentlyDue = Array.isArray(entries)
		? entries
				.filter((e) => e.awaiting_action_from === "user")
				.map((e) => e.description)
		: [];
	return {
		chargesEnabled: merchantCaps?.card_payments?.status === "active",
		payoutsEnabled:
			recipientCaps?.stripe_balance?.stripe_transfers?.status === "active",
		// Treat missing requirements as "not yet submitted" — a freshly created
		// v2 account can return requirements:null before Stripe analyses it.
		detailsSubmitted: Array.isArray(entries) && currentlyDue.length === 0,
		requirements: account.requirements
			? { currently_due: currentlyDue, entries: entries ?? [] }
			: null,
	};
}

// Map Connect helper error messages to HTTP responses. Shared across all
// /api/stripe-connect/* routes so error codes stay in lockstep.
export function mapConnectError(
	err: unknown,
	fallback: string
): NextResponse {
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
