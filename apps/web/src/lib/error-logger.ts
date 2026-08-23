import posthog from "posthog-js";

interface ErrorContext {
	userId?: string;
	action?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Log a caught error. Dev logs to the console only; production reports to
 * PostHog error tracking so caught failures stay investigable.
 */
export function logError(error: unknown, context?: ErrorContext): void {
	if (process.env.NODE_ENV === "development") {
		console.error("[Error Logger]", {
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			context,
			timestamp: new Date().toISOString(),
		});
		return;
	}

	posthog.captureException(error, {
		action: context?.action,
		...context?.metadata,
	});
}

/**
 * Get a user-friendly error message
 * @param error - The error object
 * @returns A safe error message to display to users
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		// In production, you might want to return a generic message
		// unless it's a known user-facing error
		return error.message;
	}
	return "An unexpected error occurred";
}

/**
 * Check if an error is a specific type of known error
 * @param error - The error to check
 * @param errorType - The error type to check against
 */
export function isErrorOfType(error: unknown, errorType: string): boolean {
	return error instanceof Error && error.name === errorType;
}
