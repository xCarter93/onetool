// Plan 13-01 Wave 0 stub: failing baseline for PORTAL-01 + PORTAL-04 OTP flow.
// Implementations land in Plan 13-03 (backend OTP).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { describe, it, expect } from "vitest";

describe("portal otp", () => {
	it("requestOtp creates a row and schedules an email", () => {
		expect.fail(
			"PORTAL-01: not implemented — implemented by Wave 2 Plan 13-03 (backend OTP request/verify)",
		);
	});

	it("verifyOtp returns session payload on correct code", () => {
		expect.fail(
			"PORTAL-01: not implemented — implemented by Wave 2 Plan 13-03 (backend OTP request/verify)",
		);
	});
});

describe("portal otp attempts", () => {
	it("rejects 6th attempt even with correct code", () => {
		expect.fail(
			"PORTAL-01: not implemented — implemented by Wave 2 Plan 13-03 (attempts counter)",
		);
	});
});

describe("portal otp expired", () => {
	it("returns generic error after 10-minute TTL", () => {
		expect.fail(
			"PORTAL-04: not implemented — implemented by Wave 2 Plan 13-03 (TTL enforcement)",
		);
	});
});
