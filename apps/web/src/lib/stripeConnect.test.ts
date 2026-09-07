import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConvexError } from "convex/values";

vi.mock("@clerk/nextjs/server", () => ({
	auth: vi.fn(),
}));
vi.mock("convex/nextjs", () => ({
	fetchQuery: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import {
	getConvexTokenForCaller,
	getOrgConnectAccountForCaller,
	mapConnectError,
	type ConnectContext,
} from "./stripeConnect";

const mockedAuth = vi.mocked(auth);
const mockedFetchQuery = vi.mocked(fetchQuery);

function buildCtx(overrides: Partial<ConnectContext> = {}): ConnectContext {
	const userId = "user_owner" as ConnectContext["userId"];
	const orgId = "org_test" as ConnectContext["orgId"];
	return {
		userId,
		userEmail: "owner@example.com",
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

describe("getConvexTokenForCaller", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("throws UNAUTHORIZED when Clerk auth() returns userId=null", async () => {
		mockClerkAuth({ userId: null, token: null });
		await expect(getConvexTokenForCaller()).rejects.toThrowError(
			"UNAUTHORIZED"
		);
	});

	it("throws UNAUTHORIZED when the 'convex' JWT template is unconfigured", async () => {
		mockClerkAuth({ userId: "user_owner_clerk", token: null });
		await expect(getConvexTokenForCaller()).rejects.toThrowError(
			"UNAUTHORIZED"
		);
	});

	it("returns the Clerk-issued Convex JWT", async () => {
		mockClerkAuth({ userId: "user_owner_clerk", token: "jwt.token.value" });
		await expect(getConvexTokenForCaller()).resolves.toBe("jwt.token.value");
	});
});

describe("getOrgConnectAccountForCaller", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does not query Convex without a session", async () => {
		mockClerkAuth({ userId: null, token: null });
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
		// Args must stay `{}`: identity is session-derived, never client input.
		expect(mockedFetchQuery.mock.calls[0]?.[1]).toEqual({});
		const callOpts = mockedFetchQuery.mock.calls[0]?.[2] as
			| { token?: string }
			| undefined;
		expect(callOpts?.token).toBe("jwt.token.value");
	});

	it("re-checks ownership on the returned context", async () => {
		mockClerkAuth({ userId: "user_owner_clerk", token: "jwt.token.value" });
		const { convexToken: _omit, ...ctx } = buildCtx({
			userId: "user_member" as ConnectContext["userId"],
		});
		mockedFetchQuery.mockResolvedValue(ctx);
		await expect(getOrgConnectAccountForCaller()).rejects.toThrowError(
			"NOT_ORG_OWNER"
		);
	});
});

describe("mapConnectError", () => {
	it("maps ConvexError codes from stripeConnectActions by their data, not their message", async () => {
		const cases: Array<[string, number]> = [
			["UNAUTHORIZED", 401],
			["ORG_NOT_FOUND", 401],
			["NOT_ORG_OWNER", 403],
			["NOT_ONBOARDED", 400],
			["US_ONLY", 400],
			["ORG_HAS_NO_EMAIL", 400],
			["DUPLICATE_CONNECT_ACCOUNT", 409],
			["ACCOUNT_ORG_MISMATCH", 409],
		];
		for (const [code, status] of cases) {
			const err = new ConvexError(code);
			err.message = `Uncaught ConvexError: ${code}`;
			const res = mapConnectError(err, "fallback");
			expect(res.status, code).toBe(status);
		}
	});

	it("keeps the onboarding-facing messages the Payments tab shows", async () => {
		const notOnboarded = await mapConnectError(
			new ConvexError("NOT_ONBOARDED"),
			"fallback"
		).json();
		expect(notOnboarded.error).toBe("Stripe account not yet onboarded");
		const usOnly = await mapConnectError(
			new ConvexError("US_ONLY"),
			"fallback"
		).json();
		expect(usOnly.error).toMatch(/US-only/);
	});

	it("maps route-local plain errors by message", () => {
		expect(mapConnectError(new Error("UNAUTHORIZED"), "fallback").status).toBe(
			401
		);
	});

	it("collapses unknown errors to the fallback without echoing the message", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const res = mapConnectError(
			new Error("Stripe: No such account req_123"),
			"Failed to fetch account status"
		);
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({
			error: "Failed to fetch account status",
		});
		spy.mockRestore();
	});
});
