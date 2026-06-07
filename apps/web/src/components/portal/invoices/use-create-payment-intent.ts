"use client";

// Client secret + Stripe PI id flow ONLY through this hook's fetch — never
// embed in api.portal.invoices.get DTO (Plan 15-02 contract). paymentIntentId
// is parsed from the clientSecret prefix because it's the post-3DS cross-ref.

import { useCallback, useEffect, useRef, useState } from "react";

export type PaymentIntentErrorCode =
	| "unauthenticated"
	| "csrf"
	| "rate_limited"
	| "payments_not_enabled"
	| "legacy_invoice"
	| "not_found"
	| "network"
	| "internal";

export interface PaymentIntentError {
	code: PaymentIntentErrorCode;
	message: string;
	retryAfterSeconds: number | null;
}

export type PaymentIntentStatus = "idle" | "loading" | "ready" | "error";

export interface UseCreatePaymentIntentResult {
	status: PaymentIntentStatus;
	clientSecret: string | null;
	publishableKey: string | null;
	stripeAccountId: string | null;
	paymentIntentId: string | null;
	paymentId: string | null;
	amount: number | null;
	error: PaymentIntentError | null;
	retry: () => void;
}

interface ApiOkBody {
	clientSecret: string;
	publishableKey: string;
	stripeAccountId: string;
	paymentId: string;
	amount: number;
}

interface ApiErrBody {
	code?: string;
	message?: string;
	error?: string;
	retryAfterSeconds?: number | null;
}

function mapErrorCode(status: number, body: ApiErrBody): PaymentIntentErrorCode {
	const raw = body.code;
	if (raw === "unauthenticated" || raw === "csrf" || raw === "rate_limited")
		return raw;
	if (raw === "payments_not_enabled" || raw === "legacy_invoice") return raw;
	if (raw === "not_found") return "not_found";
	if (status === 401) return "unauthenticated";
	if (status === 403) return "csrf";
	if (status === 429) return "rate_limited";
	if (status === 404) return "not_found";
	return "internal";
}

export function useCreatePaymentIntent({
	invoiceId,
	enabled,
}: {
	invoiceId: string;
	enabled: boolean;
}): UseCreatePaymentIntentResult {
	const [status, setStatus] = useState<PaymentIntentStatus>("idle");
	const [clientSecret, setClientSecret] = useState<string | null>(null);
	const [publishableKey, setPublishableKey] = useState<string | null>(null);
	const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
	const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
	const [paymentId, setPaymentId] = useState<string | null>(null);
	const [amount, setAmount] = useState<number | null>(null);
	const [error, setError] = useState<PaymentIntentError | null>(null);
	const [retryToken, setRetryToken] = useState(0);

	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		if (!enabled) {
			abortRef.current?.abort();
			abortRef.current = null;
			return;
		}
		const controller = new AbortController();
		abortRef.current = controller;

		(async () => {
			setStatus("loading");
			setError(null);
			try {
				const res = await fetch(
					`/api/portal/invoices/${invoiceId}/payment-intent`,
					{
						method: "POST",
						signal: controller.signal,
						headers: { "content-type": "application/json" },
					},
				);
				if (controller.signal.aborted) return;
				const body = (await res.json().catch(() => ({}))) as ApiOkBody &
					ApiErrBody;
				if (!res.ok) {
					setStatus("error");
					setError({
						code: mapErrorCode(res.status, body),
						message: body.message ?? body.error ?? "Couldn't start payment.",
						retryAfterSeconds:
							typeof body.retryAfterSeconds === "number"
								? body.retryAfterSeconds
								: null,
					});
					return;
				}
				const cs = body.clientSecret;
				// Stripe PI ids have shape `pi_<id>_secret_<random>`; prefix is the PI id.
				const pid = cs.split("_secret_")[0] ?? "";
				setClientSecret(cs);
				setPublishableKey(body.publishableKey);
				setStripeAccountId(body.stripeAccountId);
				setPaymentIntentId(pid);
				setPaymentId(body.paymentId);
				setAmount(body.amount);
				setStatus("ready");
			} catch (e) {
				if (controller.signal.aborted) return;
				if (
					e instanceof DOMException &&
					(e.name === "AbortError" || e.name === "TimeoutError")
				) {
					return;
				}
				setStatus("error");
				setError({
					code: "network",
					message: "Couldn't reach the payment service. Try again.",
					retryAfterSeconds: null,
				});
			}
		})();

		return () => {
			controller.abort();
		};
	}, [enabled, invoiceId, retryToken]);

	const retry = useCallback(() => {
		setRetryToken((n) => n + 1);
	}, []);

	return {
		status,
		clientSecret,
		publishableKey,
		stripeAccountId,
		paymentIntentId,
		paymentId,
		amount,
		error,
		retry,
	};
}
