"use client";

import { useMemo, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Lock } from "lucide-react";

import { formatMoney } from "@/lib/portal/format";
import { buildPortalAppearance } from "@/lib/portal/invoices/build-appearance";

import { PaymentErrorBanner } from "./payment-error-banner";
import { PaymentSurface } from "./payment-surface";
import { useCreatePaymentIntent } from "./use-create-payment-intent";

export interface PaymentRailActivePayment {
	_id: string;
	paymentAmount: number;
	isLegacy?: boolean;
}

export interface PaymentRailProps {
	invoiceId: string;
	activePayment: PaymentRailActivePayment;
	businessName: string;
	stripeChargesEnabled: boolean;
	clientPortalId: string;
}

export function PaymentRail({
	invoiceId,
	activePayment,
	businessName,
	stripeChargesEnabled,
	clientPortalId,
}: PaymentRailProps) {
	// All hooks run UNCONDITIONALLY in stable order. The `enabled` flag below is
	// what gates the PI fetch — never an early return placed above a hook.
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
		// stripeAccount goes on loadStripe — NOT on Elements options.
		return loadStripe(pi.publishableKey, { stripeAccount: pi.stripeAccountId });
	}, [pi.status, pi.publishableKey, pi.stripeAccountId]);

	const appearance = useMemo(() => buildPortalAppearance(), []);

	// Render-time branches (all hooks have already run above).
	if (!stripeChargesEnabled) {
		return (
			<div data-payment-rail>
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
			<div data-payment-rail>
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

	if (!paymentSurfaceOpen) {
		const amountFmt = formatMoney(activePayment.paymentAmount);
		return (
			<div data-payment-rail className="sticky top-4 flex flex-col gap-4 p-4">
				<button
					type="button"
					onClick={() => setPaymentSurfaceOpen(true)}
					className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground hover:bg-primary/90"
				>
					Pay {amountFmt}
					<Lock className="h-3.5 w-3.5" aria-hidden="true" />
				</button>
				<p className="text-center text-[12px] text-muted-foreground">
					Secure payment powered by Stripe.
				</p>
			</div>
		);
	}

	if (pi.status === "loading" || pi.status === "idle") {
		return (
			<div
				data-payment-rail
				className="sticky top-4 p-4 text-[13px] text-muted-foreground"
			>
				Loading payment surface…
			</div>
		);
	}

	if (pi.status === "error" || !stripePromise || !pi.clientSecret) {
		return (
			<div data-payment-rail className="sticky top-4 p-4">
				<PaymentErrorBanner
					error={
						pi.error ?? {
							code: "internal",
							message: "Couldn't start payment.",
							retryAfterSeconds: null,
						}
					}
					businessName={businessName}
					onRetry={pi.retry}
				/>
			</div>
		);
	}

	return (
		<div
			data-payment-rail
			className="sticky top-4 flex flex-col gap-4 p-4"
		>
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
		</div>
	);
}
