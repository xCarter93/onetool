import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ConnectContext } from "@/lib/stripeConnect";

const { accountSessionsCreateMock } = vi.hoisted(() => ({
	accountSessionsCreateMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
	getStripeClient: () => ({
		accountSessions: { create: accountSessionsCreateMock },
	}),
}));

const getOrgConnectAccountForCallerMock = vi.fn();
vi.mock("@/lib/stripeConnect", () => ({
	getOrgConnectAccountForCaller: () => getOrgConnectAccountForCallerMock(),
	mapConnectError: (_err: unknown, fallback: string) =>
		Response.json({ error: fallback }, { status: 500 }),
}));

function ctxWithAccount(accountId: string | null): ConnectContext {
	const userId = "user_owner" as ConnectContext["userId"];
	const orgId = "org_test" as ConnectContext["orgId"];
	return {
		userId,
		userEmail: "owner@acme.test",
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

beforeEach(() => {
	accountSessionsCreateMock.mockReset();
	getOrgConnectAccountForCallerMock.mockReset();
});

describe("POST /api/stripe-connect/account-session", () => {
	it("returns 400 when the org has no Stripe Connect account yet", async () => {
		getOrgConnectAccountForCallerMock.mockResolvedValue(ctxWithAccount(null));
		const { POST } = await import("../route");
		const res = await POST();
		expect(res.status).toBe(400);
		expect(accountSessionsCreateMock).not.toHaveBeenCalled();
	});

	it("enables the documents component — required when Stripe collects fees from a dashboard-less account", async () => {
		getOrgConnectAccountForCallerMock.mockResolvedValue(
			ctxWithAccount("acct_123"),
		);
		accountSessionsCreateMock.mockResolvedValue({
			client_secret: "accs_secret_1",
		});
		const { POST } = await import("../route");
		const res = await POST();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ clientSecret: "accs_secret_1" });
		const [params] = accountSessionsCreateMock.mock.calls[0];
		expect(params.account).toBe("acct_123");
		expect(params.components.documents).toEqual({ enabled: true });
		for (const name of [
			"payouts",
			"notification_banner",
			"account_management",
			"disputes_list",
		]) {
			expect(params.components[name].enabled).toBe(true);
		}
	});

	it("uses a fresh idempotency key per request", async () => {
		getOrgConnectAccountForCallerMock.mockResolvedValue(
			ctxWithAccount("acct_123"),
		);
		accountSessionsCreateMock.mockResolvedValue({ client_secret: "s" });
		const { POST } = await import("../route");
		await POST();
		await POST();
		const first = accountSessionsCreateMock.mock.calls[0]?.[1]?.idempotencyKey;
		const second = accountSessionsCreateMock.mock.calls[1]?.[1]?.idempotencyKey;
		expect(first).toBeTruthy();
		expect(first).not.toBe(second);
	});
});
