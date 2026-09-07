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

const status = {
	accountId: "acct_1",
	chargesEnabled: true,
	payoutsEnabled: false,
	detailsSubmitted: true,
	requirements: { currently_due: [], entries: [] },
};

describe("POST /api/stripe-connect/account", () => {
	beforeEach(() => {
		fetchActionMock.mockReset();
		getConvexTokenForCallerMock.mockReset();
	});

	it("delegates to stripeConnectActions.ensureAccount with the caller's token and no client input", async () => {
		getConvexTokenForCallerMock.mockResolvedValue("jwt.token.value");
		fetchActionMock.mockResolvedValue(status);
		const res = await POST();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(status);
		expect(fetchActionMock).toHaveBeenCalledWith(
			api.stripeConnectActions.ensureAccount,
			{},
			{ token: "jwt.token.value" }
		);
	});

	it("returns 401 without a session and never calls Convex", async () => {
		getConvexTokenForCallerMock.mockRejectedValue(new Error("UNAUTHORIZED"));
		const res = await POST();
		expect(res.status).toBe(401);
		expect(fetchActionMock).not.toHaveBeenCalled();
	});

	it("maps action error codes to HTTP statuses", async () => {
		getConvexTokenForCallerMock.mockResolvedValue("jwt.token.value");
		fetchActionMock.mockRejectedValue(new ConvexError("NOT_ORG_OWNER"));
		expect((await POST()).status).toBe(403);
		fetchActionMock.mockRejectedValue(new ConvexError("US_ONLY"));
		expect((await POST()).status).toBe(400);
	});
});
