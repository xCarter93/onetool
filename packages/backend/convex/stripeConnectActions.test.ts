import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Stripe from "stripe";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	addMemberToOrg,
	createTestIdentity,
	createTestOrg,
} from "./test.helpers";
import { __setStripeClientForTests } from "./stripeConnectActions";

const accountsCreate = vi.fn();
const accountsRetrieve = vi.fn();
const listExternalAccounts = vi.fn();

function installStripeMock() {
	__setStripeClientForTests({
		v2: {
			core: {
				accounts: { create: accountsCreate, retrieve: accountsRetrieve },
			},
		},
		accounts: { listExternalAccounts },
	} as unknown as Parameters<typeof __setStripeClientForTests>[0]);
}

function stripeAccount(input: {
	id: string;
	orgId?: string;
	cardPayments?: string;
	payouts?: string;
	transfers?: string;
	entries?: unknown[];
}) {
	return {
		id: input.id,
		object: "v2.core.account",
		metadata: input.orgId ? { onetool_org_id: input.orgId } : {},
		configuration: {
			merchant: {
				capabilities: {
					card_payments: { status: input.cardPayments ?? "pending" },
					stripe_balance: { payouts: { status: input.payouts ?? "pending" } },
				},
			},
			recipient: {
				capabilities: {
					stripe_balance: {
						stripe_transfers: { status: input.transfers ?? "pending" },
					},
				},
			},
		},
		requirements: { entries: input.entries ?? [] },
	};
}

async function seedOwnerOrg(
	t: ReturnType<typeof convexTest>,
	overrides: { stripeConnectAccountId?: string } = {}
) {
	const org = await t.run(async (ctx) => {
		const created = await createTestOrg(ctx, {
			userEmail: "owner@acme.test",
		});
		await ctx.db.patch(created.orgId, {
			email: "billing@acme.test",
			addressCountry: "United States",
			...overrides,
		});
		return created;
	});
	const owner = t.withIdentity(
		createTestIdentity(org.clerkUserId, org.clerkOrgId)
	);
	return { org, owner };
}

describe("stripeConnectActions", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		accountsCreate.mockReset();
		accountsRetrieve.mockReset();
		listExternalAccounts.mockReset();
		listExternalAccounts.mockResolvedValue({ data: [] });
		installStripeMock();
	});

	afterEach(() => {
		__setStripeClientForTests(null);
	});

	describe("ensureAccount", () => {
		it("creates the account bound to the org via metadata and persists the binding server-side", async () => {
			const { org, owner } = await seedOwnerOrg(t);
			accountsCreate.mockImplementation(async (body: { metadata: unknown }) =>
				stripeAccount({ id: "acct_created", orgId: org.orgId })
			);

			const result = await owner.action(api.stripeConnectActions.ensureAccount, {});

			expect(result.accountId).toBe("acct_created");
			expect(result.chargesEnabled).toBe(false);
			const body = accountsCreate.mock.calls[0]?.[0];
			const options = accountsCreate.mock.calls[0]?.[1];
			expect(body.metadata).toEqual({ onetool_org_id: org.orgId });
			expect(body.contact_email).toBe("billing@acme.test");
			expect(body.identity.country).toBe("US");
			expect(body.dashboard).toBe("none");
			expect(body.defaults.responsibilities).toEqual({
				fees_collector: "stripe",
				losses_collector: "stripe",
			});
			expect(body.configuration.merchant.capabilities.card_payments).toEqual({
				requested: true,
			});
			expect(options.idempotencyKey).toBe(`acct-create-v2-${org.orgId}`);
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripeConnectAccountId).toBe("acct_created");
		});

		it("falls back to the owner's email when the org has none", async () => {
			const { owner, org } = await seedOwnerOrg(t);
			await t.run((ctx) => ctx.db.patch(org.orgId, { email: undefined }));
			accountsCreate.mockResolvedValue(
				stripeAccount({ id: "acct_email", orgId: org.orgId })
			);
			await owner.action(api.stripeConnectActions.ensureAccount, {});
			expect(accountsCreate.mock.calls[0]?.[0].contact_email).toBe(
				"owner@acme.test"
			);
		});

		it("rejects non-US orgs before calling Stripe", async () => {
			const { owner, org } = await seedOwnerOrg(t);
			await t.run((ctx) => ctx.db.patch(org.orgId, { addressCountry: "CA" }));
			await expect(
				owner.action(api.stripeConnectActions.ensureAccount, {})
			).rejects.toThrowError(/US_ONLY/);
			expect(accountsCreate).not.toHaveBeenCalled();
		});

		it("rejects a non-owner member and never calls Stripe", async () => {
			const { org } = await seedOwnerOrg(t);
			await t.run((ctx) =>
				addMemberToOrg(ctx, org.orgId, { clerkUserId: "user_member" })
			);
			const member = t.withIdentity(
				createTestIdentity("user_member", org.clerkOrgId)
			);
			await expect(
				member.action(api.stripeConnectActions.ensureAccount, {})
			).rejects.toThrowError(/NOT_ORG_OWNER/);
			expect(accountsCreate).not.toHaveBeenCalled();
			expect(accountsRetrieve).not.toHaveBeenCalled();
		});

		it("returns live status for an already-bound account whose metadata names this org", async () => {
			const { org, owner } = await seedOwnerOrg(t, {
				stripeConnectAccountId: "acct_bound",
			});
			accountsRetrieve.mockResolvedValue(
				stripeAccount({
					id: "acct_bound",
					orgId: org.orgId,
					cardPayments: "active",
					payouts: "active",
					entries: [
						{
							awaiting_action_from: "stripe",
							description: "identity.verification",
							errors: [],
							minimum_deadline: { status: "eventually_due" },
						},
					],
				})
			);
			const result = await owner.action(api.stripeConnectActions.ensureAccount, {});
			expect(result).toMatchObject({
				accountId: "acct_bound",
				chargesEnabled: true,
				payoutsEnabled: true,
				detailsSubmitted: true,
			});
			expect(result.requirements?.entries).toHaveLength(1);
			expect(accountsCreate).not.toHaveBeenCalled();
		});

		it("refuses an account whose Stripe metadata belongs to a different org", async () => {
			const { owner } = await seedOwnerOrg(t, {
				stripeConnectAccountId: "acct_foreign",
			});
			accountsRetrieve.mockResolvedValue(
				stripeAccount({ id: "acct_foreign", orgId: "some_other_org" })
			);
			await expect(
				owner.action(api.stripeConnectActions.ensureAccount, {})
			).rejects.toThrowError(/ACCOUNT_ORG_MISMATCH/);
			expect(accountsCreate).not.toHaveBeenCalled();
		});

		it("recreates under an idempotency key pinned to the stale account id", async () => {
			const { org, owner } = await seedOwnerOrg(t, {
				stripeConnectAccountId: "acct_gone",
			});
			await t.run((ctx) =>
				ctx.db.patch(org.orgId, { stripeChargesEnabled: true })
			);
			accountsRetrieve.mockRejectedValue(
				new Stripe.errors.StripeInvalidRequestError({
					message: "No such account",
					statusCode: 404,
					code: "resource_missing",
				} as never)
			);
			accountsCreate.mockResolvedValue(
				stripeAccount({ id: "acct_fresh", orgId: org.orgId })
			);
			const result = await owner.action(api.stripeConnectActions.ensureAccount, {});
			expect(result.accountId).toBe("acct_fresh");
			expect(accountsCreate.mock.calls[0]?.[1].idempotencyKey).toBe(
				`acct-create-v2-${org.orgId}-acct_gone`
			);
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripeConnectAccountId).toBe("acct_fresh");
			expect(saved?.stripeChargesEnabled).toBeUndefined();
		});

		it("keeps the stale account id when the recreate's bind fails, so the retry replays the same key", async () => {
			const { org, owner } = await seedOwnerOrg(t, {
				stripeConnectAccountId: "acct_gone",
			});
			await t.run(async (ctx) => {
				const other = await createTestOrg(ctx, {
					clerkUserId: "user_bind_other",
					clerkOrgId: "org_bind_other",
				});
				await ctx.db.patch(other.orgId, {
					stripeConnectAccountId: "acct_fresh",
				});
			});
			accountsRetrieve.mockRejectedValue(
				new Stripe.errors.StripeInvalidRequestError({
					message: "No such account",
					statusCode: 404,
					code: "resource_missing",
				} as never)
			);
			accountsCreate.mockResolvedValue(
				stripeAccount({ id: "acct_fresh", orgId: org.orgId })
			);

			await expect(
				owner.action(api.stripeConnectActions.ensureAccount, {})
			).rejects.toThrowError(/DUPLICATE_CONNECT_ACCOUNT/);

			expect(accountsCreate.mock.calls[0]?.[1].idempotencyKey).toBe(
				`acct-create-v2-${org.orgId}-acct_gone`
			);
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripeConnectAccountId).toBe("acct_gone");
		});

		it("refuses to bind an account that already belongs to another org", async () => {
			const { org, owner } = await seedOwnerOrg(t);
			await t.run(async (ctx) => {
				const other = await createTestOrg(ctx, {
					clerkUserId: "user_other",
					clerkOrgId: "org_other",
				});
				await ctx.db.patch(other.orgId, {
					stripeConnectAccountId: "acct_taken",
				});
			});
			accountsCreate.mockResolvedValue(
				stripeAccount({ id: "acct_taken", orgId: org.orgId })
			);
			await expect(
				owner.action(api.stripeConnectActions.ensureAccount, {})
			).rejects.toThrowError(/DUPLICATE_CONNECT_ACCOUNT/);
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripeConnectAccountId).toBeUndefined();
		});
	});

	describe("refreshStatus", () => {
		it("rejects when the org has no account yet", async () => {
			const { owner } = await seedOwnerOrg(t);
			await expect(
				owner.action(api.stripeConnectActions.refreshStatus, {})
			).rejects.toThrowError(/NOT_ONBOARDED/);
			expect(accountsRetrieve).not.toHaveBeenCalled();
		});

		it("persists readiness from a live read, taking payouts from the payouts capability", async () => {
			const { org, owner } = await seedOwnerOrg(t, {
				stripeConnectAccountId: "acct_live",
			});
			accountsRetrieve.mockResolvedValue(
				stripeAccount({
					id: "acct_live",
					orgId: org.orgId,
					cardPayments: "active",
					payouts: "pending",
					transfers: "active",
				})
			);
			listExternalAccounts.mockResolvedValue({
				data: [
					{ last4: "1111", bank_name: "Other", default_for_currency: false },
					{ last4: "4242", bank_name: "Chase", default_for_currency: true },
				],
			});
			const result = await owner.action(api.stripeConnectActions.refreshStatus, {});
			expect(result).toMatchObject({
				accountId: "acct_live",
				chargesEnabled: true,
				payoutsEnabled: false,
				detailsSubmitted: true,
			});
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripeChargesEnabled).toBe(true);
			expect(saved?.stripePayoutsEnabled).toBe(false);
			expect(saved?.stripeDetailsSubmitted).toBe(true);
			expect(saved?.stripeExternalAccountLast4).toBe("4242");
			expect(saved?.stripeExternalAccountBankName).toBe("Chase");
			expect(saved?.stripeStatusEventCreated).toBeGreaterThan(0);
		});

		it("still returns live status when the bank lookup fails and keeps the known bank", async () => {
			const { org, owner } = await seedOwnerOrg(t, {
				stripeConnectAccountId: "acct_bank",
			});
			await t.run((ctx) =>
				ctx.db.patch(org.orgId, { stripeExternalAccountLast4: "9999" })
			);
			accountsRetrieve.mockResolvedValue(
				stripeAccount({ id: "acct_bank", orgId: org.orgId, cardPayments: "active" })
			);
			listExternalAccounts.mockRejectedValue(new Error("boom"));
			const result = await owner.action(api.stripeConnectActions.refreshStatus, {});
			expect(result.chargesEnabled).toBe(true);
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripeExternalAccountLast4).toBe("9999");
		});

		it("refuses to sync status from an account bound to another org", async () => {
			const { org, owner } = await seedOwnerOrg(t, {
				stripeConnectAccountId: "acct_foreign",
			});
			accountsRetrieve.mockResolvedValue(
				stripeAccount({
					id: "acct_foreign",
					orgId: "some_other_org",
					cardPayments: "active",
				})
			);
			await expect(
				owner.action(api.stripeConnectActions.refreshStatus, {})
			).rejects.toThrowError(/ACCOUNT_ORG_MISMATCH/);
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripeChargesEnabled).toBeUndefined();
		});

		it("rejects a non-owner member", async () => {
			const { org } = await seedOwnerOrg(t, {
				stripeConnectAccountId: "acct_live",
			});
			await t.run((ctx) =>
				addMemberToOrg(ctx, org.orgId, { clerkUserId: "user_member" })
			);
			const member = t.withIdentity(
				createTestIdentity("user_member", org.clerkOrgId)
			);
			await expect(
				member.action(api.stripeConnectActions.refreshStatus, {})
			).rejects.toThrowError(/NOT_ORG_OWNER/);
			expect(accountsRetrieve).not.toHaveBeenCalled();
		});
	});
});
