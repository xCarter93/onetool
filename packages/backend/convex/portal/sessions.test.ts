// Plan 13-01 Wave 0 stub: failing baseline for PORTAL-03 session helpers and
// PORTAL-04 rate-limit guards. Implementations land in Plan 13-02 (backend
// foundation: session helper) and Plan 13-03 (backend OTP: rate limits).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { describe, it, expect } from "vitest";

describe("portal sessions", () => {
	it("getPortalSessionOrThrow returns orgId+clientContactId from auth identity", () => {
		expect.fail(
			"PORTAL-03: not implemented — implemented by Wave 1 Plan 13-02 (getPortalSessionOrThrow helper)",
		);
	});

	it("throws when identity issuer is not PORTAL_JWT_ISSUER", () => {
		expect.fail(
			"PORTAL-03: not implemented — implemented by Wave 1 Plan 13-02 (issuer validation in session helper)",
		);
	});
});

describe("portal rate limit send", () => {
	it("throws after 3 sends in 60 minutes for the same email", () => {
		expect.fail(
			"PORTAL-04: not implemented — implemented by Wave 2 Plan 13-03 (rate limit on requestOtp)",
		);
	});
});

describe("portal rate limit verify", () => {
	it("blocks 6th verify attempt before checking the code", () => {
		expect.fail(
			"PORTAL-04: not implemented — implemented by Wave 2 Plan 13-03 (rate limit on verifyOtp)",
		);
	});
});
