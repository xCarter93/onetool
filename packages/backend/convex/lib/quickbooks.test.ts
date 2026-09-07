import { describe, it, expect, afterEach, vi } from "vitest";
import { refreshTokens } from "./quickbooks";

function stubTokenEndpoint(payload: Record<string, unknown>) {
	const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => ({
		ok: true,
		status: 200,
		headers: { get: () => null },
		json: async () => payload,
		text: async () => JSON.stringify(payload),
	}));
	vi.stubGlobal("fetch", fetchMock);
	vi.stubEnv("QUICKBOOKS_CLIENT_ID", "cid");
	vi.stubEnv("QUICKBOOKS_CLIENT_SECRET", "secret");
	return fetchMock;
}

describe("Intuit token responses", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.useRealTimers();
	});

	it("opts into and persists the hard refresh expiry when Intuit returns it", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_700_000_000_000);
		const fetchMock = stubTokenEndpoint({
			access_token: "a",
			refresh_token: "r",
			expires_in: 3600,
			x_refresh_token_expires_in: 8_726_400,
			x_refresh_token_hard_expires_in: 157_680_000,
		});

		const tokens = await refreshTokens("r0");

		const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
		expect(headers["x-include-refresh-token-hard-expires-in"]).toBe("true");
		expect(tokens.refreshTokenExpiresAt).toBe(
			1_700_000_000_000 + 8_726_400 * 1000
		);
		expect(tokens.refreshTokenHardExpiresAt).toBe(
			1_700_000_000_000 + 157_680_000 * 1000
		);
	});

	it("leaves the hard expiry absent when Intuit omits it", async () => {
		stubTokenEndpoint({
			access_token: "a",
			refresh_token: "r",
			expires_in: 3600,
			x_refresh_token_expires_in: 8_726_400,
		});
		const tokens = await refreshTokens("r0");
		expect(tokens.refreshTokenHardExpiresAt).toBeUndefined();
	});
});
