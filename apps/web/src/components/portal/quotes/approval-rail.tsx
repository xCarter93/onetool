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

import { useMemo, useState } from "react";
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
import { ResolvedStatusPanel } from "./resolved-status-panel";
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
	 * Plan 14-10 Gap 6: when the quote is already resolved (status approved or
	 * declined) AND no current portal audit row exists, the parent passes this
	 * to surface ResolvedStatusPanel rather than the form. Branch sits ABOVE
	 * the visible-error banner block (resolved state wins over transient
	 * errors — a quote that's already resolved should never show a form-error
	 * from a stale submission).
	 */
	resolvedFallback?: {
		action: "approved" | "declined";
		resolvedAt: number;
		total: number;
	};
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

function formatMoney(amount: number): string {
	return amount.toLocaleString("en-US", {
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
	resolvedFallback,
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
			className="w-full self-start border-l-0 border-t border-border bg-card md:border-l md:border-t-0 md:sticky md:top-[68px] md:h-[calc(100vh-68px)] md:overflow-y-auto"
			aria-label="Quote approval"
		>
			<div className="flex flex-col gap-8 p-6 md:gap-9 md:p-7">
				{/* Quote total — flat top section */}
				<div className="border-b border-border pb-6">
					<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
						Quote total
					</p>
					<p className="mt-2 text-[36px] font-semibold tracking-[-0.025em] leading-[1] tabular-nums">
						{formatMoney(quote.total)}
					</p>
					{expiresLine && (
						<p className="mt-2 text-[13px] text-muted-foreground">
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
				) : resolvedFallback ? (
					<ResolvedStatusPanel
						action={resolvedFallback.action}
						resolvedAt={resolvedFallback.resolvedAt}
						total={resolvedFallback.total}
						clientName={clientName}
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

						{/* Signing surface — single glass-card exception per redesign spec */}
						{_testInitialSignature ? null : (
							<div className="group relative overflow-hidden rounded-2xl bg-primary/5 ring-1 ring-primary/20 backdrop-blur-md dark:bg-primary/10 dark:ring-primary/30">
								<div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/[0.02] dark:to-transparent" />
								<div className="relative z-10 p-5">
									<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
										Sign to accept
									</p>
									<div className="mt-3">
										<SignatureCard
											value={signaturePayload}
											onChange={setSignaturePayload}
											disabled={submitting || isCooldownActive}
										/>
									</div>
								</div>
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
							<label className="flex items-start gap-2 text-[12px] cursor-pointer text-muted-foreground leading-relaxed">
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

						<div className="mt-1 flex flex-col gap-2">
							<button
								type="button"
								onClick={handleApprove}
								disabled={!canApprove}
								aria-busy={submitting}
								aria-label="Approve quote"
								className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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
								className="w-full py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
							>
								Decline this quote
							</button>
						</div>
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
