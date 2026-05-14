"use client";

import { useMemo, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Lock, X } from "lucide-react";

import { formatMoney } from "@/lib/portal/format";
import { buildPortalAppearance } from "@/lib/portal/invoices/build-appearance";

import { PaymentErrorBanner } from "./payment-error-banner";
import { PaymentSurface } from "./payment-surface";
import {
	useCreatePaymentIntent,
	type PaymentIntentError,
} from "./use-create-payment-intent";

export interface PaymentBottomSheetActivePayment {
	_id: string;
	paymentAmount: number;
	isLegacy?: boolean;
}

export interface PaymentBottomSheetProps {
	invoiceId: string;
	activePayment: PaymentBottomSheetActivePayment;
	businessName: string;
	stripeChargesEnabled: boolean;
	clientPortalId: string;
}

export function PaymentBottomSheet({
	invoiceId,
	activePayment,
	businessName,
	stripeChargesEnabled,
	clientPortalId,
}: PaymentBottomSheetProps) {
	// All hooks run UNCONDITIONALLY. `enabled` is what gates the PI mint.
	const [paymentSurfaceOpen, setPaymentSurfaceOpen] = useState(false);

	const pi = useCreatePaymentIntent({
		invoiceId,
		enabled:
			paymentSurfaceOpen &&
			stripeChargesEnabled === true &&
			!activePayment?.isLegacy,
	});

	const stripePromise = useMemo<Promise<Stripe | null> | null>(() => {
		if (pi.status !== "ready" || !pi.publishableKey || !pi.stripeAccountId)
			return null;
		return loadStripe(pi.publishableKey, { stripeAccount: pi.stripeAccountId });
	}, [pi.status, pi.publishableKey, pi.stripeAccountId]);

	const appearance = useMemo(() => buildPortalAppearance(), []);

	// Render-time branches.
	if (!stripeChargesEnabled) {
		return (
			<div
				data-sheet-docked
				className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card p-4"
			>
				<PaymentErrorBanner
					error={{
						code: "payments_not_enabled",
						message: "",
						retryAfterSeconds: null,
					}}
					businessName={businessName}
				/>
			</div>
		);
	}
	if (activePayment?.isLegacy) {
		return (
			<div
				data-sheet-docked
				className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card p-4"
			>
				<PaymentErrorBanner
					error={{
						code: "legacy_invoice",
						message: "",
						retryAfterSeconds: null,
					}}
					businessName={businessName}
				/>
			</div>
		);
	}

	const amountFmt = formatMoney(activePayment.paymentAmount);

	if (!paymentSurfaceOpen) {
		return (
			<div
				data-sheet-docked
				className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card"
				style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
			>
				<div className="flex flex-col gap-2 px-4 py-3">
					<div className="flex items-center justify-between">
						<p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
							Total due
						</p>
						<p className="text-[20px] font-semibold tabular-nums">
							{amountFmt}
						</p>
					</div>
					<button
						type="button"
						onClick={() => setPaymentSurfaceOpen(true)}
						className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground hover:bg-primary/90"
					>
						Pay {amountFmt}
						<Lock className="h-3.5 w-3.5" aria-hidden="true" />
					</button>
				</div>
			</div>
		);
	}

	// Expanded sheet — Stripe Elements live inside.
	const bodyContent = (() => {
		if (pi.status === "loading" || pi.status === "idle") {
			return (
				<p className="text-[13px] text-muted-foreground">
					Loading payment surface…
				</p>
			);
		}
		if (pi.status === "error" || !stripePromise || !pi.clientSecret) {
			const errPayload: PaymentIntentError = pi.error ?? {
				code: "internal",
				message: "Couldn't start payment.",
				retryAfterSeconds: null,
			};
			return (
				<PaymentErrorBanner
					error={errPayload}
					businessName={businessName}
					onRetry={pi.retry}
				/>
			);
		}
		return (
			<Elements
				stripe={stripePromise}
				options={{ clientSecret: pi.clientSecret, appearance }}
			>
				<PaymentSurface
					invoiceId={invoiceId}
					clientPortalId={clientPortalId}
					businessName={businessName}
					paymentAmount={activePayment.paymentAmount}
					paymentIntentId={pi.paymentIntentId ?? ""}
				/>
			</Elements>
		);
	})();

	return (
		<>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Pay invoice"
				className="fixed inset-0 z-50 flex items-end bg-black/40"
				onClick={(e) => {
					if (e.target === e.currentTarget) setPaymentSurfaceOpen(false);
				}}
			>
				<div
					data-sheet-docked
					className="z-40 max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-card"
					style={{
						paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
					}}
				>
					<div className="flex items-center justify-center pt-3">
						<div className="h-1 w-9 rounded-full bg-border" />
					</div>
					<div className="flex items-center justify-between px-5 pb-3 pt-2">
						<h2 className="text-[16px] font-semibold">Pay {amountFmt}</h2>
						<button
							type="button"
							aria-label="Close"
							onClick={() => setPaymentSurfaceOpen(false)}
							className="text-muted-foreground hover:text-foreground"
						>
							<X className="h-4 w-4" aria-hidden="true" />
						</button>
					</div>
					<div className="px-5 pb-5">{bodyContent}</div>
				</div>
			</div>
		</>
	);
}
