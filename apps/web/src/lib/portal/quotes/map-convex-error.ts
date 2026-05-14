import { NextResponse } from "next/server";
import { ConvexError } from "convex/values";

/** Convex error to HTTP response mapper shared by approve and decline routes. */
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
		// Phase 15 — invoice payment-intent codes.
		case "PAYMENTS_NOT_ENABLED":
			return NextResponse.json(
				{
					error:
						"Online payments aren't available for this invoice yet.",
					code: "payments_not_enabled",
				},
				{ status: 422 },
			);
		case "LEGACY_INVOICE_NOT_PAYABLE":
			return NextResponse.json(
				{
					error: "This invoice uses the legacy payment flow.",
					code: "legacy_invoice",
				},
				{ status: 422 },
			);
		case "STRIPE_KEYS_MISSING":
		case "STRIPE_CLIENT_SECRET_MISSING":
		case "INVALID_AMOUNT":
		case "NO_ACTIVE_PAYMENT":
			return NextResponse.json(
				{ error: "Payment is unavailable right now." },
				{ status: 422 },
			);
		default:
			return NextResponse.json(
				{ error: "Something went wrong" },
				{ status: 500 },
			);
	}
}

/** Same-origin check for state-changing portal routes. */
export function isSameOrigin(
	originHeader: string | null,
	refererHeader: string | null,
	expectedOrigin: string | null,
): boolean {
	if (!expectedOrigin) return false;
	if (originHeader !== null && originHeader !== undefined) {
		if (originHeader === "" || originHeader === "null") return false;
		try {
			return new URL(originHeader).origin === expectedOrigin;
		} catch {
			return false; // malformed Origin → reject
		}
	}
	if (!refererHeader) return false;
	try {
		return new URL(refererHeader).origin === expectedOrigin;
	} catch {
		return false;
	}
}
