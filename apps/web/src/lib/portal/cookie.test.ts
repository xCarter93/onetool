import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const cookieStoreSet = vi.fn();
const cookieStoreGet = vi.fn();

vi.mock("next/headers", () => ({
	cookies: async () => ({
		set: cookieStoreSet,
		get: cookieStoreGet,
	}),
}));

describe("portal cookie", () => {
	beforeEach(() => {
		cookieStoreSet.mockReset();
		cookieStoreGet.mockReset();
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("sets httpOnly=true, secure in prod, sameSite=lax, path=/, maxAge=86400", async () => {
		// Default test env: NODE_ENV !== production -> secure=false
		const { setSessionCookieOnRequest, PORTAL_COOKIE } = await import(
			"./cookie"
		);
		await setSessionCookieOnRequest("test-jwt");
		expect(cookieStoreSet).toHaveBeenCalledTimes(1);
		expect(cookieStoreSet).toHaveBeenCalledWith(PORTAL_COOKIE, "test-jwt", {
			httpOnly: true,
			secure: false,
			sameSite: "lax",
			path: "/",
			maxAge: 60 * 60 * 24,
		});

		// Now flip NODE_ENV to production -> secure=true
		cookieStoreSet.mockReset();
		vi.stubEnv("NODE_ENV", "production");
		await setSessionCookieOnRequest("prod-jwt");
		expect(cookieStoreSet).toHaveBeenCalledWith(PORTAL_COOKIE, "prod-jwt", {
			httpOnly: true,
			secure: true,
			sameSite: "lax",
			path: "/",
			maxAge: 60 * 60 * 24,
		});
	});

	it("clear deletes by setting maxAge=0 on / path", async () => {
		const { clearSessionCookieOnRequest, PORTAL_COOKIE } = await import(
			"./cookie"
		);
		await clearSessionCookieOnRequest();
		expect(cookieStoreSet).toHaveBeenCalledWith(
			PORTAL_COOKIE,
			"",
			expect.objectContaining({
				maxAge: 0,
				path: "/",
				httpOnly: true,
				sameSite: "lax",
			}),
		);
	});

	it("readSessionCookie returns null when cookie missing", async () => {
		cookieStoreGet.mockReturnValue(undefined);
		const { readSessionCookie } = await import("./cookie");
		expect(await readSessionCookie()).toBeNull();
	});

	it("readSessionCookie returns the value when cookie exists", async () => {
		cookieStoreGet.mockReturnValue({ value: "session-token-xyz" });
		const { readSessionCookie } = await import("./cookie");
		expect(await readSessionCookie()).toBe("session-token-xyz");
	});

	it("setSessionCookieOnResponse writes to response.cookies with same attrs", async () => {
		const { setSessionCookieOnResponse, PORTAL_COOKIE } = await import(
			"./cookie"
		);
		const set = vi.fn();
		const fakeResponse = { cookies: { set } } as unknown as Parameters<
			typeof setSessionCookieOnResponse
		>[1];
		setSessionCookieOnResponse("token-abc", fakeResponse);
		expect(set).toHaveBeenCalledWith(
			PORTAL_COOKIE,
			"token-abc",
			expect.objectContaining({
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				maxAge: 60 * 60 * 24,
			}),
		);
	});
});
