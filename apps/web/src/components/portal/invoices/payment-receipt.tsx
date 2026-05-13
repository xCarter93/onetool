"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useReducedMotion } from "framer-motion";

import { formatDate, formatMoney } from "@/lib/portal/format";

export interface ReceiptPayment {
	_id: string;
	description: string | null;
	paymentAmount: number;
	paidAt: number | null;
	cardBrand: string | null;
	cardLast4: string | null;
	receiptUrl: string | null;
}

export interface PaymentReceiptProps {
	payment: ReceiptPayment;
}

export function PaymentReceipt({ payment }: PaymentReceiptProps) {
	const [expanded, setExpanded] = useState(false);
	const detailsId = useId();
	const reduceMotion = useReducedMotion();

	const transitionClass = reduceMotion ? "" : "transition-opacity duration-200";

	const label =
		payment.description ??
		(payment.paidAt
			? `Payment · ${formatDate(payment.paidAt)}`
			: "Payment");

	return (
		<div className="rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-900 dark:bg-card">
			<button
				type="button"
				aria-expanded={expanded}
				aria-controls={detailsId}
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center justify-between gap-3 text-left"
			>
				<span className="text-[13px] text-foreground">
					{label} · {formatMoney(payment.paymentAmount)} · Paid{" "}
					{payment.paidAt ? formatDate(payment.paidAt) : "—"}
				</span>
				<span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
					{expanded ? "Hide receipt" : "View receipt"}
					{expanded ? (
						<ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
					) : (
						<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
					)}
				</span>
			</button>
			{expanded ? (
				<div
					id={detailsId}
					data-payment-receipt-details
					className={`mt-3 border-t border-emerald-100 pt-3 text-[13px] dark:border-emerald-900 ${transitionClass}`}
				>
					{payment.cardBrand && payment.cardLast4 ? (
						<p className="text-foreground">
							{payment.cardBrand.toUpperCase()} ···· {payment.cardLast4}
						</p>
					) : null}
					{payment.receiptUrl ? (
						<a
							href={payment.receiptUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="mt-1.5 inline-flex items-center gap-1 text-emerald-800 hover:underline dark:text-emerald-200"
						>
							View full receipt
							<ExternalLink className="h-3 w-3" aria-hidden="true" />
						</a>
					) : (
						<p className="mt-1.5 text-muted-foreground">
							Receipt details not yet available.
						</p>
					)}
				</div>
			) : null}
		</div>
	);
}
