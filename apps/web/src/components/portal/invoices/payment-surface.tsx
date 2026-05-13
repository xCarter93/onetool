"use client";

import { useCallback, useState } from "react";
import {
	ExpressCheckoutElement,
	PaymentElement,
	useElements,
	useStripe,
} from "@stripe/react-stripe-js";
import type { StripeError } from "@stripe/stripe-js";
import { Lock } from "lucide-react";

import { formatMoney } from "@/lib/portal/format";

export interface PaymentSurfaceProps {
	invoiceId: string;
	clientPortalId: string;
	businessName: string;
	paymentAmount: number;
	paymentIntentId: string;
}

export function PaymentSurface({
	invoiceId,
	clientPortalId,
	businessName,
	paymentAmount,
	paymentIntentId,
}: PaymentSurfaceProps) {
	const stripe = useStripe();
	const elements = useElements();
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<StripeError | null>(null);
	const [processingHint, setProcessingHint] = useState(false);

	// return_url uses the Stripe PaymentIntent id (cross-ref key for post-3DS),
	// never the Convex payment row id.
	const returnUrl =
		typeof window !== "undefined"
			? `${window.location.origin}/portal/c/${clientPortalId}/invoices/${invoiceId}?pi=${paymentIntentId}`
			: `/portal/c/${clientPortalId}/invoices/${invoiceId}?pi=${paymentIntentId}`;

	const confirm = useCallback(async () => {
		if (!stripe || !elements) return;
		const { error: confirmErr, paymentIntent } = await stripe.confirmPayment({
			elements,
			confirmParams: { return_url: returnUrl },
			redirect: "if_required",
		});
		if (confirmErr) {
			setError(confirmErr);
			return;
		}
		if (paymentIntent?.status === "succeeded") {
			setProcessingHint(true);
		}
	}, [stripe, elements, returnUrl]);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!stripe || !elements || submitting) return;
		setSubmitting(true);
		setError(null);
		await confirm();
		setSubmitting(false);
	};

	const onExpressConfirm = async () => {
		setError(null);
		await confirm();
	};

	const amountFmt = formatMoney(paymentAmount);

	return (
		<form onSubmit={onSubmit} className="flex flex-col gap-4">
			<ExpressCheckoutElement onConfirm={onExpressConfirm} />
			<div className="text-center text-[12px] text-muted-foreground">
				or pay with card
			</div>
			<PaymentElement options={{ layout: "tabs" }} />
			{error ? (
				<p role="alert" className="text-[13px] text-rose-700">
					{error.message ?? "Payment couldn't be processed."}
				</p>
			) : null}
			{processingHint ? (
				<p className="text-[13px] text-muted-foreground">
					Processing… confirming with your bank.
				</p>
			) : null}
			<button
				type="submit"
				disabled={!stripe || submitting}
				aria-describedby="pay-authorization-footer"
				className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
			>
				{submitting ? "Processing…" : `Pay ${amountFmt}`}
				<Lock className="h-3.5 w-3.5" aria-hidden="true" />
			</button>
			<p
				id="pay-authorization-footer"
				className="text-center text-[13px] text-muted-foreground"
			>
				By paying, you agree to {businessName}&rsquo;s terms and authorize a
				charge of {amountFmt} to your payment method.
			</p>
		</form>
	);
}
