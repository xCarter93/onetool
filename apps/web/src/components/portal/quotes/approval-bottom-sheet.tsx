"use client";

/**
 * ApprovalBottomSheet — mobile equivalent of ApprovalRail. Docked CTA strip
 * is always visible; tapping Approve expands the sheet to ~85vh revealing
 * the signature card. Shares decision logic with ApprovalRail via the
 * `useQuoteDecision` hook (REVIEWS DRY).
 *
 * Critical (RESEARCH Pitfall 4): SignatureCard mounts ONLY while the sheet
 * is expanded — prevents touch-scroll fight in docked state.
 */

import { useMemo, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

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

export interface ApprovalBottomSheetProps {
	quote: {
		_id: string;
		quoteNumber?: string;
		title?: string;
		status: string;
		total: number;
		validUntil?: number;
	};
	latestDocument: { _id: string; version: number } | null;
	businessName: string;
	clientName: string;
	clientEmail: string;
	initialReceipt?: ApprovalReceiptType;
	/**
	 * Plan 14-10 Gap 6 mirror — see ApprovalRail. When set, the docked CTA
	 * collapses to a passive resolved-status strip and the expanded sheet (if
	 * reached) renders ResolvedStatusPanel rather than the form.
	 */
	resolvedFallback?: {
		action: "approved" | "declined";
		resolvedAt: number;
		total: number;
	};
	/**
	 * REVIEWS-mandated (CR-04): see ApprovalRail. Blocks submission while a
	 * mid-session document drift is unacknowledged.
	 */
	documentDrifted?: boolean;
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

export function ApprovalBottomSheet({
	quote,
	latestDocument,
	businessName,
	clientName,
	clientEmail,
	initialReceipt,
	resolvedFallback,
	documentDrifted = false,
}: ApprovalBottomSheetProps) {
	const [expanded, setExpanded] = useState(false);
	const [signaturePayload, setSignaturePayload] =
		useState<SignaturePayload>(NON_USABLE);
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

	const effectiveReceipt: ApprovalReceiptType | undefined =
		receipt ?? initialReceipt;

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
		// Stale and rate_limited are surfaced at the sheet layer (banners) —
		// let the modal close so the louder UI is visible. Other codes
		// (unauthenticated / not_pending / unknown) keep the modal open.
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

	// Receipt panel mode — show inline above docked strip
	if (effectiveReceipt) {
		return (
			<div
				data-sheet-docked
				className="fixed inset-x-0 bottom-0 z-40 bg-card border-t border-border p-4"
				style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
			>
				<ApprovalReceipt
					receipt={effectiveReceipt}
					clientName={clientName}
					clientEmail={clientEmail}
				/>
			</div>
		);
	}

	// Plan 14-10 Gap 6: resolved-but-no-receipt fallback. Renders the
	// ResolvedStatusPanel inline in the docked region; no expand interaction
	// because there is nothing to approve. Sticky page header still shows the
	// status pill so this surface is intentionally minimal.
	if (resolvedFallback) {
		return (
			<div
				data-sheet-docked
				className="fixed inset-x-0 bottom-0 z-40 bg-card border-t border-border p-4"
				style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
			>
				<ResolvedStatusPanel
					action={resolvedFallback.action}
					resolvedAt={resolvedFallback.resolvedAt}
					total={resolvedFallback.total}
					clientName={clientName}
				/>
			</div>
		);
	}

	return (
		<>
			{/* Docked strip (always visible) — z-40 + data-sheet-docked (Gap 4) */}
			<div
				data-sheet-docked
				className="fixed inset-x-0 bottom-0 z-40 bg-card border-t border-border"
				style={{
					minHeight: "72px",
					paddingBottom: "env(safe-area-inset-bottom)",
				}}
			>
				<div className="px-4 py-3 flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
							Quote total
						</p>
						<p className="text-[20px] font-semibold tabular-nums">
							{formatMoney(quote.total)}
						</p>
					</div>
					<button
						type="button"
						onClick={() => setExpanded(true)}
						disabled={submitting}
						className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-3 text-[14px] font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
					>
						<Check className="h-3.5 w-3.5" aria-hidden="true" />
						Approve quote
					</button>
				</div>
			</div>

			{/* Expanded sheet */}
			{expanded && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Approve quote"
					className="fixed inset-0 z-50 bg-black/40 flex items-end"
					onClick={(e) => {
						if (e.target === e.currentTarget && !submitting) {
							setExpanded(false);
						}
					}}
				>
					<div
						className="w-full bg-card rounded-t-2xl max-h-[85vh] overflow-y-auto"
						style={{
							paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
						}}
					>
						<div className="flex items-center justify-center pt-3">
							<div className="h-1 w-9 rounded-full bg-border" />
						</div>
						<div className="flex items-center justify-between px-5 pt-2 pb-4">
							<h2 className="text-[16px] font-semibold">Approve quote</h2>
							<button
								type="button"
								aria-label="Close"
								onClick={() => setExpanded(false)}
								className="text-muted-foreground hover:text-foreground"
							>
								<X className="h-4 w-4" aria-hidden="true" />
							</button>
						</div>

						<div className="px-5 flex flex-col gap-4 pb-6">
							{error?.code === "stale" ? (
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

									<label className="flex items-start gap-2 text-[13px] cursor-pointer">
										<input
											type="checkbox"
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
												checked={intentAffirmed}
												onChange={(e) => setIntentAffirmed(e.target.checked)}
												disabled={submitting || isCooldownActive}
												className="mt-0.5"
											/>
											<span>
												By typing my name and clicking Approve, I am signing
												this quote electronically. I agree that my electronic
												signature is the legal equivalent of my manual signature
												on this quote.
											</span>
										</label>
									)}

									<button
										type="button"
										onClick={handleApprove}
										disabled={!canApprove}
										aria-busy={submitting}
										className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-3 text-[14px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
									>
										{submitting ? (
											<Loader2
												className="h-4 w-4 animate-spin"
												aria-hidden="true"
											/>
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
						</div>
					</div>
				</div>
			)}

			<DeclineModal
				open={declineOpen}
				onOpenChange={setDeclineOpen}
				onConfirm={handleDecline}
				businessName={businessName}
			/>
		</>
	);
}
