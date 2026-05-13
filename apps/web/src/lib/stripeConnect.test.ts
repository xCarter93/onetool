// Plan 14.2-02 Task 2 — lockdown helper tests.
import { describe, it, expect, vi, beforeEach } from "vitest";

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
		...overrides,
	};
}

describe("getOrgConnectAccountForCaller", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("throws UNAUTHORIZED when Clerk auth() returns userId=null", async () => {
		// @ts-expect-error — Clerk's auth() return shape is a Promise<Auth>, mock is partial
		mockedAuth.mockResolvedValue({ userId: null });
		await expect(getOrgConnectAccountForCaller()).rejects.toThrowError(
			"UNAUTHORIZED"
		);
		expect(mockedFetchQuery).not.toHaveBeenCalled();
	});

	it("returns the ConnectContext when fetchQuery resolves", async () => {
		// @ts-expect-error — partial Clerk Auth mock
		mockedAuth.mockResolvedValue({ userId: "user_owner_clerk" });
		const ctx = buildCtx({ stripeConnectAccountId: "acct_existing" });
		mockedFetchQuery.mockResolvedValue(ctx);

		const result = await getOrgConnectAccountForCaller();
		expect(result).toEqual(ctx);
		expect(mockedFetchQuery).toHaveBeenCalledTimes(1);
		// Verify the public api.* reference is passed (FINDINGS V-1 pivot).
		// fetchQuery's first arg is a FunctionReference proxy — we can't compare
		// equality, but we can assert no client-provided account-identifying
		// field appears in the args object (regression-guard against future
		// signature drift).
		const callArgs = mockedFetchQuery.mock.calls[0]?.[1] as Record<
			string,
			unknown
		>;
		expect(callArgs).toEqual({});
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
