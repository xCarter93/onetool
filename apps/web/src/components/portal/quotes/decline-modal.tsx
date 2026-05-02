"use client";

/**
 * DeclineModal — confirmation dialog for declining a quote. Reason chips
 * pre-fill the textarea (only if textarea is empty or matches the previous
 * chip). Empty reason is allowed (RESEARCH Pitfall 9 — empty decline is
 * legitimate). Submission state managed by parent via onConfirm Promise.
 */

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const REASON_CHIPS = [
	"Too expensive",
	"Going with another vendor",
	"Timing isn't right",
	"Scope doesn't match what I need",
] as const;

export type DeclineModalConfirmResult =
	| { ok: true }
	| { ok: false; error: { code: string; message: string } };

export interface DeclineModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/**
	 * Returns a discriminant — the modal closes ONLY when `result.ok === true`.
	 * On `ok: false`, the modal stays open and surfaces `error.message` inline
	 * via `submitError`. Plan 14-07 / UAT Gap 3.
	 */
	onConfirm: (reason?: string) => Promise<DeclineModalConfirmResult>;
	businessName: string;
}

export function DeclineModal({
	open,
	onOpenChange,
	onConfirm,
	businessName,
}: DeclineModalProps) {
	const [reason, setReason] = useState("");
	const [activeChip, setActiveChip] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	// REVIEWS-mandated (WR-04): inline error surface so a future onConfirm
	// that throws does not leave the dialog open with no feedback.
	const [submitError, setSubmitError] = useState<string | null>(null);
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) {
			setReason("");
			setActiveChip(null);
			setSubmitting(false);
			setSubmitError(null);
			return;
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !submitting) onOpenChange(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, submitting, onOpenChange]);

	if (!open) return null;

	const handleChipClick = (chip: string) => {
		// Pre-fill only if textarea is empty or matches the previous chip
		if (reason === "" || reason === activeChip) {
			setReason(chip);
			setActiveChip(chip);
		} else {
			// Free-typed text never overwritten — just track which chip is now active
			setActiveChip(chip);
		}
	};

	const handleConfirm = async () => {
		if (submitting) return;
		setSubmitting(true);
		setSubmitError(null);
		try {
			const trimmed = reason.trim();
			const result = await onConfirm(trimmed.length > 0 ? trimmed : undefined);
			if (result.ok) {
				onOpenChange(false);
			} else {
				// Plan 14-07 / UAT Gap 3: keep the dialog open and surface the
				// failure inline so the user can retry or read the error.
				setSubmitError(
					result.error.message || "Failed to decline. Try again.",
				);
			}
		} catch (err) {
			// Defensive: a future caller might still throw; never silently close.
			setSubmitError(
				err instanceof Error ? err.message : "Failed to decline. Try again.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="decline-modal-title"
			className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
			onClick={(e) => {
				if (e.target === e.currentTarget && !submitting) onOpenChange(false);
			}}
		>
			<div
				ref={dialogRef}
				className="w-full max-w-md rounded-2xl bg-card border border-border shadow-lg p-6"
			>
				<div className="flex items-start justify-between gap-4">
					<h2
						id="decline-modal-title"
						className="text-[20px] font-semibold leading-[1.25]"
					>
						Decline this quote?
					</h2>
					<button
						type="button"
						aria-label="Close"
						disabled={submitting}
						onClick={() => onOpenChange(false)}
						className="text-muted-foreground hover:text-foreground"
					>
						<X className="h-4 w-4" aria-hidden="true" />
					</button>
				</div>

				<p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
					Let {businessName} know why — this is shared with them so they can
					follow up if it makes sense.
				</p>

				<div className="mt-4 flex flex-wrap gap-2">
					{REASON_CHIPS.map((chip) => {
						const active = activeChip === chip;
						return (
							<button
								key={chip}
								type="button"
								onClick={() => handleChipClick(chip)}
								className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
									active
										? "bg-primary text-primary-foreground border-primary"
										: "bg-card text-muted-foreground border-border hover:bg-muted"
								}`}
							>
								{chip}
							</button>
						);
					})}
				</div>

				<div className="mt-4">
					<label
						htmlFor="decline-reason"
						className="block text-[13px] font-medium text-foreground"
					>
						Add a note (optional)
					</label>
					<textarea
						id="decline-reason"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						placeholder="Anything else you'd like to share?"
						rows={3}
						className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/30"
					/>
				</div>

				{submitError && (
					<p
						role="alert"
						className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700"
					>
						{submitError}
					</p>
				)}

				<div className="mt-6 flex items-center justify-end gap-2">
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
						className="rounded-md px-4 py-2 text-[14px] font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
					>
						Keep quote
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={submitting}
						className="rounded-md bg-red-600 px-4 py-2 text-[14px] font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
					>
						{submitting ? "Declining…" : "Decline quote"}
					</button>
				</div>
			</div>
		</div>
	);
}
