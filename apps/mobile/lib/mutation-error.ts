import { ConvexError } from "convex/values";

/** Stable code thrown by lib/planCaps.ts when a free-plan ceiling is hit. */
export const PLAN_LIMIT_CODE = "PLAN_LIMIT_REACHED";

export type MutationError = {
	/** Message safe to render inline under the field/CTA that failed. */
	message: string;
	/** True when the org hit a plan ceiling — callers add the upgrade hint. */
	planLimit: boolean;
};

/**
 * Normalize a thrown mutation error into inline-renderable copy. Convex sends
 * structured `{ code, message }` payloads through ConvexError.data; anything
 * else (network, plain Error) collapses to the caller's fallback so we never
 * leak a stack trace into the UI.
 */
export function describeMutationError(
	err: unknown,
	fallback: string
): MutationError {
	const data =
		err instanceof ConvexError && typeof err.data === "object" && err.data !== null
			? (err.data as { code?: string; message?: string })
			: undefined;
	if (data?.code === PLAN_LIMIT_CODE) {
		return {
			// Only a real string may reach the UI — `message` is typed, not proven.
			message:
				typeof data.message === "string"
					? data.message
					: "You've reached a plan limit.",
			planLimit: true,
		};
	}
	return { message: fallback, planLimit: false };
}
