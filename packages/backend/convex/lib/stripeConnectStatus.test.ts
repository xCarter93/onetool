import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import {
	deriveConnectStatusFromV1Account,
	deriveConnectStatusFromV2Account,
} from "./stripeConnectStatus";

function v2Account(input: {
	cardPayments?: string;
	payouts?: string;
	transfers?: string;
	requirements?: unknown;
}): Stripe.V2.Core.Account {
	return {
		configuration: {
			merchant: {
				capabilities: {
					...(input.cardPayments
						? { card_payments: { status: input.cardPayments } }
						: {}),
					...(input.payouts
						? { stripe_balance: { payouts: { status: input.payouts } } }
						: {}),
				},
			},
			recipient: {
				capabilities: input.transfers
					? { stripe_balance: { stripe_transfers: { status: input.transfers } } }
					: {},
			},
		},
		requirements:
			input.requirements === undefined ? { entries: [] } : input.requirements,
	} as unknown as Stripe.V2.Core.Account;
}

describe("deriveConnectStatusFromV2Account", () => {
	it("returns all-active when card_payments and payouts are active with no user-action requirements", () => {
		expect(
			deriveConnectStatusFromV2Account(
				v2Account({ cardPayments: "active", payouts: "active" })
			)
		).toEqual({
			chargesEnabled: true,
			payoutsEnabled: true,
			detailsSubmitted: true,
			requirements: { currently_due: [], entries: [] },
		});
	});

	it("returns chargesEnabled=false when card_payments is pending", () => {
		expect(
			deriveConnectStatusFromV2Account(v2Account({ cardPayments: "pending" }))
				.chargesEnabled
		).toBe(false);
	});

	it("reads payouts from merchant stripe_balance.payouts, not recipient stripe_transfers (audit P2)", () => {
		expect(
			deriveConnectStatusFromV2Account(
				v2Account({
					cardPayments: "active",
					payouts: "pending",
					transfers: "active",
				})
			).payoutsEnabled
		).toBe(false);
		expect(
			deriveConnectStatusFromV2Account(
				v2Account({
					cardPayments: "active",
					payouts: "active",
					transfers: "pending",
				})
			).payoutsEnabled
		).toBe(true);
	});

	it("returns payoutsEnabled=false when the payouts capability is absent", () => {
		expect(
			deriveConnectStatusFromV2Account(
				v2Account({ cardPayments: "active", transfers: "active" })
			).payoutsEnabled
		).toBe(false);
	});

	it("returns detailsSubmitted=false for a fresh account with empty entries and no active capability", () => {
		expect(
			deriveConnectStatusFromV2Account(
				v2Account({ cardPayments: "pending", payouts: "pending" })
			).detailsSubmitted
		).toBe(false);
	});

	it("returns detailsSubmitted=true while submitted details are under Stripe review", () => {
		expect(
			deriveConnectStatusFromV2Account(
				v2Account({
					cardPayments: "pending",
					requirements: { entries: [{ awaiting_action_from: "stripe" }] },
				})
			).detailsSubmitted
		).toBe(true);
	});

	it("returns detailsSubmitted=false when a requirement awaits user action", () => {
		expect(
			deriveConnectStatusFromV2Account(
				v2Account({
					requirements: { entries: [{ awaiting_action_from: "user" }] },
				})
			).detailsSubmitted
		).toBe(false);
	});

	it("maps user-action entries to currently_due so the UI surfaces blockers", () => {
		expect(
			deriveConnectStatusFromV2Account(
				v2Account({
					requirements: {
						entries: [
							{ awaiting_action_from: "user", description: "identity.document" },
							{ awaiting_action_from: "stripe", description: "tos.acceptance" },
							{ awaiting_action_from: "user", description: "external_account" },
						],
					},
				})
			).requirements?.currently_due
		).toEqual(["identity.document", "external_account"]);
	});

	it("returns requirements=null when Stripe has not analysed the account yet", () => {
		expect(
			deriveConnectStatusFromV2Account(v2Account({ requirements: null }))
				.requirements
		).toBeNull();
	});
});

describe("deriveConnectStatusFromV1Account", () => {
	it("maps the v1 account.updated snapshot onto the same shape as the v2 mapper", () => {
		const account = {
			charges_enabled: true,
			payouts_enabled: false,
			details_submitted: true,
			requirements: {
				currently_due: ["external_account"],
				disabled_reason: "requirements.past_due",
			},
		} as unknown as Stripe.Account;
		expect(deriveConnectStatusFromV1Account(account)).toEqual({
			chargesEnabled: true,
			payoutsEnabled: false,
			detailsSubmitted: true,
			requirementsCurrentlyDue: ["external_account"],
			requirementsDisabledReason: "requirements.past_due",
		});
	});

	it("tolerates a missing requirements block", () => {
		const account = {
			charges_enabled: false,
			payouts_enabled: false,
			details_submitted: false,
		} as unknown as Stripe.Account;
		expect(deriveConnectStatusFromV1Account(account)).toEqual({
			chargesEnabled: false,
			payoutsEnabled: false,
			detailsSubmitted: false,
			requirementsCurrentlyDue: [],
			requirementsDisabledReason: undefined,
		});
	});
});
