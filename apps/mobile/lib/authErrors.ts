// Pure auth-error helpers: map Clerk error codes to Field Kit inline copy and
// detect Apple/Google cancellation so screens never re-derive this inline.
// No React/Convex imports — Vitest-testable.

export type AuthErrorField = "email" | "password" | "code" | "form";

export interface AuthErrorResult {
	field: AuthErrorField;
	message: string;
}

const GENERIC: AuthErrorResult = {
	field: "form",
	message: "Something went wrong. Check your connection and try again.",
};

// Read the first available Clerk error code: errors[0].code, then top-level code.
function readCode(err: unknown): string {
	const e = err as
		| { code?: unknown; errors?: Array<{ code?: unknown }> }
		| null
		| undefined;
	if (!e) return "";
	const nested = e.errors?.[0]?.code;
	if (typeof nested === "string") return nested;
	if (typeof e.code === "string") return e.code;
	return "";
}

// Apple-native cancel: the user dismissed the system sheet. Render nothing.
export function isCancellation(err: unknown): boolean {
	return readCode(err) === "ERR_REQUEST_CANCELED";
}

// Google useSSO() non-success path: WebBrowser authSessionResult.type is
// "cancel"/"dismiss" (createdSessionId === null, no throw). Treat as silent.
export function isOAuthDismissed(authSessionResult: unknown): boolean {
	const type = (authSessionResult as { type?: unknown } | null)?.type;
	return type === "cancel" || type === "dismiss";
}

const INCOMPLETE_STATUSES = new Set([
	"needs_first_factor",
	"needs_second_factor",
	"needs_identifier",
	"missing_requirements",
]);

// Preserves the existing incomplete-MFA / missing_requirements branch instead
// of dropping it when Alert.alert is removed.
export function isIncompleteSignIn(status: unknown): boolean {
	return typeof status === "string" && INCOMPLETE_STATUSES.has(status);
}

// Route an incomplete sign-in to an inline form-level message.
export function mapIncompleteStatus(_status: string): AuthErrorResult {
	return {
		field: "form",
		message:
			"Additional verification is required to sign in. Please try again.",
	};
}

// Map a Clerk error to inline copy. NEVER surface err.message raw
// (info-disclosure mitigation T-25-01) — unknown codes fall to GENERIC.
export function mapAuthError(err: unknown): AuthErrorResult {
	const code = readCode(err);
	switch (code) {
		case "form_password_incorrect":
		case "form_identifier_not_found":
			return {
				field: "form",
				message: "That email or password doesn't match. Try again.",
			};
		case "form_identifier_exists":
			return {
				field: "email",
				message:
					"An account with this email already exists. Sign in instead.",
			};
		case "form_password_pwned":
		case "form_password_length_too_short":
			return { field: "password", message: "Use at least 8 characters." };
		case "form_code_incorrect":
		case "verification_failed":
			return {
				field: "code",
				message: "That code isn't right. Check your email and try again.",
			};
		default:
			return GENERIC;
	}
}
