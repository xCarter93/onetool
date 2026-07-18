"use client";

import type { ReactNode } from "react";
import Image from "next/image";

import { Card, CardContent } from "@/components/ui/card";
import { Item, ItemMedia } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/domain/status-badge";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/portal/format";

import { TotalsBreakdown } from "../totals-breakdown";

export type InvoiceDisplayStatus = "awaiting" | "partial" | "paid" | "overdue";

const STATUS_ROLE: Record<
	InvoiceDisplayStatus,
	"success" | "warning" | "danger" | "info"
> = {
	paid: "success",
	partial: "warning",
	overdue: "danger",
	awaiting: "info",
};

const STATUS_LABEL: Record<InvoiceDisplayStatus, string> = {
	paid: "Paid",
	partial: "Partially paid",
	overdue: "Overdue",
	awaiting: "Awaiting payment",
};

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
	discountAmount: number | null;
	total: number;
	paidAt: number | null;
}

export interface InvoicePaperPaymentSummary {
	totalPaid: number;
	totalRemaining: number;
	installmentCount: number;
}

export interface InvoicePaperProps {
	invoice: InvoicePaperInvoice;
	lineItems: InvoicePaperLineItem[];
	businessName: string;
	businessLogoUrl: string | null;
	clientName: string;
	clientEmail: string;
	displayStatus: InvoiceDisplayStatus;
	paymentSummary: InvoicePaperPaymentSummary;
	/** Installment list + Stripe pay surface (desktop) — mounted unchanged. */
	paySlot: ReactNode;
}

export function InvoicePaper({
	invoice,
	lineItems,
	businessName,
	businessLogoUrl,
	clientName,
	clientEmail,
	displayStatus,
	paymentSummary,
	paySlot,
}: InvoicePaperProps) {
	const heroIsPaid = displayStatus === "paid";
	const heroLabel = heroIsPaid ? "Total paid" : "Total due";
	const heroAmount = heroIsPaid ? invoice.total : paymentSummary.totalRemaining;
	const showProgress =
		!heroIsPaid &&
		paymentSummary.totalPaid > 0 &&
		paymentSummary.installmentCount > 1;

	return (
		<Card data-portal-paper-invoice className="mx-auto w-full max-w-4xl">
			<CardContent>
				<div className="grid grid-cols-1 gap-8 md:grid-cols-[18rem_minmax(0,1fr)] md:gap-10">
					{/* Sidebar: brand + status, hero total, metadata, pay surface */}
					<aside className="flex flex-col gap-5 md:border-r md:border-border md:pr-8">
						<div className="flex items-center justify-between gap-3">
							<div className="flex min-w-0 items-center gap-3">
								<Item
									variant="muted"
									size="sm"
									className="size-9 shrink-0 items-center justify-center overflow-hidden rounded-md p-0"
									aria-hidden="true"
								>
									<ItemMedia variant="image" className="size-full">
										{businessLogoUrl ? (
											<Image
												src={businessLogoUrl}
												alt=""
												width={36}
												height={36}
												className="size-full object-contain"
												unoptimized
											/>
										) : null}
									</ItemMedia>
								</Item>
								<span className="truncate text-[14px] font-semibold text-foreground">
									{businessName}
								</span>
							</div>
							<StatusBadge role={STATUS_ROLE[displayStatus]}>
								{STATUS_LABEL[displayStatus]}
							</StatusBadge>
						</div>

						<div className="flex flex-col gap-1.5">
							<span className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
								{heroLabel}
							</span>
							<span className="text-3xl leading-none font-bold tracking-tight tabular-nums text-foreground md:text-4xl">
								{formatMoney(heroAmount)}
							</span>
							{heroIsPaid && invoice.paidAt ? (
								<span className="text-xs text-muted-foreground">
									on {formatDate(invoice.paidAt)}
								</span>
							) : null}
						</div>

						<Separator />

						<div className="flex flex-col gap-4">
							<MetaSection label="Invoice">
								<p className="font-mono text-sm tabular-nums text-foreground">
									#{invoice.invoiceNumber}
								</p>
							</MetaSection>
							<MetaSection label="Issued">
								<p className="text-sm font-medium text-foreground">
									{formatDate(invoice.issuedDate)}
								</p>
							</MetaSection>
							<MetaSection label="Due">
								<p className="text-sm font-medium text-foreground">
									{formatDate(invoice.dueDate)}
								</p>
							</MetaSection>
							<MetaSection label="Bill To">
								<p className="text-sm font-medium text-foreground">
									{clientName}
								</p>
								{clientEmail ? (
									<p className="text-xs text-muted-foreground">{clientEmail}</p>
								) : null}
							</MetaSection>
							{showProgress ? (
								<MetaSection label="Payment Progress">
									<p className="text-sm font-medium text-foreground">
										{formatMoney(paymentSummary.totalPaid)} paid
									</p>
									<p className="text-xs text-muted-foreground">
										{formatMoney(paymentSummary.totalRemaining)} remaining
									</p>
								</MetaSection>
							) : null}
						</div>

						<Separator />

						{paySlot}
					</aside>

					{/* Main: line items + totals */}
					<div className="flex min-w-0 flex-col gap-6">
						<div className="flex flex-col gap-4">
							<div className="flex items-baseline justify-between gap-3">
								<span className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
									Line Items
								</span>
								<span className="text-xs text-muted-foreground">
									{lineItems.length}{" "}
									{lineItems.length === 1 ? "item" : "items"}
								</span>
							</div>
							<div className="flex flex-col divide-y divide-border">
								{lineItems.map((li, i) => (
									<LineItemRow
										key={li._id ?? i}
										item={li}
										isFirst={i === 0}
										isLast={i === lineItems.length - 1}
									/>
								))}
							</div>
						</div>

						<Separator />

						<TotalsBreakdown
							subtotal={invoice.subtotal}
							discount={invoice.discountAmount}
							tax={invoice.taxAmount}
							total={invoice.total}
							className="sm:ml-auto sm:w-72"
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function MetaSection({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
				{label}
			</span>
			<div className="flex flex-col gap-0.5">{children}</div>
		</div>
	);
}

function LineItemRow({
	item,
	isFirst,
	isLast,
}: {
	item: InvoicePaperLineItem;
	isFirst: boolean;
	isLast: boolean;
}) {
	return (
		<div
			className={cn(
				"flex items-start justify-between gap-4",
				isFirst ? "pt-0" : "pt-4",
				isLast ? "pb-0" : "pb-4",
			)}
		>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-semibold text-foreground">
					{item.description}
				</p>
				<p className="mt-0.5 text-xs text-muted-foreground">
					Qty {item.quantity} · {formatMoney(item.unitPrice)} each
				</p>
			</div>
			<span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
				{formatMoney(item.total)}
			</span>
		</div>
	);
}
