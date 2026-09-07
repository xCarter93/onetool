import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConvexError } from "convex/values";

const { fetchActionMock, getConvexTokenForCallerMock } = vi.hoisted(() => ({
	fetchActionMock: vi.fn(),
	getConvexTokenForCallerMock: vi.fn(),
}));

vi.mock("convex/nextjs", () => ({
	fetchAction: fetchActionMock,
	fetchMutation: vi.fn(() => {
		throw new Error("routes must not write Connect state directly");
	}),
	fetchQuery: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/stripeConnect", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/stripeConnect")>()),
	getConvexTokenForCaller: getConvexTokenForCallerMock,
}));

import { api } from "@onetool/backend/convex/_generated/api";
import { POST } from "../route";

describe("POST /api/stripe-connect/status", () => {
	beforeEach(() => {
		fetchActionMock.mockReset();
		getConvexTokenForCallerMock.mockReset();
	});

	it("returns the live status produced by stripeConnectActions.refreshStatus", async () => {
		getConvexTokenForCallerMock.mockResolvedValue("jwt.token.value");
		const status = {
			accountId: "acct_1",
			chargesEnabled: true,
			payoutsEnabled: false,
			detailsSubmitted: true,
			requirements: null,
		};
		fetchActionMock.mockResolvedValue(status);
		const res = await POST();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(status);
		expect(fetchActionMock).toHaveBeenCalledWith(
			api.stripeConnectActions.refreshStatus,
			{},
			{ token: "jwt.token.value" }
		);
	});

	it("returns 400 when the org has no account yet", async () => {
		getConvexTokenForCallerMock.mockResolvedValue("jwt.token.value");
		fetchActionMock.mockRejectedValue(new ConvexError("NOT_ONBOARDED"));
		const res = await POST();
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "Stripe account not yet onboarded",
		});
	});

	it("returns 401 without a session", async () => {
		getConvexTokenForCallerMock.mockRejectedValue(new Error("UNAUTHORIZED"));
		expect((await POST()).status).toBe(401);
		expect(fetchActionMock).not.toHaveBeenCalled();
	});
});
