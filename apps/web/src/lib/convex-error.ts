import { ConvexError } from "convex/values";

/**
 * Backend guards throw `ConvexError({ code, message })`. On a ConvexError the
 * `.message` property is a serialized envelope, so read `.data.message` first
 * and only fall back to `Error.message` for plain errors.
 */
export function convexErrorMessage(err: unknown, fallback: string): string {
	if (err instanceof ConvexError) {
		const data = err.data as { message?: unknown } | string | undefined;
		if (typeof data === "string" && data.trim()) return data;
		if (data && typeof data === "object" && typeof data.message === "string") {
			return data.message;
		}
		return fallback;
	}
	return err instanceof Error ? err.message : fallback;
}
