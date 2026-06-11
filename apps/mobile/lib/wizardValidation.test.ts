import { describe, expect, it } from "vitest";
import {
	canWriteMetadata,
	isSetupTimedOut,
	shouldRetryOrgCreate,
	validateStep1,
	validateStep2,
	validateStep3,
} from "./wizardValidation";

describe("validateStep1", () => {
	it("is invalid for an empty org name", () => {
		expect(validateStep1({ orgName: "" })).toEqual({
			valid: false,
			fields: ["orgName"],
		});
	});

	it("is invalid for whitespace-only org name", () => {
		expect(validateStep1({ orgName: "   " }).valid).toBe(false);
	});

	it("is valid for a real org name", () => {
		expect(validateStep1({ orgName: "Acme" })).toEqual({
			valid: true,
			fields: [],
		});
	});
});

describe("validateStep2", () => {
	const full = {
		streetAddress: "1 Main",
		city: "Town",
		state: "CA",
		zipCode: "90000",
		email: "a@b.com",
		phone: "5551234",
	};

	it("is valid when all required fields are present (website optional)", () => {
		expect(validateStep2(full)).toEqual({ valid: true, fields: [] });
	});

	it("lists missing required keys", () => {
		const result = validateStep2({ ...full, city: "", email: "" });
		expect(result.valid).toBe(false);
		expect(result.fields).toContain("city");
		expect(result.fields).toContain("email");
	});

	it("treats whitespace as empty", () => {
		expect(validateStep2({ ...full, zipCode: "  " }).fields).toContain(
			"zipCode"
		);
	});
});

describe("validateStep3", () => {
	it("is invalid for undefined company size", () => {
		expect(validateStep3({ companySize: undefined }).valid).toBe(false);
	});

	it("is invalid for an out-of-enum value", () => {
		expect(validateStep3({ companySize: "5000" }).valid).toBe(false);
	});

	it("is valid for an in-enum value", () => {
		expect(validateStep3({ companySize: "10-100" })).toEqual({
			valid: true,
			fields: [],
		});
	});
});

describe("canWriteMetadata", () => {
	it("is true only when the org id matches the created org", () => {
		expect(
			canWriteMetadata({ clerkOrganizationId: "org_1" }, "org_1")
		).toBe(true);
	});

	it("is false when the org id does not match", () => {
		expect(
			canWriteMetadata({ clerkOrganizationId: "org_other" }, "org_1")
		).toBe(false);
	});

	it("is false when the convex org is null", () => {
		expect(canWriteMetadata(null, "org_1")).toBe(false);
	});

	it("falls back to non-null check when no org was created this session", () => {
		expect(canWriteMetadata({ clerkOrganizationId: "anything" }, null)).toBe(
			true
		);
		expect(canWriteMetadata(null, null)).toBe(false);
	});
});

describe("shouldRetryOrgCreate", () => {
	it("is true when no org was created yet", () => {
		expect(shouldRetryOrgCreate({ createdOrgId: null })).toBe(true);
	});

	it("is false when an org already exists", () => {
		expect(shouldRetryOrgCreate({ createdOrgId: "org_123" })).toBe(false);
	});
});

describe("isSetupTimedOut", () => {
	it("is true at or past the timeout", () => {
		expect(isSetupTimedOut(30000)).toBe(true);
	});

	it("is false before the timeout", () => {
		expect(isSetupTimedOut(5000)).toBe(false);
	});
});
