// Plan 14.2-02 Task 2 — lockdown helper tests.
// Plan 14.2.1-03 Task 1 — v2 account-create + status-derivation helper tests (T-14.2.1-08).
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// Plan 14.2.1-03 (REVIEWS.md MEDIUM): vi.hoisted is REQUIRED here.
// Vitest hoists vi.mock calls above any top-level const declarations, so
// a module-scope `const v2CreateMock = vi.fn()` would be undefined at the
// moment the mock factory runs. vi.hoisted lets us define the handle in
// the same hoist pass.
const { v2CreateMock } = vi.hoisted(() => ({ v2CreateMock: vi.fn() }));

vi.mock("@/lib/stripe", () => ({
	getStripeClient: () => ({
		v2: {
			core: {
				accounts: { create: v2CreateMock },
			},
		},
	}),
}));

vi.mock("@clerk/nextjs/server", () => ({
	auth: vi.fn(),
}));
vi.mock("convex/nextjs", () => ({
	fetchQuery: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import {
	getOrgConnectAccountForCaller,
	deriveConnectFieldsFromOrg,
	createConnectAccount,
	deriveConnectStatusFromV2Account,
	type ConnectContext,
} from "./stripeConnect";

const mockedAuth = vi.mocked(auth);
const mockedFetchQuery = vi.mocked(fetchQuery);

function buildCtx(overrides: Partial<ConnectContext> = {}): ConnectContext {
	const userId = "user_owner" as ConnectContext["userId"];
	const orgId = "org_test" as ConnectContext["orgId"];
	return {
		userId,
		orgId,
		stripeConnectAccountId: null,
		organization: {
			_id: orgId,
			name: "Test Org",
			email: "org@example.com",
			addressCountry: "US",
			ownerUserId: userId,
		},
		convexToken: "jwt.token.value",
		...overrides,
	};
}

function mockClerkAuth({
	userId,
	token,
}: {
	userId: string | null;
	token: string | null;
}) {
	// @ts-expect-error — partial Clerk Auth mock
	mockedAuth.mockResolvedValue({
		userId,
		getToken: vi.fn().mockResolvedValue(token),
	});
}

describe("getOrgConnectAccountForCaller", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("throws UNAUTHORIZED when Clerk auth() returns userId=null", async () => {
		mockClerkAuth({ userId: null, token: null });
		await expect(getOrgConnectAccountForCaller()).rejects.toThrowError(
			"UNAUTHORIZED"
		);
		expect(mockedFetchQuery).not.toHaveBeenCalled();
	});

	it("throws UNAUTHORIZED when Clerk userId exists but the 'convex' JWT template is unconfigured", async () => {
		mockClerkAuth({ userId: "user_owner_clerk", token: null });
		await expect(getOrgConnectAccountForCaller()).rejects.toThrowError(
			"UNAUTHORIZED"
		);
		expect(mockedFetchQuery).not.toHaveBeenCalled();
	});

	it("returns the ConnectContext when fetchQuery resolves, with the Clerk JWT forwarded as the token option", async () => {
		mockClerkAuth({ userId: "user_owner_clerk", token: "jwt.token.value" });
		const stored = buildCtx({ stripeConnectAccountId: "acct_existing" });
		const { convexToken: _omit, ...storedNoToken } = stored;
		mockedFetchQuery.mockResolvedValue(storedNoToken);

		const result = await getOrgConnectAccountForCaller();
		expect(result).toEqual(stored);
		expect(mockedFetchQuery).toHaveBeenCalledTimes(1);
		// Args (second positional) must remain `{}` (FINDINGS V-1 lockdown).
		const callArgs = mockedFetchQuery.mock.calls[0]?.[1] as Record<
			string,
			unknown
		>;
		expect(callArgs).toEqual({});
		// Options (third positional) must carry the Clerk Convex JWT so
		// getCurrentUserOrThrow can resolve identity. Regression guard for the
		// fix that closes the "User not authenticated" onboarding bug.
		const callOpts = mockedFetchQuery.mock.calls[0]?.[2] as
			| { token?: string }
			| undefined;
		expect(callOpts?.token).toBe("jwt.token.value");
	});
});

describe("deriveConnectFieldsFromOrg", () => {
	it("returns { country: US, currency: usd, email } for a US org with email", () => {
		const result = deriveConnectFieldsFromOrg(
			buildCtx({
				organization: {
					...buildCtx().organization,
					addressCountry: "US",
					email: "billing@example.com",
				},
			}),
			null
		);
		expect(result).toEqual({
			country: "US",
			currency: "usd",
			email: "billing@example.com",
		});
	});

	it("falls back to currentUserEmail when org.email is missing", () => {
		const result = deriveConnectFieldsFromOrg(
			buildCtx({
				organization: {
					...buildCtx().organization,
					addressCountry: "US",
					email: undefined,
				},
			}),
			"user@example.com"
		);
		expect(result.email).toBe("user@example.com");
	});

	it.each([
		["US"],
		["us"],
		["USA"],
		["United States"],
		["  united states  "],
		["U.S.A."],
	])(
		"accepts %s as the US country for addressCountry (UI + autocomplete write the human-readable name)",
		(addressCountry) => {
			const result = deriveConnectFieldsFromOrg(
				buildCtx({
					organization: {
						...buildCtx().organization,
						addressCountry,
						email: "billing@example.com",
					},
				}),
				null
			);
			expect(result.country).toBe("US");
		}
	);

	it("throws 'OneTool Connect is currently US-only' for a non-US org (e.g. CA)", () => {
		expect(() =>
			deriveConnectFieldsFromOrg(
				buildCtx({
					organization: {
						...buildCtx().organization,
						addressCountry: "CA",
					},
				}),
				null
			)
		).toThrowError(/OneTool Connect is currently US-only/);
	});

	it("throws ORG_HAS_NO_EMAIL when both org.email and currentUserEmail are missing", () => {
		expect(() =>
			deriveConnectFieldsFromOrg(
				buildCtx({
					organization: {
						...buildCtx().organization,
						addressCountry: "US",
						email: undefined,
					},
				}),
				null
			)
		).toThrowError("ORG_HAS_NO_EMAIL");
	});
});

describe("T-14.2.1-08: createConnectAccount v2 request body shape", () => {
	beforeEach(() => {
		v2CreateMock.mockReset();
		v2CreateMock.mockResolvedValue({
			id: "acct_test_v2",
			configuration: {
				merchant: { capabilities: { card_payments: { status: "active" } } },
				recipient: {
					capabilities: {
						stripe_balance: { stripe_transfers: { status: "active" } },
					},
				},
			},
			requirements: { entries: [] },
		});
	});

	const ctx: ConnectContext = {
		userId: "user_1" as ConnectContext["userId"],
		orgId: "org_1" as ConnectContext["orgId"],
		stripeConnectAccountId: null,
		organization: {
			_id: "org_1" as ConnectContext["orgId"],
			name: "Acme Cleaning",
			email: "owner@acme.test",
			addressCountry: "US",
			ownerUserId: "user_1" as ConnectContext["userId"],
		},
		convexToken: "jwt.token.value",
	};

	it("sends fees_collector='stripe' (Pitfall 1 value flip)", async () => {
		await createConnectAccount(ctx, "owner@acme.test");
		expect(v2CreateMock).toHaveBeenCalledTimes(1);
		const [body] = v2CreateMock.mock.calls[0];
		expect(body.defaults.responsibilities.fees_collector).toBe("stripe");
	});

	it("sends losses_collector='stripe'", async () => {
		await createConnectAccount(ctx, "owner@acme.test");
		const [body] = v2CreateMock.mock.calls[0];
		expect(body.defaults.responsibilities.losses_collector).toBe("stripe");
	});

	it("sends dashboard='none'", async () => {
		await createConnectAccount(ctx, "owner@acme.test");
		const [body] = v2CreateMock.mock.calls[0];
		expect(body.dashboard).toBe("none");
	});

	it("sends configuration.merchant.applied=true with card_payments.requested=true (Pitfall 2)", async () => {
		await createConnectAccount(ctx, "owner@acme.test");
		const [body] = v2CreateMock.mock.calls[0];
		expect(body.configuration.merchant.applied).toBe(true);
		expect(
			body.configuration.merchant.capabilities.card_payments.requested
		).toBe(true);
	});

	it("sends configuration.recipient.applied=true with stripe_balance.stripe_transfers.requested=true (Pitfall 2)", async () => {
		await createConnectAccount(ctx, "owner@acme.test");
		const [body] = v2CreateMock.mock.calls[0];
		expect(body.configuration.recipient.applied).toBe(true);
		expect(
			body.configuration.recipient.capabilities.stripe_balance.stripe_transfers
				.requested
		).toBe(true);
	});

	it("include array contains configuration.recipient + requirements (REVIEWS.md widening)", async () => {
		await createConnectAccount(ctx, "owner@acme.test");
		const [body] = v2CreateMock.mock.calls[0];
		expect(body.include).toEqual(
			expect.arrayContaining([
				"configuration.merchant",
				"configuration.recipient",
				"identity",
				"requirements",
			])
		);
	});

	it("sends identity.country='US' (US-only precondition)", async () => {
		await createConnectAccount(ctx, "owner@acme.test");
		const [body] = v2CreateMock.mock.calls[0];
		expect(body.identity.country).toBe("US");
	});

	it("sends contact_email from arg (NOT email from ctx if currentUserEmail provided)", async () => {
		await createConnectAccount(ctx, "owner@acme.test");
		const [body] = v2CreateMock.mock.calls[0];
		expect(body.contact_email).toBe("owner@acme.test");
	});

	it("uses idempotency key 'acct-create-v2-${orgId}' (Pitfall 5 - NOT v1 key)", async () => {
		await createConnectAccount(ctx, "owner@acme.test");
		const [, options] = v2CreateMock.mock.calls[0];
		expect(options.idempotencyKey).toBe("acct-create-v2-org_1");
		expect(options.idempotencyKey).not.toBe("acct-create-org_1");
	});

	it("throws US-only when addressCountry is not US", async () => {
		const ctxCa: ConnectContext = {
			...ctx,
			organization: { ...ctx.organization, addressCountry: "CA" },
		};
		await expect(
			createConnectAccount(ctxCa, "owner@acme.test")
		).rejects.toThrow(/US-only/);
		expect(v2CreateMock).not.toHaveBeenCalled();
	});
});

describe("deriveConnectStatusFromV2Account", () => {
	it("returns all-active when both capabilities active and no user-action requirements", () => {
		const account = {
			configuration: {
				merchant: { capabilities: { card_payments: { status: "active" } } },
				recipient: {
					capabilities: {
						stripe_balance: { stripe_transfers: { status: "active" } },
					},
				},
			},
			requirements: { entries: [] },
		} as unknown as Stripe.V2.Core.Account;
		expect(deriveConnectStatusFromV2Account(account)).toEqual({
			chargesEnabled: true,
			payoutsEnabled: true,
			detailsSubmitted: true,
			requirements: { entries: [] },
		});
	});

	it("returns chargesEnabled=false when card_payments is pending", () => {
		const account = {
			configuration: {
				merchant: { capabilities: { card_payments: { status: "pending" } } },
				recipient: { capabilities: {} },
			},
			requirements: { entries: [] },
		} as unknown as Stripe.V2.Core.Account;
		expect(deriveConnectStatusFromV2Account(account).chargesEnabled).toBe(
			false
		);
	});

	it("returns payoutsEnabled=false when recipient stripe_transfers is pending (REVIEWS.md - recipient path)", () => {
		const account = {
			configuration: {
				merchant: { capabilities: { card_payments: { status: "active" } } },
				recipient: {
					capabilities: {
						stripe_balance: { stripe_transfers: { status: "pending" } },
					},
				},
			},
			requirements: { entries: [] },
		} as unknown as Stripe.V2.Core.Account;
		expect(deriveConnectStatusFromV2Account(account).payoutsEnabled).toBe(
			false
		);
	});

	it("returns detailsSubmitted=false when a requirement awaits user action", () => {
		const account = {
			configuration: { merchant: {}, recipient: {} },
			requirements: { entries: [{ awaiting_action_from: "user" }] },
		} as unknown as Stripe.V2.Core.Account;
		expect(deriveConnectStatusFromV2Account(account).detailsSubmitted).toBe(
			false
		);
	});
});
