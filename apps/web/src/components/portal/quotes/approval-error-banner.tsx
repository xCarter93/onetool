"use client";

/**
 * ApprovalErrorBanner — visible error surface for the
 * `unauthenticated | not_pending | unknown` decision-error codes.
 *
 * The dedicated `StaleVersionBanner` and `RateLimitBanner` already cover
 * `stale` and `rate_limited`; this banner covers the remaining three
 * codes that previously only surfaced in an `sr-only` aria-live region
 * (UAT Gaps 2 + 3 — silent failure).
 *
 * Used by both ApprovalRail (desktop) and ApprovalBottomSheet (mobile)
 * to keep the visible-error surface DRY (REVIEWS-mandated).
 */

export type ApprovalErrorBannerCode =
	| "unauthenticated"
	| "not_pending"
	| "unknown";

export interface ApprovalErrorBannerProps {
	code: ApprovalErrorBannerCode;
	message: string;
}

function titleForCode(code: ApprovalErrorBannerCode): string {
	switch (code) {
		case "unauthenticated":
			return "Your session expired";
		case "not_pending":
			return "This quote is no longer pending";
		case "unknown":
		default:
			return "Couldn't submit";
	}
}

export function ApprovalErrorBanner({
	code,
	message,
}: ApprovalErrorBannerProps) {
	return (
		<div
			role="alert"
			className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700"
		>
			<p className="font-medium">{titleForCode(code)}</p>
			<p className="mt-0.5">{message}</p>
		</div>
	);
}
