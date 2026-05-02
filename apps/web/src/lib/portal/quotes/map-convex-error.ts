import { NextResponse } from "next/server";
import { ConvexError } from "convex/values";

/**
 * Convex error → HTTP response mapper shared by approve + decline routes.
 *
 * REVIEWS-mandated: complete code map covering STALE→409, NOT_PENDING→409,
 * RATE_LIMITED→429, UNAUTHENTICATED→401, FORBIDDEN/NOT_FOUND→404,
 * INVALID_SIGNATURE_FORMAT/SIGNATURE_TOO_LARGE→400, default→500.
 *
 * Implementation mirrors apps/web/src/app/api/portal/otp/verify/route.ts —
 * we use `err instanceof ConvexError` first, then a cross-realm fallback that
 * inspects `err.data` shape directly because Next.js can load duplicate
 * convex/values modules in different runtimes (edge vs node) which makes
 * `instanceof` unreliable.
 */
export function mapConvexError(err: unknown): NextResponse {
	let data: { code?: string; retryAfter?: number; message?: string } = {};
	if (err instanceof ConvexError) {
		data = err.data as typeof data;
	} else if (
		typeof err === "object" &&
		err !== null &&
		"data" in err &&
		typeof (err as { data?: unknown }).data === "object" &&
		(err as { data?: unknown }).data !== null
	) {
		// Cross-realm fallback for ConvexError-shaped errors from another module realm.
		data = (err as { data: { code?: string; retryAfter?: number } }).data;
	} else {
		return NextResponse.json(
			{ error: "Something went wrong" },
			{ status: 500 },
		);
	}

	switch (data.code) {
		case "QUOTE_VERSION_STALE":
			return NextResponse.json(
				{
					error:
						"This quote was updated. Please reload to see the latest.",
					code: "stale",
				},
				{ status: 409 },
			);
		case "QUOTE_NOT_PENDING":
			// Action-neutral copy — must not say "approved" on the decline route.
			return NextResponse.json(
				{
					error:
						"This quote is no longer pending. It may have been already decided or expired.",
					code: "not_pending",
				},
				{ status: 409 },
			);
		case "RATE_LIMITED":
			return NextResponse.json(
				{
					error:
						"Too many requests. Please wait a moment and try again.",
					code: "rate_limited",
					retryAfterSeconds:
						typeof data.retryAfter === "number"
							? Math.ceil(data.retryAfter / 1000)
							: 10,
				},
				{ status: 429 },
			);
		case "UNAUTHENTICATED":
			return NextResponse.json(
				{
					error: "Session expired. Please verify your email again.",
					code: "unauthenticated",
				},
				{ status: 401 },
			);
		case "FORBIDDEN":
		case "NOT_FOUND":
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		case "INVALID_SIGNATURE_FORMAT":
		case "SIGNATURE_TOO_LARGE":
			return NextResponse.json(
				{ error: "Invalid signature" },
				{ status: 400 },
			);
		default:
			return NextResponse.json(
				{ error: "Something went wrong" },
				{ status: 500 },
			);
	}
}

/**
 * Same-origin check for state-changing routes.
 *
 * REVIEWS-mandated policy: REJECT when BOTH Origin AND Referer are missing on
 * POST routes. SameSite=Lax cookie (Phase 13) is the secondary CSRF control;
 * this header check is the primary one. Origin is checked first; Referer is
 * the fallback when Origin is absent. URL parsing is wrapped in try/catch so
 * malformed values reject cleanly instead of throwing 500.
 */
export function isSameOrigin(
	originHeader: string | null,
	refererHeader: string | null,
	host: string | null,
): boolean {
	if (!host) return false;
	// REVIEWS-mandated (WR-06): when an Origin header is present in any form,
	// validate IT — do not silently fall through to Referer. Treat the
	// opaque-origin sentinels ("" and the literal "null") as a reject signal
	// rather than degrading the policy for state-changing routes. Only fall
	// back to Referer when Origin is entirely absent (null/undefined).
	if (originHeader !== null && originHeader !== undefined) {
		if (originHeader === "" || originHeader === "null") return false;
		try {
			return new URL(originHeader).host === host;
		} catch {
			return false; // malformed Origin → reject
		}
	}
	if (!refererHeader) return false; // both Origin and Referer missing → reject
	try {
		return new URL(refererHeader).host === host;
	} catch {
		return false; // malformed Referer URL → reject
	}
}
