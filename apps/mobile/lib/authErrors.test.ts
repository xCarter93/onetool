import { describe, expect, it } from "vitest";
import {
	isCancellation,
	isIncompleteSignIn,
	isOAuthDismissed,
	mapAuthError,
	mapIncompleteStatus,
} from "./authErrors";

describe("isCancellation", () => {
	it("is true for top-level ERR_REQUEST_CANCELED code", () => {
		expect(isCancellation({ code: "ERR_REQUEST_CANCELED" })).toBe(true);
	});

	it("is true for nested errors[0].code ERR_REQUEST_CANCELED", () => {
		expect(
			isCancellation({ errors: [{ code: "ERR_REQUEST_CANCELED" }] })
		).toBe(true);
	});

	it("is false for any non-cancel code", () => {
		expect(isCancellation({ code: "form_password_incorrect" })).toBe(false);
	});

	it("is false for null/undefined", () => {
		expect(isCancellation(null)).toBe(false);
		expect(isCancellation(undefined)).toBe(false);
	});
});

describe("isOAuthDismissed", () => {
	it("is true for type cancel", () => {
		expect(isOAuthDismissed({ type: "cancel" })).toBe(true);
	});

	it("is true for type dismiss", () => {
		expect(isOAuthDismissed({ type: "dismiss" })).toBe(true);
	});

	it("is false for type success", () => {
		expect(isOAuthDismissed({ type: "success" })).toBe(false);
	});

	it("is false for null", () => {
		expect(isOAuthDismissed(null)).toBe(false);
	});

	it("is false for type locked", () => {
		expect(isOAuthDismissed({ type: "locked" })).toBe(false);
	});
});

describe("isIncompleteSignIn", () => {
	it("is true for needs_first_factor", () => {
		expect(isIncompleteSignIn("needs_first_factor")).toBe(true);
	});

	it("is true for needs_second_factor", () => {
		expect(isIncompleteSignIn("needs_second_factor")).toBe(true);
	});

	it("is true for needs_identifier", () => {
		expect(isIncompleteSignIn("needs_identifier")).toBe(true);
	});

	it("is true for missing_requirements", () => {
		expect(isIncompleteSignIn("missing_requirements")).toBe(true);
	});

	it("is false for complete", () => {
		expect(isIncompleteSignIn("complete")).toBe(false);
	});

	it("is false for undefined", () => {
		expect(isIncompleteSignIn(undefined)).toBe(false);
	});
});

describe("mapIncompleteStatus", () => {
	it("maps an incomplete status to a form-level inline message", () => {
		expect(mapIncompleteStatus("needs_second_factor")).toEqual({
			field: "form",
			message: "Additional verification is required to sign in. Please try again.",
		});
	});
});

describe("mapAuthError", () => {
	it("maps bad credentials (form_password_incorrect) to form", () => {
		expect(mapAuthError({ errors: [{ code: "form_password_incorrect" }] })).toEqual({
			field: "form",
			message: "That email or password doesn't match. Try again.",
		});
	});

	it("maps bad credentials (form_identifier_not_found) to form", () => {
		expect(mapAuthError({ code: "form_identifier_not_found" })).toEqual({
			field: "form",
			message: "That email or password doesn't match. Try again.",
		});
	});

	it("maps email already taken to email field", () => {
		expect(mapAuthError({ code: "form_identifier_exists" })).toEqual({
			field: "email",
			message: "An account with this email already exists. Sign in instead.",
		});
	});

	it("maps weak password (form_password_pwned) to password field", () => {
		expect(mapAuthError({ code: "form_password_pwned" })).toEqual({
			field: "password",
			message: "Use at least 8 characters.",
		});
	});

	it("maps short password (form_password_length_too_short) to password field", () => {
		expect(mapAuthError({ code: "form_password_length_too_short" })).toEqual({
			field: "password",
			message: "Use at least 8 characters.",
		});
	});

	it("maps wrong code (form_code_incorrect) to code field", () => {
		expect(mapAuthError({ code: "form_code_incorrect" })).toEqual({
			field: "code",
			message: "That code isn't right. Check your email and try again.",
		});
	});

	it("maps verification_failed to code field", () => {
		expect(mapAuthError({ code: "verification_failed" })).toEqual({
			field: "code",
			message: "That code isn't right. Check your email and try again.",
		});
	});

	it("maps unknown code to the generic form-level message", () => {
		expect(mapAuthError({ code: "some_unknown_code" })).toEqual({
			field: "form",
			message: "Something went wrong. Check your connection and try again.",
		});
	});

	it("maps undefined to the generic form-level message", () => {
		expect(mapAuthError(undefined)).toEqual({
			field: "form",
			message: "Something went wrong. Check your connection and try again.",
		});
	});

	it("never surfaces raw err.message", () => {
		const result = mapAuthError({ message: "raw internal stack trace" });
		expect(result.message).toBe(
			"Something went wrong. Check your connection and try again."
		);
	});
});
