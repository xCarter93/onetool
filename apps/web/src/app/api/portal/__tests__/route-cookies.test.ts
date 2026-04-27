import { describe, it, expect, beforeAll, vi } from "vitest";
import { generateKeyPair, exportPKCS8, exportJWK, decodeJwt } from "jose";
import { randomUUID } from "crypto";

// Hoisted env values — written by beforeAll, read by the mocked @/env getter.
let pkcs8Pem: string;
let jwksJson: string;
const ISSUER = "https://test.local";

vi.mock("@/env", () => ({
	get env() {
		return {
			PORTAL_JWT_PRIVATE_KEY: pkcs8Pem,
			PORTAL_JWT_JWKS: jwksJson,
			PORTAL_JWT_ISSUER: ISSUER,
			PORTAL_OTP_REQUEST_SECRET: "test-shared-secret-0123456789abcdef",
			NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
		};
	},
}));

// Hoisted cookie mock — overridden per-test by mutating these holders.
let cookieValueHolder: { value: string | null } = { value: null };
let lastSetCookie: { value: string | null } = { value: null };
let cleared = false;

vi.mock("@/lib/portal/cookie", async () => {
	return {
		PORTAL_COOKIE: "portal_session",
		COOKIE_TTL_SECONDS: 60 * 60 * 24,
		COOKIE_REFRESH_THRESHOLD_SECONDS: 60 * 60 * 23,
		readSessionCookie: async () => cookieValueHolder.value,
		setSessionCookieOnRequest: async (jwt: string) => {
			lastSetCookie.value = jwt;
		},
		// Routes now write cookies onto the response object — capture the jwt
		// the same way so existing assertions on lastSetCookie still work.
		setSessionCookieOnResponse: (jwt: string, _response: unknown) => {
			lastSetCookie.value = jwt;
		},
		clearSessionCookieOnRequest: async () => {
			cleared = true;
		},
		clearSessionCookieOnResponse: (_response: unknown) => {
			cleared = true;
		},
	};
});

// Hoisted convex/nextjs mock — capture mutation/action invocations.
let lastTouchedJti: string | null = null;
let lastTouchedExpiresAt: number | null = null;

vi.mock("convex/nextjs", () => ({
	fetchMutation: async (
		_ref: unknown,
		args: { tokenJti?: string; newExpiresAt?: number },
	) => {
		if (args.tokenJti) lastTouchedJti = args.tokenJti;
		if (args.newExpiresAt) lastTouchedExpiresAt = args.newExpiresAt;
		return null;
	},
	fetchAction: async () => null,
	fetchQuery: async () => null,
}));

describe("portal route cookies + jti consistency", () => {
	beforeAll(async () => {
		const { publicKey, privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const pkcs8 = await exportPKCS8(privateKey);
		const jwk = await exportJWK(publicKey);
		jwk.kid = randomUUID();
		jwk.alg = "RS256";
		jwk.use = "sig";
		pkcs8Pem = JSON.stringify(pkcs8);
		jwksJson = JSON.stringify({ keys: [jwk] });
	});

	it("[Review fix #3] /api/portal/refresh preserves jti — new cookie's jti equals original cookie's jti", async () => {
		const { signSessionJwt } = await import("@/lib/portal/jwt");
		const original = await signSessionJwt(
			{ clientContactId: "ct-1", orgId: "org-1", clientPortalId: "abc12345" },
			60 * 60 * 22, // 22h, will trigger refresh
		);

		cookieValueHolder.value = original.token;
		lastSetCookie.value = null;
		lastTouchedJti = null;
		lastTouchedExpiresAt = null;

		const { POST } = await import("@/app/api/portal/refresh/route");
		const res = await POST();
		expect(res.status).toBe(200);

		expect(lastSetCookie.value).not.toBeNull();
		const newPayload = decodeJwt(lastSetCookie.value!);
		// [Review fix #3] jti MUST be preserved
		expect(newPayload.jti).toBe(original.jti);
		// [Review fix #3] touchSession invoked with same jti
		expect(lastTouchedJti).toBe(original.jti);
		expect(lastTouchedExpiresAt).toBeGreaterThan(0);
	});

	it("[Review fix #4] /api/portal/token returns a SHORT-LIVED token with aud=convex-portal-access, NOT the cookie JWT", async () => {
		const { signSessionJwt } = await import("@/lib/portal/jwt");
		const cookie = await signSessionJwt(
			{ clientContactId: "ct-1", orgId: "org-1", clientPortalId: "abc12345" },
			60 * 60 * 24,
		);

		cookieValueHolder.value = cookie.token;

		const { GET } = await import("@/app/api/portal/token/route");
		const res = await GET();
		expect(res.status).toBe(200);
		const body = (await res.json()) as { token: string; expiresAt?: number };

		// [Review fix #4] Returned token MUST be different from the cookie JWT
		expect(body.token).not.toBe(cookie.token);

		// [Review fix #4] The returned token's audience MUST be "convex-portal-access" (NOT "convex-portal")
		const payload = decodeJwt(body.token);
		expect(payload.aud).toBe("convex-portal-access");

		// [Review fix #4] TTL must be ≤ 5 minutes
		const ttl = (payload.exp ?? 0) - (payload.iat ?? 0);
		expect(ttl).toBeLessThanOrEqual(300);

		// [Review fix #4] sessionJti claim must equal the cookie's jti
		expect((payload as Record<string, unknown>).sessionJti).toBe(cookie.jti);
	});
});
