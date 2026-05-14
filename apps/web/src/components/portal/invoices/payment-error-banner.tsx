"use client";

import { useEffect, useState } from "react";

import type {
	PaymentIntentError,
	PaymentIntentErrorCode,
} from "./use-create-payment-intent";

export interface PaymentErrorBannerProps {
	error: PaymentIntentError;
	businessName?: string;
	onRetry?: () => void;
}

function titleFor(code: PaymentIntentErrorCode): string {
	switch (code) {
		case "unauthenticated":
			return "Your session expired";
		case "csrf":
			return "Couldn't verify request";
		case "rate_limited":
			return "Too many payment attempts";
		case "payments_not_enabled":
			return "Online payment not yet available";
		case "legacy_invoice":
			return "Pay via your invoice email link";
		case "not_found":
			return "Invoice not found";
		case "network":
			return "Something went wrong";
		case "internal":
		default:
			return "Payment couldn't be processed";
	}
}

function bodyFor(
	code: PaymentIntentErrorCode,
	message: string,
	businessName: string | undefined,
	countdownSeconds: number | null,
): string {
	switch (code) {
		case "payments_not_enabled":
			return `${businessName ?? "This business"} hasn't finished setting up online payments. Please reach out to pay another way.`;
		case "legacy_invoice":
			return "This invoice uses the older payment flow. Use the link in your invoice email.";
		case "rate_limited":
			if (countdownSeconds && countdownSeconds > 0) {
				return `For your security, please wait ${countdownSeconds} second${countdownSeconds === 1 ? "" : "s"} and try again.`;
			}
			return "For your security, please wait a moment and try again.";
		case "network":
			return "We couldn't reach our payment processor. Please try again in a moment.";
		case "unauthenticated":
			return "Please re-verify your email to continue paying.";
		default:
			return message || "Try a different payment method or contact your bank.";
	}
}

export function PaymentErrorBanner({
	error,
	businessName,
	onRetry,
}: PaymentErrorBannerProps) {
	// Live countdown for rate_limited; ticks every second until 0.
	const [remaining, setRemaining] = useState<number | null>(
		error.code === "rate_limited" ? (error.retryAfterSeconds ?? null) : null,
	);
	useEffect(() => {
		if (error.code !== "rate_limited") return;
		setRemaining(error.retryAfterSeconds ?? null);
		if (!error.retryAfterSeconds || error.retryAfterSeconds <= 0) return;
		const id = setInterval(() => {
			setRemaining((s) => (s !== null && s > 0 ? s - 1 : 0));
		}, 1000);
		return () => clearInterval(id);
	}, [error.code, error.retryAfterSeconds]);

	const body = bodyFor(error.code, error.message, businessName, remaining);

	return (
		<div
			role="alert"
			className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700"
		>
			<p className="font-medium">{titleFor(error.code)}</p>
			<p className="mt-0.5">{body}</p>
			{onRetry && error.code !== "rate_limited" ? (
				<button
					type="button"
					onClick={onRetry}
					className="mt-1.5 inline-flex items-center text-[12px] font-medium underline hover:no-underline"
				>
					Try again
				</button>
			) : null}
		</div>
	);
}
