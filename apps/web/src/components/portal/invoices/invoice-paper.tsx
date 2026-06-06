"use client";

import Image from "next/image";

import { formatDate, formatMoney } from "@/lib/portal/format";

export interface InvoicePaperLineItem {
	_id?: string;
	description: string;
	quantity: number;
	unitPrice: number;
	total: number;
	sortOrder: number;
}

export interface InvoicePaperInvoice {
	invoiceNumber: string;
	issuedDate: number;
	dueDate: number;
	subtotal: number;
	taxAmount: number | null;
	total: number;
}

export interface InvoicePaperProps {
	invoice: InvoicePaperInvoice;
	lineItems: InvoicePaperLineItem[];
	businessName: string;
	businessLogoUrl: string | null;
	clientName: string;
	clientEmail: string;
}

export function InvoicePaper({
	invoice,
	lineItems,
	businessName,
	businessLogoUrl,
	clientName,
	clientEmail,
}: InvoicePaperProps) {
	const tax = invoice.taxAmount ?? 0;
	return (
		<div
			data-portal-paper-invoice
			className="mx-auto max-w-[760px] rounded-2xl border border-border bg-card p-6 shadow-xs md:p-9"
		>
			<div className="flex items-start justify-between gap-6">
				<div className="flex items-center gap-3">
					{businessLogoUrl ? (
						<Image
							src={businessLogoUrl}
							alt=""
							width={40}
							height={40}
							className="h-10 w-10 rounded-md object-contain"
							unoptimized
						/>
					) : (
						<div className="h-10 w-10 rounded-md bg-muted" aria-hidden="true" />
					)}
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
							INVOICE #{invoice.invoiceNumber}
						</p>
						<div className="mt-1 text-[16px] font-semibold leading-[1.15]">
							{businessName}
						</div>
					</div>
				</div>
				<div className="text-right text-[12px] text-muted-foreground">
					<div>Bill to</div>
					<div className="mt-1 font-medium text-foreground">{clientName}</div>
					{clientEmail ? <div className="mt-0.5">{clientEmail}</div> : null}
				</div>
			</div>

			<div className="mt-6 grid grid-cols-2 gap-6 border-y border-border py-4">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
						Issued
					</p>
					<p className="mt-1 text-[14px] font-medium">
						{formatDate(invoice.issuedDate)}
					</p>
				</div>
				<div className="text-right">
					<p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
						Due
					</p>
					<p className="mt-1 text-[14px] font-medium">
						{formatDate(invoice.dueDate)}
					</p>
				</div>
			</div>

			<div className="mt-6">
				<table className="w-full border-collapse">
					<thead>
						<tr className="border-b-2 border-foreground">
							<th className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-2.5">
								Description
							</th>
							<th className="text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-2.5 w-[60px]">
								Qty
							</th>
							<th className="text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-2.5 w-[110px]">
								Unit Price
							</th>
							<th className="text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground py-2.5 w-[110px]">
								Amount
							</th>
						</tr>
					</thead>
					<tbody>
						{lineItems.map((li, i) => (
							<tr
								key={li._id ?? i}
								className="border-b border-border last:border-b-0"
							>
								<td className="py-4 align-top">
									<div className="text-[14px] font-semibold">
										{li.description}
									</div>
								</td>
								<td className="py-4 align-top text-right text-[14px] tabular-nums">
									{li.quantity}
								</td>
								<td className="py-4 align-top text-right text-[14px] tabular-nums">
									{formatMoney(li.unitPrice)}
								</td>
								<td className="py-4 align-top text-right text-[14px] font-semibold tabular-nums">
									{formatMoney(li.total)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="mt-6 border-t-2 border-foreground pt-4 flex flex-col items-end gap-1.5">
				<div className="flex items-center gap-8 text-[14px]">
					<span className="text-muted-foreground">Subtotal</span>
					<span className="tabular-nums">{formatMoney(invoice.subtotal)}</span>
				</div>
				{tax > 0 ? (
					<div className="flex items-center gap-8 text-[14px]">
						<span className="text-muted-foreground">Tax</span>
						<span className="tabular-nums">{formatMoney(tax)}</span>
					</div>
				) : null}
				<div
					data-paper-total
					className="flex items-center gap-8 text-[16px] font-semibold border-t border-foreground pt-2 mt-1"
				>
					<span>Total</span>
					<span className="tabular-nums">{formatMoney(invoice.total)}</span>
				</div>
			</div>
		</div>
	);
}
