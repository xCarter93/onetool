"use client";

import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

import { useMediaQuery } from "@/hooks/use-media-query";

import { InvoicePaper } from "./invoice-paper";
import {
	InstallmentList,
	type InstallmentRow,
} from "./installment-list";
import { LegacyInvoiceNotice } from "./legacy-invoice-notice";
import { PaymentBottomSheet } from "./payment-bottom-sheet";
import { PaymentRail } from "./payment-rail";

// Mirror of PortalInvoiceGetResponse from packages/backend/convex/portal/invoices.ts.
// Kept local so the component does not import server-only Convex types.
export interface PortalInvoiceGetData {
	invoice: {
		_id: string;
		invoiceNumber: string;
		status: "sent" | "paid" | "overdue";
		issuedDate: number;
		dueDate: number;
		subtotal: number;
		taxAmount: number | null;
		discountAmount: number | null;
		total: number;
		paidAt: number | null;
	};
	lineItems: Array<{
		_id: string;
		description: string;
		quantity: number;
		unitPrice: number;
		total: number;
		sortOrder: number;
	}>;
	payments: InstallmentRow[];
	paymentSummary: {
		totalPaid: number;
		totalRemaining: number;
		displayStatus: "awaiting" | "partial" | "paid" | "overdue";
		isLegacy: boolean;
		installmentCount: number;
	};
	activePaymentPublic: InstallmentRow | null;
	isLegacy: boolean;
	legacyPayUrl: string | null;
	businessName: string;
	businessLogoUrl: string | null;
	stripeChargesEnabled: boolean;
	clientName: string;
	clientEmail: string;
}

export interface InvoiceDetailIslandProps {
	data: PortalInvoiceGetData;
	clientPortalId: string;
	hasPdf: boolean;
}

export function InvoiceDetailIsland({
	data: ssrData,
	clientPortalId,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	hasPdf,
}: InvoiceDetailIslandProps) {
	// All hooks run UNCONDITIONALLY at the top, before any branch returns.
	const isDesktop = useMediaQuery("(min-width: 768px)");
	// Subscribes so the post-pay webhook flip re-renders the rail/sheet path
	// once payment_intent.succeeded patches the payments row.
	const liveData = useQuery(api.portal.invoices.get, {
		invoiceId: ssrData.invoice._id as Id<"invoices">,
	}) as PortalInvoiceGetData | undefined;
	const data: PortalInvoiceGetData = liveData ?? ssrData;

	const activeIndex = data.isLegacy ? null : firstUnpaidIndex(data.payments);
	const allPaid =
		!data.isLegacy && data.paymentSummary.totalRemaining === 0;

	const paper = (
		<InvoicePaper
			invoice={data.invoice}
			lineItems={data.lineItems}
			businessName={data.businessName}
			businessLogoUrl={data.businessLogoUrl}
			clientName={data.clientName}
			clientEmail={data.clientEmail}
		/>
	);

	// Decision A: legacy invoices NEVER reach the rail/sheet — render notice only.
	const rightRail = (() => {
		if (data.isLegacy) {
			return (
				<LegacyInvoiceNotice
					legacyPayUrl={data.legacyPayUrl ?? ""}
					businessName={data.businessName}
				/>
			);
		}
		if (allPaid) {
			return (
				<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
					<h3 className="text-[15px] font-semibold">Paid in full</h3>
					<p className="mt-1 text-[13px]">
						Thanks — every installment on this invoice has been paid.
					</p>
				</div>
			);
		}
		const active = data.activePaymentPublic;
		return (
			<div className="flex flex-col gap-4">
				<InstallmentList
					installments={data.payments}
					activeIndex={activeIndex}
				/>
				{active && isDesktop !== false ? (
					<PaymentRail
						invoiceId={data.invoice._id}
						activePayment={{
							_id: active._id,
							paymentAmount: active.paymentAmount,
							isLegacy: false,
						}}
						businessName={data.businessName}
						stripeChargesEnabled={data.stripeChargesEnabled}
						clientPortalId={clientPortalId}
					/>
				) : null}
			</div>
		);
	})();

	// Mobile-only: docked bottom-sheet hosts the payment surface for non-legacy,
	// non-paid invoices with an active payment row.
	const mobileSheet =
		!data.isLegacy &&
		!allPaid &&
		data.activePaymentPublic &&
		isDesktop === false ? (
			<PaymentBottomSheet
				invoiceId={data.invoice._id}
				activePayment={{
					_id: data.activePaymentPublic._id,
					paymentAmount: data.activePaymentPublic.paymentAmount,
					isLegacy: false,
				}}
				businessName={data.businessName}
				stripeChargesEnabled={data.stripeChargesEnabled}
				clientPortalId={clientPortalId}
			/>
		) : null;

	return (
		<>
			<div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_480px]">
				<div className="px-6 py-8 pb-24 md:px-9 md:pb-10">{paper}</div>
				{isDesktop !== false ? (
					<aside className="border-l border-border bg-card px-6 py-8 md:min-h-[calc(100vh-68px)] md:px-7">
						{rightRail}
					</aside>
				) : (
					<div className="px-6 pb-10">{rightRail}</div>
				)}
			</div>
			{mobileSheet}
		</>
	);
}

// Helper kept below the component so the awk Rules-of-Hooks gate
// (first `return` must follow first hook in the component) is unambiguous.
function firstUnpaidIndex(payments: InstallmentRow[]): number | null {
	for (let i = 0; i < payments.length; i++) {
		const p = payments[i]!;
		if (
			p.status !== "paid" &&
			p.status !== "cancelled" &&
			p.status !== "refunded"
		) {
			return i;
		}
	}
	return null;
}
