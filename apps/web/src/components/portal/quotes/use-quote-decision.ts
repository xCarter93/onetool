"use client";

/**
 * useQuoteDecision — REVIEWS-mandated DRY hook shared by ApprovalRail and
 * ApprovalBottomSheet. Handles approve/decline submission, error mapping
 * (stale 409, not_pending 409, rate_limited 429, unauthenticated 401),
 * and the rate-limit cooldown countdown.
 *
 * Stale-409 reset behavior: caller (rail/sheet) clears its local
 * signature/terms/intent/declineReason state on stale; this hook just
 * dismisses the error so the form re-enables. Convex's
 * useQuery(api.portal.quotes.get) reactive subscription refreshes
 * latestDocumentId automatically.
 */

import { useCallback, useEffect, useState } from "react";

import type { SignaturePayload } from "./signature-card";

export type DecisionError = {
	code:
		| "stale"
		| "not_pending"
		| "rate_limited"
		| "unauthenticated"
		| "unknown";
	message: string;
};

export type DecisionState = "idle" | "submitting" | "completed";

export interface ApprovalReceipt {
	auditId: string;
	action: "approved" | "declined";
	createdAt: number;
	documentVersion: number;
	lineItemsCount: number;
	total: number;
	signatureStorageId?: string;
	signatureUrl?: string | null;
}

export function useQuoteDecision(
	quoteId: string,
	expectedDocumentId: string | undefined,
) {
	// --- core state ---
	const [state, setState] = useState<DecisionState>("idle");
	const [error, setError] = useState<DecisionError | null>(null);
	const [receipt, setReceipt] = useState<ApprovalReceipt | null>(null);

	// --- REVIEWS-mandated rate-limit cooldown state ---
	const [cooldownUntil, setCooldownUntil] = useState<number>(0);
	const [, setTick] = useState(0);
	useEffect(() => {
		if (cooldownUntil <= Date.now()) return;
		const id = setInterval(() => setTick((t) => t + 1), 1000);
		return () => clearInterval(id);
	}, [cooldownUntil]);
	const cooldownSecondsRemaining = Math.max(
		0,
		Math.ceil((cooldownUntil - Date.now()) / 1000),
	);

	// --- REVIEWS-mandated stale-409 reset (declared BEFORE submit fns) ---
	const resetForStale = useCallback(() => {
		setError(null);
	}, []);

	const dismissError = useCallback(() => setError(null), []);

	// --- submit fns ---
	const submitApprove = useCallback(
		async (params: {
			signature: SignaturePayload & { isUsable: true };
			intentAffirmed: boolean;
		}) => {
			if (!expectedDocumentId) return;
			if (Date.now() < cooldownUntil) return;
			setState("submitting");
			setError(null);
			try {
				const res = await fetch(
					`/api/portal/quotes/${quoteId}/approve`,
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							expectedDocumentId,
							signatureMode: params.signature.mode,
							signatureBase64: params.signature.dataUrl,
							signatureRawData: JSON.stringify(
								params.signature.rawData,
							),
							termsAccepted: true,
							intentAffirmed:
								params.signature.mode === "typed"
									? params.intentAffirmed
									: undefined,
						}),
					},
				);
				const body = await res.json().catch(() => ({}));
				if (res.status === 409) {
					setError({
						code: body.code === "not_pending" ? "not_pending" : "stale",
						message: body.error ?? "Conflict",
					});
					setState("idle");
					return;
				}
				if (res.status === 429) {
					const retrySec =
						typeof body.retryAfterSeconds === "number"
							? body.retryAfterSeconds
							: 10;
					setCooldownUntil(Date.now() + retrySec * 1000);
					setError({
						code: "rate_limited",
						message: body.error ?? "Too many requests",
					});
					setState("idle");
					return;
				}
				if (res.status === 401) {
					setError({
						code: "unauthenticated",
						message: body.error ?? "Session expired",
					});
					setState("idle");
					return;
				}
				if (!res.ok) {
					setError({
						code: "unknown",
						message:
							body.error ??
							"Couldn't submit. Check your connection and try again.",
					});
					setState("idle");
					return;
				}
				setReceipt(body.receipt as ApprovalReceipt);
				setState("completed");
			} catch (_e) {
				setError({
					code: "unknown",
					message: "Network error. Please try again.",
				});
				setState("idle");
			}
		},
		[quoteId, expectedDocumentId, cooldownUntil],
	);

	const submitDecline = useCallback(
		async (reason?: string) => {
			if (!expectedDocumentId) return;
			if (Date.now() < cooldownUntil) return;
			setState("submitting");
			setError(null);
			try {
				const res = await fetch(
					`/api/portal/quotes/${quoteId}/decline`,
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							expectedDocumentId,
							declineReason: reason,
						}),
					},
				);
				const body = await res.json().catch(() => ({}));
				if (res.status === 409) {
					setError({
						code: body.code === "not_pending" ? "not_pending" : "stale",
						message: body.error ?? "Conflict",
					});
					setState("idle");
					return;
				}
				if (res.status === 429) {
					const retrySec =
						typeof body.retryAfterSeconds === "number"
							? body.retryAfterSeconds
							: 10;
					setCooldownUntil(Date.now() + retrySec * 1000);
					setError({
						code: "rate_limited",
						message: body.error ?? "Too many requests",
					});
					setState("idle");
					return;
				}
				if (res.status === 401) {
					setError({
						code: "unauthenticated",
						message: body.error ?? "Session expired",
					});
					setState("idle");
					return;
				}
				if (!res.ok) {
					setError({
						code: "unknown",
						message: body.error ?? "Couldn't submit.",
					});
					setState("idle");
					return;
				}
				setReceipt(body.receipt as ApprovalReceipt);
				setState("completed");
			} catch (_e) {
				setError({
					code: "unknown",
					message: "Network error. Please try again.",
				});
				setState("idle");
			}
		},
		[quoteId, expectedDocumentId, cooldownUntil],
	);

	return {
		state,
		error,
		receipt,
		submitApprove,
		submitDecline,
		dismissError,
		cooldownUntil,
		cooldownSecondsRemaining,
		resetForStale,
	};
}
