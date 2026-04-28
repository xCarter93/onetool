import { describe, it, expect, beforeAll, vi } from "vitest";
import { generateKeyPair, exportPKCS8, exportJWK, decodeJwt } from "jose";
import { randomUUID } from "crypto";

// Generate a real RS256 keypair once for the entire suite. Stash JSON-stringified
// values on globalThis so the mocked `@/env` module can read them after hoisting.
let pkcs8Pem: string;
let jwksJson: string;
const ISSUER = "https://test.local";

vi.mock("@/env", () => {
	return {
		get env() {
			return {
				PORTAL_JWT_PRIVATE_KEY: pkcs8Pem,
				PORTAL_JWT_JWKS: jwksJson,
				PORTAL_JWT_ISSUER: ISSUER,
			};
		},
	};
});

describe("portal jwt", () => {
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

	it("signs RS256 JWT with sub=clientContactId, orgId, clientPortalId, iss, aud, 24h exp", async () => {
		const { signSessionJwt } = await import("./jwt");
		const { token, jti, expiresAt } = await signSessionJwt(
			{
				clientContactId: "ct-123",
				orgId: "org-456",
				clientPortalId: "abc",
			},
			86400,
		);
		expect(token).toBeTruthy();
		expect(jti.length).toBeGreaterThan(0);
		expect(expiresAt).toBeGreaterThan(Date.now());

		const payload = decodeJwt(token);
		expect(payload.sub).toBe("ct-123");
		expect((payload as Record<string, unknown>).orgId).toBe("org-456");
		expect((payload as Record<string, unknown>).clientContactId).toBe(
			"ct-123",
		);
		expect((payload as Record<string, unknown>).clientPortalId).toBe("abc");
		expect(payload.jti).toBeTruthy();
		expect(payload.iss).toBe(ISSUER);
		expect(payload.aud).toBe("convex-portal");
		expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(86400);
	});

	it("verifies a freshly signed JWT against the local JWKS", async () => {
		const { signSessionJwt, verifySessionJwt } = await import("./jwt");
		const { token } = await signSessionJwt(
			{
				clientContactId: "ct-1",
				orgId: "org-456",
				clientPortalId: "abc",
			},
			86400,
		);
		const { payload, remainingSeconds } = await verifySessionJwt(token);
		expect((payload as Record<string, unknown>).orgId).toBe("org-456");
		expect(remainingSeconds).toBeGreaterThan(86000);
	});

	it("signConvexAccessToken issues a 5min token with aud=convex-portal-access and sessionJti claim [Review fix #4]", async () => {
		const { signConvexAccessToken } = await import("./jwt");
		const { token, expiresAt } = await signConvexAccessToken({
			clientContactId: "ct-1",
			orgId: "org-1",
			clientPortalId: "abc",
			sessionJti: "jti-XYZ",
		});
		expect(token).toBeTruthy();
		expect(expiresAt).toBeGreaterThan(Date.now());

		const payload = decodeJwt(token);
		expect(payload.aud).toBe("convex-portal-access");
		expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(300);
		expect((payload as Record<string, unknown>).sessionJti).toBe("jti-XYZ");
		expect((payload as Record<string, unknown>).orgId).toBe("org-1");
		expect((payload as Record<string, unknown>).clientContactId).toBe("ct-1");
	});

	it("getJwksJson returns the configured public JWKS", async () => {
		const { getJwksJson } = await import("./jwt");
		const json = getJwksJson();
		const parsed = JSON.parse(json);
		expect(parsed.keys).toBeInstanceOf(Array);
		expect(parsed.keys.length).toBe(1);
		expect(parsed.keys[0].kty).toBe("RSA");
	});
});
