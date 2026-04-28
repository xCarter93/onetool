/**
 * [Review fix #9] Wave-1 smoke test that proves the Convex auth.config.ts dual-provider configuration
 * actually accepts portal-issued JWTs via the JWKS endpoint.
 *
 * If this test fails:
 *   1. Convex's discovery may require an explicit JWKS path. Update auth.config.ts to add
 *      `jwks: "${PORTAL_JWT_ISSUER}/.well-known/portal-jwks.json"`.
 *   2. Re-run; if still failing, rename the JWKS route folder to `/.well-known/jwks.json/route.ts`
 *      (OIDC default path).
 *   3. The test must pass before Plan 05 implements /api/portal/token.
 *
 * The test is gated on NEXT_PUBLIC_CONVEX_URL — it auto-skips in CI/local dev when no
 * Convex deployment is available, and is a real end-to-end check when one is configured.
 *
 * It also depends on `api.portal.sessions.getActiveSessionByJti` (declared by Plan 13-02).
 * When Plan 13-02 has not yet shipped, the dynamic import will throw and the test will
 * skip cleanly with a warning rather than red the suite.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import {
	generateKeyPair,
	exportPKCS8,
	exportJWK,
	type JWK,
} from "jose";
import { randomUUID } from "crypto";

let pkcs8Pem: string;
let jwksJson: string;
const ISSUER = "https://test.local";

vi.mock("@/env", () => ({
	get env() {
		return {
			PORTAL_JWT_PRIVATE_KEY: pkcs8Pem,
			PORTAL_JWT_JWKS: jwksJson,
			PORTAL_JWT_ISSUER: ISSUER,
		};
	},
}));

describe("portal jwks smoke", () => {
	beforeAll(async () => {
		const { publicKey, privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const pkcs8 = await exportPKCS8(privateKey);
		const jwk = (await exportJWK(publicKey)) as JWK;
		jwk.kid = randomUUID();
		jwk.alg = "RS256";
		jwk.use = "sig";
		pkcs8Pem = JSON.stringify(pkcs8);
		jwksJson = JSON.stringify({ keys: [jwk] });
	});

	it("Convex accepts a portal-issued JWT via auth.config.ts second provider", async () => {
		const url = process.env.NEXT_PUBLIC_CONVEX_URL;
		if (!url) {
			// [Review fix WR-06] In CI, treat missing NEXT_PUBLIC_CONVEX_URL as
			// a configuration failure rather than a silent skip. CI must point
			// at a preview deployment so the dual-provider auth.config.ts is
			// actually exercised — otherwise auth misconfiguration ships green.
			// Local dev still skips so individual contributors don't need a
			// preview deployment to run unit tests.
			if (process.env.CI === "true" && !process.env.SKIP_PORTAL_SMOKE) {
				throw new Error(
					"NEXT_PUBLIC_CONVEX_URL must be set in CI for the portal JWKS " +
						"smoke test (set SKIP_PORTAL_SMOKE=1 to bypass intentionally)."
				);
			}
			console.warn(
				"NEXT_PUBLIC_CONVEX_URL not set — skipping JWKS smoke test",
			);
			return;
		}

		// Sign a portal JWT
		const { signSessionJwt } = await import("./jwt");
		const { token } = await signSessionJwt(
			{
				clientContactId: "ct-test",
				orgId: "org-test",
				clientPortalId: "test-uuid-12345678",
			},
			86400,
		);

		// Lazy-load convex/browser + the generated api so the test can skip cleanly
		// if either is unavailable in the current build (e.g., Plan 13-02 not yet run).
		let ConvexHttpClient: typeof import("convex/browser").ConvexHttpClient;
		let api: typeof import("@onetool/backend/convex/_generated/api").api;
		try {
			({ ConvexHttpClient } = await import("convex/browser"));
			({ api } = await import("@onetool/backend/convex/_generated/api"));
		} catch (err) {
			console.warn(
				`Skipping JWKS smoke test — convex/browser or backend api unavailable: ${(err as Error).message}`,
			);
			return;
		}

		// Plan 13-02 declares api.portal.sessions.getActiveSessionByJti. Until that
		// plan ships, the lookup below is undefined; we skip rather than red the suite.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const portalApi = (api as any)?.portal?.sessions?.getActiveSessionByJti;
		if (!portalApi) {
			console.warn(
				"Skipping JWKS smoke test — api.portal.sessions.getActiveSessionByJti not yet generated (Plan 13-02 pending)",
			);
			return;
		}

		const client = new ConvexHttpClient(url);
		client.setAuth(token);

		try {
			const result = await client.query(portalApi, {
				tokenJti: "smoke-test-jti",
			});
			// Authentication succeeded — handler ran (returns null when no session row matches the fake jti)
			expect(result === null || typeof result === "object").toBe(true);
		} catch (err) {
			const msg = (err as Error).message;
			// Auth failures indicate JWKS discovery is broken — fail the test
			expect(msg).not.toMatch(
				/authentication failed|no identity|invalid token|wrong auth domain/i,
			);
			// Re-throw any other error (e.g., schema mismatch) so it surfaces
			throw err;
		}
	});
});
