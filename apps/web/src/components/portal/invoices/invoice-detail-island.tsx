"use client";

import { useMediaQuery } from "@/hooks/use-media-query";
import { formatMoney } from "@/lib/portal/format";

import { InvoicePaper } from "./invoice-paper";
import {
	InstallmentList,
	type InstallmentRow,
} from "./installment-list";
import { LegacyInvoiceNotice } from "./legacy-invoice-notice";

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

// Returns lowest-sortOrder index whose status indicates it is the next pay
// target. Null when all paid.
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

export interface InvoiceDetailIslandProps {
	data: PortalInvoiceGetData;
	clientPortalId: string;
	hasPdf: boolean;
}

export function InvoiceDetailIsland({
	data,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	clientPortalId,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	hasPdf,
}: InvoiceDetailIslandProps) {
	// Breakpoint mirrors PortalShell md (768px). Use the rail layout on desktop.
	const isDesktop = useMediaQuery("(min-width: 768px)");

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

	const rightRail = (() => {
		if (data.isLegacy) {
			// data.legacyPayUrl is guaranteed non-null on legacy invoices by the
			// backend DTO contract (legacyPayUrl: string | null, never undefined).
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
		return (
			<div className="flex flex-col gap-4">
				<InstallmentList
					installments={data.payments}
					activeIndex={activeIndex}
				/>
				<div className="rounded-xl border border-dashed border-border bg-muted/20 p-5">
					<p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
						Pay
					</p>
					<p className="mt-2 text-[14px] font-semibold">
						{formatMoney(
							data.activePaymentPublic?.paymentAmount ??
								data.paymentSummary.totalRemaining,
						)}{" "}
						due
					</p>
					<p className="mt-1 text-[13px] text-muted-foreground">
						Payment surface loads in Plan 04 — embedded card + bank entry.
					</p>
				</div>
			</div>
		);
	})();

	return (
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
	);
}
