import { ConvexError } from "convex/values";

/**
 * The send mutations explain their own refusals (suppressed recipient, size
 * cap, recipient cap) in `ConvexError.data.message`. Prefer that over the
 * serialized wrapper `error.message` exposes.
 */
export function emailSendErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof ConvexError) {
		const data = error.data as { message?: unknown } | undefined;
		if (typeof data?.message === "string" && data.message.trim()) {
			return data.message;
		}
	}
	if (error instanceof Error && error.message.trim()) return error.message;
	return fallback;
}
