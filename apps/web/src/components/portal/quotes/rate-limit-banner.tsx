"use client";

/**
 * RateLimitBanner — REVIEWS-mandated 429 handling for the approval rail and
 * mobile bottom sheet. Renders when the API route returns
 * `{ code: "rate_limited", retryAfterSeconds }`. Approve CTA is disabled
 * by the caller while cooldown is active; this banner provides the reason.
 */

import { Clock } from "lucide-react";

export interface RateLimitBannerProps {
	retryAfterSeconds?: number;
	onDismiss?: () => void;
}

export function RateLimitBanner({
	retryAfterSeconds,
	onDismiss,
}: RateLimitBannerProps) {
	const showCountdown =
		typeof retryAfterSeconds === "number" && retryAfterSeconds > 0;
	return (
		<div
			role="status"
			aria-live="polite"
			className="rounded-xl border border-amber-300 bg-amber-50 p-4"
		>
			<div className="flex items-start gap-3">
				<Clock
					className="h-4 w-4 mt-0.5 text-amber-700 shrink-0"
					aria-hidden="true"
				/>
				<div className="flex-1">
					<p className="text-[14px] font-semibold text-foreground">
						Slow down a moment.
					</p>
					<p className="mt-1 text-[13px] text-muted-foreground">
						You've sent a lot of requests in a short time. Please wait a few
						seconds and try again.
					</p>
					{showCountdown && (
						<p className="mt-2 text-[12px] text-muted-foreground">
							Try again in {retryAfterSeconds}s.
						</p>
					)}
				</div>
			</div>
			{onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
				>
					Dismiss
				</button>
			)}
		</div>
	);
}
