import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * PUB-01 regression (PRD-public-surface-security).
 *
 * The checkout route caches a Stripe Checkout Session URL/id on the payment
 * record so a within-window retry reuses it instead of minting a duplicate.
 * That cache is written via a public mutation, so it can't be trusted blindly:
 * the route must re-`retrieve` the session scoped to the org's OWN connected
 * account (a foreign-account session 404s) and only reuse it when status,
 * amount, and metadata (flow + publicToken) all bind it to this pay link.
 * These tests pin each rejection path plus the happy reuse path.
 */

const { mockQuery, mockMutation, mockRetrieve, mockCreate } = vi.hoisted(() => ({
	mockQuery: vi.fn(),
	mockMutation: vi.fn(),
	mockRetrieve: vi.fn(),
	mockCreate: vi.fn(),
}));

vi.mock("@/env", () => ({
	get env() {
		return {
			STRIPE_APPLICATION_FEE_CENTS: 100,
			NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
		};
	},
}));

vi.mock("@/lib/convexClient", () => ({
	getConvexClient: () => ({ query: mockQuery, mutation: mockMutation }),
}));

vi.mock("@/lib/stripe", () => ({
	getStripeClient: () => ({
		checkout: {
			sessions: {
				retrieve: mockRetrieve,
				create: mockCreate,
			},
		},
	}),
}));

import { POST } from "./route";

const APP_ORIGIN = "https://app.onetool.test";
const CHECKOUT_URL = `${APP_ORIGIN}/api/pay/checkout`;
const PUBLIC_TOKEN = "pay-tok-abc123";
const ACCOUNT_ID = "acct_org_owned";
const AMOUNT_DOLLARS = 42.5;
const AMOUNT_CENTS = 4250;
const CACHED_SESSION_ID = "cs_cached_session";
const CACHED_URL = "https://checkout.stripe.com/c/cached";
const FRESH_URL = "https://checkout.stripe.com/c/fresh";

function buildPaymentData(overrides: Record<string, unknown> = {}) {
	return {
		payment: {
			_id: "payment_1",
			publicToken: PUBLIC_TOKEN,
			status: "pending",
			paymentAmount: AMOUNT_DOLLARS,
			description: "Deposit",
			checkoutAttemptCounter: 0,
			pendingCheckoutSessionId: CACHED_SESSION_ID,
			pendingCheckoutSessionUrl: CACHED_URL,
			// Far enough out that it clears the REUSE_BUFFER_MS window.
			pendingCheckoutSessionExpiresAt: Date.now() + 10 * 60 * 1000,
			...overrides,
		},
		invoice: {
			_id: "invoice_1",
			invoiceNumber: "INV-001",
			total: AMOUNT_DOLLARS,
			status: "sent",
		},
		org: { name: "Acme Cleaning", stripeConnectAccountId: ACCOUNT_ID },
		paymentContext: { paymentNumber: 1, totalPayments: 1 },
	};
}

function buildRequest() {
	return new NextRequest(CHECKOUT_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ token: PUBLIC_TOKEN }),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	process.env.NEXT_PUBLIC_APP_URL = APP_ORIGIN;
	mockMutation.mockResolvedValue({ ok: true });
	mockCreate.mockResolvedValue({
		id: "cs_fresh_session",
		url: FRESH_URL,
		expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
	});
});

describe("POST /api/pay/checkout — session reuse (PUB-01)", () => {
	it("mints a fresh session when retrieve throws (cache poisoned by a foreign account)", async () => {
		mockQuery.mockResolvedValue(buildPaymentData());
		mockRetrieve.mockRejectedValue(new Error("No such checkout session"));

		const res = await POST(buildRequest());
		const json = await res.json();

		expect(mockCreate).toHaveBeenCalled();
		expect(json.url).toBe(FRESH_URL);
	});

	it("mints a fresh session when metadata.publicToken does not match this payment", async () => {
		mockQuery.mockResolvedValue(buildPaymentData());
		mockRetrieve.mockResolvedValue({
			status: "open",
			url: CACHED_URL,
			amount_total: AMOUNT_CENTS,
			metadata: { flow: "payment", publicToken: "some-other-payments-token" },
		});

		const res = await POST(buildRequest());
		const json = await res.json();

		expect(mockCreate).toHaveBeenCalled();
		expect(json.url).toBe(FRESH_URL);
	});

	it("mints a fresh session when metadata.flow is not 'payment'", async () => {
		mockQuery.mockResolvedValue(buildPaymentData());
		mockRetrieve.mockResolvedValue({
			status: "open",
			url: CACHED_URL,
			amount_total: AMOUNT_CENTS,
			metadata: { flow: "invoice", publicToken: PUBLIC_TOKEN },
		});

		const res = await POST(buildRequest());
		const json = await res.json();

		expect(mockCreate).toHaveBeenCalled();
		expect(json.url).toBe(FRESH_URL);
	});

	it("mints a fresh session when amount_total no longer matches the payment amount", async () => {
		mockQuery.mockResolvedValue(buildPaymentData());
		mockRetrieve.mockResolvedValue({
			status: "open",
			url: CACHED_URL,
			amount_total: AMOUNT_CENTS + 1,
			metadata: { flow: "payment", publicToken: PUBLIC_TOKEN },
		});

		const res = await POST(buildRequest());
		const json = await res.json();

		expect(mockCreate).toHaveBeenCalled();
		expect(json.url).toBe(FRESH_URL);
	});

	it("reuses the cached URL when status/url/amount/metadata all bind it to this pay link", async () => {
		mockQuery.mockResolvedValue(buildPaymentData());
		mockRetrieve.mockResolvedValue({
			status: "open",
			url: CACHED_URL,
			amount_total: AMOUNT_CENTS,
			metadata: { flow: "payment", publicToken: PUBLIC_TOKEN },
		});

		const res = await POST(buildRequest());
		const json = await res.json();

		expect(json.url).toBe(CACHED_URL);
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("scopes the retrieve call to this org's own connected account", async () => {
		mockQuery.mockResolvedValue(buildPaymentData());
		mockRetrieve.mockResolvedValue({
			status: "open",
			url: CACHED_URL,
			amount_total: AMOUNT_CENTS,
			metadata: { flow: "payment", publicToken: PUBLIC_TOKEN },
		});

		await POST(buildRequest());

		expect(mockRetrieve).toHaveBeenCalledWith(CACHED_SESSION_ID, undefined, {
			stripeAccount: ACCOUNT_ID,
		});
	});
});
