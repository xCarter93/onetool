import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// The route transitively imports @/env (validated at import time). Stub it so
// the module loads in the test runtime; the origin guard never reads env.
vi.mock("@/env", () => ({
	get env() {
		return {
			PORTAL_JWT_PRIVATE_KEY: "",
			PORTAL_JWT_JWKS: "",
			PORTAL_JWT_ISSUER: "https://test.local",
			PORTAL_OTP_REQUEST_SECRET: "test-shared-secret-0123456789abcdef",
			NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
		};
	},
}));

import { POST } from "./route";

/**
 * PUB-02 regression (PRD-public-surface-security §4.2).
 *
 * /api/portal/otp/verify is the one portal route that mints a session and sets
 * the portal_session cookie, and it was the only sibling missing the
 * isSameOrigin guard — a login-CSRF / session-fixation hole. These tests pin
 * that a cross-site POST is rejected with 403 and sets no cookie, and that the
 * guard fails closed when no origin signal is present, while a same-origin
 * request is allowed past the guard.
 */
const APP_ORIGIN = "https://app.onetool.test";
const VERIFY_URL = `${APP_ORIGIN}/api/portal/otp/verify`;

function buildRequest(headers: Record<string, string>, body: unknown) {
	return new NextRequest(VERIFY_URL, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

const VALID_BODY = {
	clientPortalId: "portal-123",
	email: "client@example.com",
	code: "123456",
};

describe("POST /api/portal/otp/verify — origin guard (PUB-02)", () => {
	it("rejects a cross-site Origin with 403 and sets no cookie", async () => {
		const req = buildRequest({ origin: "https://evil.example" }, VALID_BODY);
		const res = await POST(req);

		expect(res.status).toBe(403);
		expect(res.headers.get("set-cookie")).toBeNull();
		const json = await res.json();
		expect(json.code).toBe("INVALID_ORIGIN");
	});

	it("fails closed with 403 when neither Origin nor Referer is present", async () => {
		const req = buildRequest({}, VALID_BODY);
		const res = await POST(req);

		expect(res.status).toBe(403);
		expect(res.headers.get("set-cookie")).toBeNull();
	});

	it("allows a same-origin request past the guard (bad body → 400, not 403)", async () => {
		// Empty body fails schema validation, returning 400 BEFORE any Convex
		// call — which proves the origin guard did NOT block a same-origin POST.
		const req = buildRequest({ origin: APP_ORIGIN }, {});
		const res = await POST(req);

		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.code).toBe("INVALID_REQUEST");
	});
});
