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
 *
 * Plan 14-07: submitApprove and submitDecline RETURN a discriminated
 * `DecisionResult` so callers (notably DeclineModal) can branch on
 * success vs failure — the modal stays open on `ok: false`.
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

export type DecisionResult =
	| { ok: true; receipt: ApprovalReceipt }
	| { ok: false; error: DecisionError };

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
		}): Promise<DecisionResult> => {
			if (!expectedDocumentId) {
				const errObj: DecisionError = {
					code: "unknown",
					message: "Quote document is not ready. Please reload.",
				};
				setError(errObj);
				return { ok: false, error: errObj };
			}
			if (Date.now() < cooldownUntil) {
				const errObj: DecisionError = {
					code: "rate_limited",
					message: "Please wait before retrying.",
				};
				return { ok: false, error: errObj };
			}
			setState("submitting");
			setError(null);
			try {
				const res = await fetch(`/api/portal/quotes/${quoteId}/approve`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						expectedDocumentId,
						signatureMode: params.signature.mode,
						signatureBase64: params.signature.dataUrl,
						signatureRawData: JSON.stringify(params.signature.rawData),
						termsAccepted: true,
						intentAffirmed:
							params.signature.mode === "typed"
								? params.intentAffirmed
								: undefined,
					}),
				});
				const body = await res.json().catch(() => ({}));
				if (res.status === 409) {
					const errObj: DecisionError = {
						code: body.code === "not_pending" ? "not_pending" : "stale",
						message: body.error ?? "Conflict",
					};
					setError(errObj);
					setState("idle");
					console.warn("[portal-quote-decision] approve failed", {
						status: res.status,
						code: errObj.code,
						message: errObj.message,
					});
					return { ok: false, error: errObj };
				}
				if (res.status === 429) {
					const retrySec =
						typeof body.retryAfterSeconds === "number"
							? body.retryAfterSeconds
							: 10;
					setCooldownUntil(Date.now() + retrySec * 1000);
					const errObj: DecisionError = {
						code: "rate_limited",
						message: body.error ?? "Too many requests",
					};
					setError(errObj);
					setState("idle");
					console.warn("[portal-quote-decision] approve failed", {
						status: res.status,
						code: errObj.code,
						message: errObj.message,
					});
					return { ok: false, error: errObj };
				}
				if (res.status === 401) {
					const errObj: DecisionError = {
						code: "unauthenticated",
						message: body.error ?? "Session expired",
					};
					setError(errObj);
					setState("idle");
					console.warn("[portal-quote-decision] approve failed", {
						status: res.status,
						code: errObj.code,
						message: errObj.message,
					});
					return { ok: false, error: errObj };
				}
				if (!res.ok) {
					const errObj: DecisionError = {
						code: "unknown",
						message:
							body.error ??
							"Couldn't submit. Check your connection and try again.",
					};
					setError(errObj);
					setState("idle");
					console.warn("[portal-quote-decision] approve failed", {
						status: res.status,
						code: errObj.code,
						message: errObj.message,
					});
					return { ok: false, error: errObj };
				}
				const r = body.receipt as ApprovalReceipt;
				setReceipt(r);
				setState("completed");
				return { ok: true, receipt: r };
			} catch (_e) {
				const errObj: DecisionError = {
					code: "unknown",
					message: "Network error. Please try again.",
				};
				setError(errObj);
				setState("idle");
				console.warn("[portal-quote-decision] approve threw", _e);
				return { ok: false, error: errObj };
			}
		},
		[quoteId, expectedDocumentId, cooldownUntil],
	);

	const submitDecline = useCallback(
		async (reason?: string): Promise<DecisionResult> => {
			if (!expectedDocumentId) {
				const errObj: DecisionError = {
					code: "unknown",
					message: "Quote document is not ready. Please reload.",
				};
				setError(errObj);
				return { ok: false, error: errObj };
			}
			if (Date.now() < cooldownUntil) {
				const errObj: DecisionError = {
					code: "rate_limited",
					message: "Please wait before retrying.",
				};
				return { ok: false, error: errObj };
			}
			setState("submitting");
			setError(null);
			try {
				const res = await fetch(`/api/portal/quotes/${quoteId}/decline`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						expectedDocumentId,
						declineReason: reason,
					}),
				});
				const body = await res.json().catch(() => ({}));
				if (res.status === 409) {
					const errObj: DecisionError = {
						code: body.code === "not_pending" ? "not_pending" : "stale",
						message: body.error ?? "Conflict",
					};
					setError(errObj);
					setState("idle");
					console.warn("[portal-quote-decision] decline failed", {
						status: res.status,
						code: errObj.code,
						message: errObj.message,
					});
					return { ok: false, error: errObj };
				}
				if (res.status === 429) {
					const retrySec =
						typeof body.retryAfterSeconds === "number"
							? body.retryAfterSeconds
							: 10;
					setCooldownUntil(Date.now() + retrySec * 1000);
					const errObj: DecisionError = {
						code: "rate_limited",
						message: body.error ?? "Too many requests",
					};
					setError(errObj);
					setState("idle");
					console.warn("[portal-quote-decision] decline failed", {
						status: res.status,
						code: errObj.code,
						message: errObj.message,
					});
					return { ok: false, error: errObj };
				}
				if (res.status === 401) {
					const errObj: DecisionError = {
						code: "unauthenticated",
						message: body.error ?? "Session expired",
					};
					setError(errObj);
					setState("idle");
					console.warn("[portal-quote-decision] decline failed", {
						status: res.status,
						code: errObj.code,
						message: errObj.message,
					});
					return { ok: false, error: errObj };
				}
				if (!res.ok) {
					const errObj: DecisionError = {
						code: "unknown",
						message: body.error ?? "Couldn't submit.",
					};
					setError(errObj);
					setState("idle");
					console.warn("[portal-quote-decision] decline failed", {
						status: res.status,
						code: errObj.code,
						message: errObj.message,
					});
					return { ok: false, error: errObj };
				}
				const r = body.receipt as ApprovalReceipt;
				setReceipt(r);
				setState("completed");
				return { ok: true, receipt: r };
			} catch (_e) {
				const errObj: DecisionError = {
					code: "unknown",
					message: "Network error. Please try again.",
				};
				setError(errObj);
				setState("idle");
				console.warn("[portal-quote-decision] decline threw", _e);
				return { ok: false, error: errObj };
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
