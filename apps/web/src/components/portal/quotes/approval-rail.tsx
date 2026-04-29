"use client";

/**
 * ApprovalRail — desktop sticky right rail (380px). Owns the local form
 * state (signature, terms, intent, declineReason) and delegates submission
 * to the shared `useQuoteDecision` hook.
 *
 * Branches:
 *  - effectiveReceipt (= submitted receipt or REVIEWS-mandated initialReceipt)
 *    → ApprovalReceipt panel
 *  - error.code === "stale" → StaleVersionBanner with onReload that clears
 *    local form state and dismisses error
 *  - error.code === "rate_limited" → RateLimitBanner with countdown + Approve
 *    disabled while cooldown active
 *  - else → SignatureCard + checkboxes + Approve / Decline
 *
 * Test seam: `_testInitialSignature` (dev-only) seeds signaturePayload from
 * a usable payload so RTL tests don't have to drive the canvas.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import {
	SignatureCard,
	type SignaturePayload,
} from "./signature-card";
import { ApprovalReceipt } from "./approval-receipt";
import { DeclineModal, type DeclineModalConfirmResult } from "./decline-modal";
import { StaleVersionBanner } from "./stale-version-banner";
import { RateLimitBanner } from "./rate-limit-banner";
import { ApprovalErrorBanner } from "./approval-error-banner";
import {
	useQuoteDecision,
	type ApprovalReceipt as ApprovalReceiptType,
} from "./use-quote-decision";

export interface ApprovalRailQuote {
	_id: string;
	quoteNumber?: string;
	title?: string;
	status: string;
	total: number;
	validUntil?: number;
}

export interface ApprovalRailDocument {
	_id: string;
	version: number;
}

export interface ApprovalRailProps {
	quote: ApprovalRailQuote;
	latestDocument: ApprovalRailDocument | null;
	businessName: string;
	clientName: string;
	clientEmail: string;
	initialReceipt?: ApprovalReceiptType;
	/**
	 * REVIEWS-mandated (CR-04): when the parent island detects a mid-session
	 * document drift, this flag blocks Approve until the user reloads /
	 * acknowledges via the banner. Defense-in-depth alongside the `key`-based
	 * force-remount (which clears form state) — ensures a cached signature
	 * cannot be submitted against a document the user never saw.
	 */
	documentDrifted?: boolean;
	/**
	 * Test seam (dev/test only). When provided, seeds the rail's
	 * `signaturePayload` from this value on first render and SKIPS rendering
	 * <SignatureCard /> so RTL tests can drive form gating without simulating
	 * canvas drawing or font loading. PINNED in the plan as the sole sanctioned
	 * seam — do not introduce alternatives.
	 */
	_testInitialSignature?: SignaturePayload;
}

const NON_USABLE: SignaturePayload = {
	mode: "typed",
	dataUrl: null,
	rawData: null,
	isUsable: false,
};

function formatMoney(cents: number): string {
	return (cents / 100).toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
	});
}

function daysRemaining(validUntil?: number): number | null {
	if (!validUntil) return null;
	const ms = validUntil - Date.now();
	return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function ApprovalRail({
	quote,
	latestDocument,
	businessName,
	clientName,
	clientEmail,
	initialReceipt,
	documentDrifted = false,
	_testInitialSignature,
}: ApprovalRailProps) {
	const [signaturePayload, setSignaturePayload] = useState<SignaturePayload>(
		() => _testInitialSignature ?? NON_USABLE,
	);
	const [termsAccepted, setTermsAccepted] = useState(false);
	const [intentAffirmed, setIntentAffirmed] = useState(false);
	const [declineOpen, setDeclineOpen] = useState(false);

	const {
		state,
		error,
		receipt,
		submitApprove,
		submitDecline,
		dismissError,
		cooldownUntil,
		cooldownSecondsRemaining,
	} = useQuoteDecision(quote._id, latestDocument?._id);

	// REVIEWS-mandated: receipt from submission overrides initialReceipt
	const effectiveReceipt: ApprovalReceiptType | undefined =
		receipt ?? initialReceipt;

	// Reset form on stale 409 (REVIEWS-mandated): clear signature/terms/intent
	// and dismiss error so form re-enables once useQuery refreshes.
	const handleStaleReset = () => {
		setSignaturePayload(NON_USABLE);
		setTermsAccepted(false);
		setIntentAffirmed(false);
		dismissError();
	};

	const isCooldownActive = Date.now() < cooldownUntil;
	const submitting = state === "submitting";

	const canApprove = useMemo(() => {
		if (!signaturePayload.isUsable) return false;
		if (!termsAccepted) return false;
		if (signaturePayload.mode === "typed" && !intentAffirmed) return false;
		if (submitting) return false;
		if (isCooldownActive) return false;
		// REVIEWS-mandated (CR-04): block submission while document drift
		// is unacknowledged — user must explicitly re-pin via the banner.
		if (documentDrifted) return false;
		return true;
	}, [
		signaturePayload,
		termsAccepted,
		intentAffirmed,
		submitting,
		isCooldownActive,
		documentDrifted,
	]);

	const days = daysRemaining(quote.validUntil);
	const expiresLine =
		quote.validUntil && days !== null
			? days > 0
				? `Expires in ${days} day${days === 1 ? "" : "s"}`
				: "Expired"
			: undefined;

	const handleApprove = async () => {
		if (!signaturePayload.isUsable) return;
		await submitApprove({
			signature: signaturePayload,
			intentAffirmed,
		});
	};

	const handleDecline = async (
		reason?: string,
	): Promise<DeclineModalConfirmResult> => {
		const result = await submitDecline(reason);
		if (result.ok) return { ok: true };
		// Stale (rail shows StaleVersionBanner) and rate_limited (rail shows
		// RateLimitBanner) are surfaced at the rail layer — let the modal close
		// so the user sees the louder banner. Other codes (unauthenticated /
		// not_pending / unknown) keep the modal open with inline error.
		if (
			result.error.code === "stale" ||
			result.error.code === "rate_limited"
		) {
			return { ok: true };
		}
		return {
			ok: false,
			error: { code: result.error.code, message: result.error.message },
		};
	};

	return (
		<aside
			className="w-full lg:w-[380px] lg:sticky lg:top-6 self-start"
			aria-label="Quote approval"
		>
			<div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-5">
				{/* Quote total */}
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
						Quote total
					</p>
					<p className="mt-1 text-[36px] font-semibold tracking-[-0.025em] leading-[1] tabular-nums">
						{formatMoney(quote.total)}
					</p>
					{expiresLine && (
						<p className="mt-1 text-[13px] text-muted-foreground">
							{expiresLine}
						</p>
					)}
				</div>

				{/* Branches */}
				{effectiveReceipt ? (
					<ApprovalReceipt
						receipt={effectiveReceipt}
						clientName={clientName}
						clientEmail={clientEmail}
					/>
				) : error?.code === "stale" ? (
					<StaleVersionBanner onReload={handleStaleReset} />
				) : (
					<>
						{error?.code === "rate_limited" && (
							<RateLimitBanner
								retryAfterSeconds={cooldownSecondsRemaining}
								onDismiss={dismissError}
							/>
						)}

						{/* Plan 14-07 / UAT Gap 2: visible banner for previously-silent codes */}
						{error &&
							(error.code === "unauthenticated" ||
								error.code === "not_pending" ||
								error.code === "unknown") && (
								<ApprovalErrorBanner
									code={error.code}
									message={error.message}
								/>
							)}

						{/* Signature card (skipped under test seam) */}
						{_testInitialSignature ? null : (
							<div>
								<p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-2">
									Sign to accept
								</p>
								<SignatureCard
									value={signaturePayload}
									onChange={setSignaturePayload}
									disabled={submitting || isCooldownActive}
								/>
							</div>
						)}

						<label className="flex items-start gap-2 text-[13px] cursor-pointer">
							<input
								type="checkbox"
								aria-label="I accept the scope and terms above."
								checked={termsAccepted}
								onChange={(e) => setTermsAccepted(e.target.checked)}
								disabled={submitting || isCooldownActive}
								className="mt-0.5"
							/>
							<span>I accept the scope and terms above.</span>
						</label>

						{signaturePayload.mode === "typed" && (
							<label className="flex items-start gap-2 text-[12px] cursor-pointer text-muted-foreground">
								<input
									type="checkbox"
									aria-label="By typing my name and clicking Approve, I am signing this quote electronically. I agree that my electronic signature is the legal equivalent of my manual signature on this quote."
									checked={intentAffirmed}
									onChange={(e) => setIntentAffirmed(e.target.checked)}
									disabled={submitting || isCooldownActive}
									className="mt-0.5"
								/>
								<span>
									By typing my name and clicking Approve, I am signing this
									quote electronically. I agree that my electronic signature is
									the legal equivalent of my manual signature on this quote.
								</span>
							</label>
						)}

						<button
							type="button"
							onClick={handleApprove}
							disabled={!canApprove}
							aria-busy={submitting}
							aria-label="Approve quote"
							className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-3 text-[14px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							{submitting ? (
								<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
							) : (
								<Check className="h-3.5 w-3.5" aria-hidden="true" />
							)}
							{submitting ? "Approving…" : "Approve quote"}
						</button>

						<button
							type="button"
							onClick={() => setDeclineOpen(true)}
							disabled={submitting}
							className="w-full text-[13px] text-muted-foreground hover:text-foreground py-1"
						>
							Decline this quote
						</button>
					</>
				)}

				{/* SR-only live region */}
				<div aria-live="polite" className="sr-only">
					{error?.message ?? ""}
				</div>
			</div>

			<DeclineModal
				open={declineOpen}
				onOpenChange={setDeclineOpen}
				onConfirm={handleDecline}
				businessName={businessName}
			/>
		</aside>
	);
}
