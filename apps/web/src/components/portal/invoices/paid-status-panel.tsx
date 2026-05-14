"use client";

import { CheckCircle2 } from "lucide-react";

import { DownloadPdfButton } from "./download-pdf-button";
import { PaymentReceipt, type ReceiptPayment } from "./payment-receipt";

export interface PaidPanelPayment extends ReceiptPayment {
	status: "pending" | "sent" | "paid" | "refunded" | "overdue" | "cancelled";
}

export interface PaidStatusPanelData {
	invoice: { _id: string };
	businessName: string;
	payments: PaidPanelPayment[];
}

export interface PaidStatusPanelProps {
	data: PaidStatusPanelData;
	hasPdf: boolean;
}

export function PaidStatusPanel({ data, hasPdf }: PaidStatusPanelProps) {
	const paidPayments = data.payments.filter((p) => p.status === "paid");

	return (
		<div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
			<div className="flex items-start gap-2">
				<CheckCircle2
					className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
					aria-hidden="true"
				/>
				<div className="flex-1">
					<h3 className="text-[15px] font-semibold">Paid in full</h3>
					<p className="mt-1 text-[13px]">
						Thank you for your business with {data.businessName}.
					</p>
				</div>
			</div>

			<div className="mt-4 flex flex-col gap-2">
				{paidPayments.length === 0 ? (
					<p className="text-[13px] text-muted-foreground">
						Payment records will appear here.
					</p>
				) : (
					paidPayments.map((p) => (
						<PaymentReceipt key={p._id} payment={p} />
					))
				)}
			</div>

			<div className="mt-5">
				<DownloadPdfButton
					invoiceId={data.invoice._id}
					hasPdf={hasPdf}
					variant="panel"
				/>
			</div>
		</div>
	);
}
