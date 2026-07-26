import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ConnectContext } from "@/lib/stripeConnect";

// Hoisted mocks --------------------------------------------------------------
const { accountLinksCreateMock } = vi.hoisted(() => ({
	accountLinksCreateMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
	getStripeClient: () => ({
		v2: { core: { accountLinks: { create: accountLinksCreateMock } } },
	}),
}));

const getOrgConnectAccountForCallerMock = vi.fn();
vi.mock("@/lib/stripeConnect", () => ({
	getOrgConnectAccountForCaller: () => getOrgConnectAccountForCallerMock(),
}));

function makeReq(opts: {
	body?: unknown;
	origin?: string | null;
}) {
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	if (opts.origin === undefined) headers["origin"] = "https://example.com";
	else if (opts.origin !== null) headers["origin"] = opts.origin;

	return new Request("https://example.com/api/stripe-connect/account-link", {
		method: "POST",
		headers,
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
	}) as unknown as import("next/server").NextRequest;
}

function ctxWithAccount(accountId: string | null): ConnectContext {
	const userId = "user_owner" as ConnectContext["userId"];
	const orgId = "org_test" as ConnectContext["orgId"];
	return {
		userId,
		orgId,
		stripeConnectAccountId: accountId,
		organization: {
			_id: orgId,
			name: "Acme",
			email: "owner@acme.test",
			addressCountry: "US",
			ownerUserId: userId,
		},
		convexToken: "jwt.token.value",
	};
}

let originalAppUrl: string | undefined;

beforeEach(() => {
	accountLinksCreateMock.mockReset();
	getOrgConnectAccountForCallerMock.mockReset();
	// The route derives the redirect origin from NEXT_PUBLIC_APP_URL, never
	// from the client-controlled Origin header.
	originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
	process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
});

afterEach(() => {
	if (originalAppUrl === undefined) {
		delete process.env.NEXT_PUBLIC_APP_URL;
	} else {
		process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
	}
});

describe("POST /api/stripe-connect/account-link", () => {
	it("returns 400 when the org has no Stripe Connect account yet", async () => {
		getOrgConnectAccountForCallerMock.mockResolvedValue(ctxWithAccount(null));
		const { POST } = await import("../route");
		const res = await POST(makeReq({ body: {} }));
		expect(res.status).toBe(400);
		expect(accountLinksCreateMock).not.toHaveBeenCalled();
	});

	it("forwards collection_options.fields='eventually_due' so onboarding is a single continuous flow", async () => {
		getOrgConnectAccountForCallerMock.mockResolvedValue(
			ctxWithAccount("acct_123")
		);
		accountLinksCreateMock.mockResolvedValue({
			url: "https://connect.stripe.com/setup/s/AcctLinkUrl",
			expires_at: "2026-05-13T10:00:00Z",
		});
		const { POST } = await import("../route");
		const res = await POST(makeReq({ body: {} }));
		expect(res.status).toBe(200);
		expect(accountLinksCreateMock).toHaveBeenCalledTimes(1);
		const [params] = accountLinksCreateMock.mock.calls[0];
		expect(params.use_case.account_onboarding.collection_options).toEqual({
			fields: "eventually_due",
		});
	});

	it("requests both merchant and recipient configurations so capabilities activate in one flow", async () => {
		getOrgConnectAccountForCallerMock.mockResolvedValue(
			ctxWithAccount("acct_123")
		);
		accountLinksCreateMock.mockResolvedValue({
			url: "https://connect.stripe.com/setup/s/AcctLinkUrl",
			expires_at: "2026-05-13T10:00:00Z",
		});
		const { POST } = await import("../route");
		await POST(makeReq({ body: {} }));
		const [params] = accountLinksCreateMock.mock.calls[0];
		expect(params.use_case.account_onboarding.configurations).toEqual([
			"merchant",
			"recipient",
		]);
	});

	it("rejects non-relative returnPath values to prevent open-redirect to attacker domains", async () => {
		getOrgConnectAccountForCallerMock.mockResolvedValue(
			ctxWithAccount("acct_123")
		);
		accountLinksCreateMock.mockResolvedValue({
			url: "https://connect.stripe.com/setup/s/AcctLinkUrl",
			expires_at: "2026-05-13T10:00:00Z",
		});
		const { POST } = await import("../route");
		await POST(
			makeReq({ body: { returnPath: "https://evil.example/steal" } })
		);
		const [params] = accountLinksCreateMock.mock.calls[0];
		expect(params.use_case.account_onboarding.return_url).toBe(
			"https://example.com/organization/profile?tab=payments"
		);
	});

	it("ignores an attacker-controlled Origin header when building return/refresh URLs", async () => {
		getOrgConnectAccountForCallerMock.mockResolvedValue(
			ctxWithAccount("acct_123")
		);
		accountLinksCreateMock.mockResolvedValue({
			url: "https://connect.stripe.com/setup/s/AcctLinkUrl",
			expires_at: "2026-05-13T10:00:00Z",
		});
		const { POST } = await import("../route");
		await POST(makeReq({ body: {}, origin: "https://evil.example" }));
		const [params] = accountLinksCreateMock.mock.calls[0];
		expect(params.use_case.account_onboarding.return_url).toBe(
			"https://example.com/organization/profile?tab=payments"
		);
		expect(params.use_case.account_onboarding.refresh_url).toBe(
			"https://example.com/organization/profile?tab=payments&refresh=1"
		);
	});

	it("passes a fresh idempotency key per request (account links are short-lived ~5min)", async () => {
		getOrgConnectAccountForCallerMock.mockResolvedValue(
			ctxWithAccount("acct_123")
		);
		accountLinksCreateMock.mockResolvedValue({
			url: "https://connect.stripe.com/setup/s/AcctLinkUrl",
			expires_at: "2026-05-13T10:00:00Z",
		});
		const { POST } = await import("../route");
		await POST(makeReq({ body: {} }));
		await POST(makeReq({ body: {} }));
		const firstOpts = accountLinksCreateMock.mock.calls[0]?.[1] as
			| { idempotencyKey?: string }
			| undefined;
		const secondOpts = accountLinksCreateMock.mock.calls[1]?.[1] as
			| { idempotencyKey?: string }
			| undefined;
		expect(firstOpts?.idempotencyKey).toBeTruthy();
		expect(secondOpts?.idempotencyKey).toBeTruthy();
		expect(firstOpts?.idempotencyKey).not.toBe(secondOpts?.idempotencyKey);
	});
});
