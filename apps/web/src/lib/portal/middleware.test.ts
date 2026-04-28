import { describe, it, expect, beforeAll, vi } from "vitest";
import { generateKeyPair, exportPKCS8, exportJWK, decodeJwt } from "jose";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

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

async function buildRequest(
	pathname: string,
	cookieValue?: string,
): Promise<import("next/server").NextRequest> {
	const { NextRequest } = await import("next/server");
	const url = `${ISSUER}${pathname}`;
	const headers = new Headers();
	if (cookieValue) headers.set("cookie", `portal_session=${cookieValue}`);
	return new NextRequest(url, { headers });
}

describe("portal middleware refresh", () => {
	it("reissues cookie when remaining lifetime < 23h", async () => {
		const { signSessionJwt } = await import("./jwt");
		const { portalMiddleware } = await import("./middleware");
		const { token } = await signSessionJwt(
			{
				clientContactId: "ct-1",
				orgId: "org-1",
				clientPortalId: "abcd1234",
			},
			60 * 60 * 22, // 22h — below 23h threshold
		);
		const req = await buildRequest("/portal/c/abcd1234/quotes", token);
		const response = await portalMiddleware(req);
		const setCookie = response.cookies.get("portal_session");
		expect(setCookie).toBeTruthy();
		expect(setCookie?.value).toBeTruthy();
		expect(setCookie?.value).not.toBe(token); // a new token was issued
		const payload = decodeJwt(setCookie!.value!);
		const now = Math.floor(Date.now() / 1000);
		expect((payload.exp ?? 0) - now).toBeGreaterThan(86000);
		expect((payload.exp ?? 0) - now).toBeLessThanOrEqual(86400);
	});

	it("does NOT reissue when remaining lifetime > 23h", async () => {
		const { signSessionJwt } = await import("./jwt");
		const { portalMiddleware } = await import("./middleware");
		const { token } = await signSessionJwt(
			{
				clientContactId: "ct-1",
				orgId: "org-1",
				clientPortalId: "abcd1234",
			},
			60 * 60 * 24, // 24h — above threshold
		);
		const req = await buildRequest("/portal/c/abcd1234/quotes", token);
		const response = await portalMiddleware(req);
		const setCookie = response.cookies.get("portal_session");
		expect(setCookie).toBeUndefined();
	});

	it("preserves jti across sliding refresh — original cookie jti must equal new cookie jti [Review fix #3]", async () => {
		const { signSessionJwt } = await import("./jwt");
		const { portalMiddleware } = await import("./middleware");
		const { token } = await signSessionJwt(
			{
				clientContactId: "ct-1",
				orgId: "org-1",
				clientPortalId: "abcd1234",
				jti: "preserved-jti-XYZ",
			},
			60 * 60 * 22,
		);
		const req = await buildRequest("/portal/c/abcd1234/quotes", token);
		const response = await portalMiddleware(req);
		const setCookie = response.cookies.get("portal_session");
		expect(setCookie).toBeTruthy();
		const payload = decodeJwt(setCookie!.value!);
		expect(payload.jti).toBe("preserved-jti-XYZ");
		// [Review fix Greptile-P2] x-portal-touch-* headers were removed —
		// they leaked the jti to the browser and had no consumer. Assert
		// they're NOT present.
		expect(response.headers.get("x-portal-touch-jti")).toBeNull();
		expect(response.headers.get("x-portal-touch-expires")).toBeNull();
	});

	it("redirects to /portal/c/{id}/verify when no cookie present", async () => {
		const { portalMiddleware } = await import("./middleware");
		const req = await buildRequest("/portal/c/abcd1234/quotes");
		const response = await portalMiddleware(req);
		expect(response.status).toBe(307);
		const location = response.headers.get("location");
		expect(location).toContain("/portal/c/abcd1234/verify");
		expect(location).toContain("next=%2Fportal%2Fc%2Fabcd1234%2Fquotes");
	});

	it("redirects to /portal/expired when path lacks /portal/c/{id}", async () => {
		const { portalMiddleware } = await import("./middleware");
		const req = await buildRequest("/portal/orphan-path");
		const response = await portalMiddleware(req);
		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toContain("/portal/expired");
	});
});

describe("portal middleware isolation", () => {
	it("Clerk middleware delegates to portalMiddleware for /portal and /api/portal routes", () => {
		const middlewarePath = resolve(__dirname, "../../middleware.ts");
		const src = readFileSync(middlewarePath, "utf8");
		expect(src).toContain("if (isPortalRoute(request))");
		expect(src).toContain("return portalMiddleware(request)");
		// [Review fix Greptile-P1] Matchers must be slash-anchored so future
		// `/portal-*` routes fall through to Clerk instead of silently entering
		// portal auth. Assert the stricter patterns AND the absence of the old
		// broad `/portal(.*)` form.
		expect(src).toContain('"/portal"');
		expect(src).toContain('"/portal/(.*)"');
		expect(src).toContain('"/api/portal/(.*)"');
		expect(src).not.toMatch(/"\/portal\(\.\*\)"/);
		expect(src).not.toMatch(/"\/api\/portal\(\.\*\)"/);
	});

	it("portal dispatch happens BEFORE clerkMiddleware is invoked [Review fix #13]", () => {
		const middlewarePath = resolve(__dirname, "../../middleware.ts");
		const src = readFileSync(middlewarePath, "utf8");
		expect(src).toMatch(/export default async function middleware/);
		expect(src).not.toMatch(/export default clerkMiddleware/);
		const dispatcherIdx = src.indexOf(
			"export default async function middleware",
		);
		const portalCheckIdx = src.indexOf(
			"if (isPortalRoute(request))",
			dispatcherIdx,
		);
		const clerkInvocationIdx = src.indexOf(
			"clerkHandler(request",
			dispatcherIdx,
		);
		expect(portalCheckIdx).toBeGreaterThan(dispatcherIdx);
		expect(clerkInvocationIdx).toBeGreaterThan(portalCheckIdx);
	});

	it("rejects /portal/c/abc/verify-something as a public path — strict regex prevents endsWith bypass [Review fix #14]", async () => {
		const { isPublicPortalPath } = await import("./middleware");
		expect(isPublicPortalPath("/portal/c/abcd1234/verify-evil")).toBe(false);
		expect(isPublicPortalPath("/portal/c/abcd1234/verify")).toBe(true);
		expect(isPublicPortalPath("/portal/c/abcd1234/x/verify")).toBe(false);
		expect(isPublicPortalPath("/portal/c/abcd1234/signed-out")).toBe(true);
		expect(isPublicPortalPath("/portal/expired")).toBe(true);
		expect(isPublicPortalPath("/.well-known/portal-jwks.json")).toBe(true);
		expect(isPublicPortalPath("/portal/c/abcd1234/quotes")).toBe(false);
	});
});
