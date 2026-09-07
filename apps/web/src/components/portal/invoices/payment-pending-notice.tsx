"use client";

import { Clock, Lock } from "lucide-react";

import { formatMoney } from "@/lib/portal/format";

export type PaymentPendingKind = "processing" | "succeeded";

const COPY: Record<PaymentPendingKind, { title: string; body: string }> = {
	processing: {
		title: "Your payment is processing",
		body: "Some payment methods take a few business days to clear. This invoice will update on its own once the funds arrive; there is nothing more to do here.",
	},
	succeeded: {
		title: "Payment received",
		body: "Stripe has confirmed your payment and we are processing the receipt. This invoice will show as paid shortly.",
	},
};

/**
 * Replaces the Pay form while a payment is settling or awaiting the webhook
 * that marks it paid. The disabled Pay button keeps the amount visible and
 * makes it clear a second attempt is not needed.
 */
export function PaymentPendingNotice({
	kind,
	paymentAmount,
}: {
	kind: PaymentPendingKind;
	paymentAmount: number;
}) {
	const amountFmt = formatMoney(paymentAmount);
	const copy = COPY[kind];
	return (
		<div className="flex flex-col gap-4">
			<div
				role="status"
				aria-live="polite"
				className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[13px]"
			>
				<Clock
					className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
				<div>
					<p className="font-medium text-foreground">
						{copy.title} · {amountFmt}
					</p>
					<p className="mt-0.5 text-muted-foreground">{copy.body}</p>
				</div>
			</div>
			<button
				type="button"
				disabled
				className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
			>
				Pay {amountFmt}
				<Lock className="h-3.5 w-3.5" aria-hidden="true" />
			</button>
		</div>
	);
}
