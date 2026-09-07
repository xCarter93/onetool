import type Stripe from "stripe";

export interface ConnectStatus {
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	detailsSubmitted: boolean;
	requirements: {
		currently_due: string[];
		entries: NonNullable<Stripe.V2.Core.Account["requirements"]>["entries"];
	} | null;
}

/**
 * Derive UI status booleans from Accounts v2 capability and requirement fields.
 *
 * Payout readiness is the merchant `stripe_balance.payouts` capability (v1
 * `payouts_enabled`); the recipient `stripe_transfers` capability only says the
 * account can receive transfers and does not gate bank payouts.
 *
 * `requirements` is normalised to a v1-shaped `{ currently_due }` list so the
 * UI and the webhook-cached `account.updated` payload (which is still v1)
 * share one rendering path.
 */
export function deriveConnectStatusFromV2Account(
	account: Stripe.V2.Core.Account
): ConnectStatus {
	const merchantCaps = account.configuration?.merchant?.capabilities;
	const entries = account.requirements?.entries;
	const currentlyDue = Array.isArray(entries)
		? entries
				.filter((e) => e.awaiting_action_from === "user")
				.map((e) => e.description)
		: [];
	const chargesEnabled = merchantCaps?.card_payments?.status === "active";
	const payoutsEnabled =
		merchantCaps?.stripe_balance?.payouts?.status === "active";
	return {
		chargesEnabled,
		payoutsEnabled,
		// A freshly created v2 account can return requirements:null, and a
		// never-onboarded one returns entries:[] — require a positive signal
		// before reporting the owner's details as submitted.
		detailsSubmitted:
			Array.isArray(entries) &&
			currentlyDue.length === 0 &&
			(entries.length > 0 || chargesEnabled || payoutsEnabled),
		requirements: account.requirements
			? { currently_due: currentlyDue, entries: entries ?? [] }
			: null,
	};
}

/** v1 `account.updated` snapshot, in the same readiness terms as the v2 mapper. */
export function deriveConnectStatusFromV1Account(account: Stripe.Account): {
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	detailsSubmitted: boolean;
	requirementsCurrentlyDue: string[];
	requirementsDisabledReason: string | undefined;
} {
	return {
		chargesEnabled: account.charges_enabled === true,
		payoutsEnabled: account.payouts_enabled === true,
		detailsSubmitted: account.details_submitted === true,
		requirementsCurrentlyDue: account.requirements?.currently_due ?? [],
		requirementsDisabledReason:
			account.requirements?.disabled_reason ?? undefined,
	};
}
