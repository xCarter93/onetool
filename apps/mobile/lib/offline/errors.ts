import { ConvexError } from "convex/values";

export type FailureClass =
	| "temporary"
	| "auth"
	| "permission"
	| "conflict"
	| "permanent"
	| "already_applied";

export type ClassifiedError = {
	class: FailureClass;
	code?: string;
	reason?: string;
	message: string;
};

// Thrown by the sync loop when a mutation round-trip exceeds its budget —
// never surfaces server text, so it always classifies as temporary.
export class OfflineTimeoutError extends Error {}

const DEFAULT_MESSAGE: Record<FailureClass, string> = {
	temporary: "A temporary connection problem interrupted this. It will retry automatically.",
	auth: "Your session expired. Sign in again to continue.",
	permission: "You don't have permission to do this.",
	conflict: "This record changed since you made this edit.",
	permanent: "The server rejected this change.",
	already_applied: "This was already applied.",
};

const GENERIC_PERMANENT_MESSAGE = "The server rejected this change.";

const CONFLICT_CODES = new Set([
	"CONFLICT",
	"QUOTE_VERSION_STALE",
	"QUOTE_NOT_PENDING",
	"RECURRING_PROJECT_SUSPENDED",
	"PENDING_REVISION_REPLACE",
]);

const NETWORK_PATTERN = /network request failed|connection lost|network|fetch failed|timed out/i;
const AUTH_PATTERN = /unauthenticated|not authenticated|no auth/i;
const SERVER_PATTERN = /\[convex|server error|uncaught/i;

function withMessage(klass: FailureClass, message: string | undefined, extra?: Partial<ClassifiedError>): ClassifiedError {
	return {
		class: klass,
		message: typeof message === "string" && message.length > 0 ? message : DEFAULT_MESSAGE[klass],
		...extra,
	};
}

function classifyConvexObjectData(data: { code?: string; reason?: string; message?: string; scope?: boolean }): ClassifiedError {
	const { code, reason, message, scope } = data;
	if (code === "UNAUTHENTICATED") return withMessage("auth", message, { code, reason });
	if (code === "FORBIDDEN") {
		return scope === true
			? withMessage("conflict", message, { code, reason })
			: withMessage("permission", message, { code, reason });
	}
	if (code === "CONFLICT" && reason === "TASK_ALREADY_COMPLETED") {
		return withMessage("already_applied", message, { code, reason });
	}
	if (code !== undefined && CONFLICT_CODES.has(code)) return withMessage("conflict", message, { code, reason });
	if (code === "RATE_LIMITED") return withMessage("temporary", message, { code, reason });
	return withMessage("permanent", message, { code, reason });
}

export function classifyError(err: unknown): ClassifiedError {
	if (err instanceof OfflineTimeoutError) {
		return withMessage("temporary", undefined);
	}

	if (err instanceof ConvexError) {
		const data = err.data;
		if (typeof data === "string") {
			return withMessage("permanent", data);
		}
		if (data && typeof data === "object") {
			return classifyConvexObjectData(data as { code?: string; reason?: string; message?: string; scope?: boolean });
		}
		return withMessage("permanent", undefined);
	}

	if (err instanceof Error) {
		const text = err.message ?? "";
		if (NETWORK_PATTERN.test(text)) return withMessage("temporary", undefined);
		if (AUTH_PATTERN.test(text)) return withMessage("auth", undefined);
		// Never echo raw server-side text (stack traces, internal errors) to the UI.
		if (SERVER_PATTERN.test(text)) return withMessage("permanent", GENERIC_PERMANENT_MESSAGE);
		return withMessage("temporary", undefined);
	}

	return withMessage("temporary", undefined);
}
