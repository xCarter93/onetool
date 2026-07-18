"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

import { useMediaQuery } from "@/hooks/use-media-query";
import { formatMoney } from "@/lib/portal/format";

import { DownloadPdfButton } from "./download-pdf-button";
import { InvoicePaper } from "./invoice-paper";
import {
	InstallmentList,
	type InstallmentRow,
} from "./installment-list";
import { PaidStatusPanel } from "./paid-status-panel";
import { PaidSuccessOverlay } from "./paid-success-overlay";
import { PaymentBottomSheet } from "./payment-bottom-sheet";
import { PaymentRail } from "./payment-rail";
import { PrintButton } from "./print-button";

const CELEBRATION_DURATION_MS = 1900;

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

	const activeIndex = data.paymentSummary.isLegacy
		? null
		: firstUnpaidIndex(data.payments);
	const allPaid =
		!data.paymentSummary.isLegacy && data.paymentSummary.totalRemaining === 0;

	const [celebration, setCelebration] = useState<{
		message: string;
		subline?: string;
	} | null>(null);
	const prevActiveIdRef = useRef<string | null>(null);
	const prevActiveAmountRef = useRef<number | null>(null);
	const prevAllPaidRef = useRef<boolean>(false);
	const initializedRef = useRef(false);

	const activeId = data.activePaymentPublic?._id ?? null;
	const activeAmount = data.activePaymentPublic?.paymentAmount ?? null;

	useEffect(() => {
		if (!initializedRef.current) {
			initializedRef.current = true;
			prevActiveIdRef.current = activeId;
			prevActiveAmountRef.current = activeAmount;
			prevAllPaidRef.current = allPaid;
			return;
		}

		const prevId = prevActiveIdRef.current;
		const prevAmount = prevActiveAmountRef.current;
		const prevAllPaid = prevAllPaidRef.current;

		const settledFinal = !prevAllPaid && allPaid;
		const settledOne = prevId !== null && activeId !== null && activeId !== prevId;

		if (settledFinal) {
			setCelebration({
				message: "Invoice paid in full",
				subline: `Thank you for your business with ${data.businessName}.`,
			});
		} else if (settledOne) {
			setCelebration({
				message: "Payment received",
				subline:
					prevAmount != null ? `${formatMoney(prevAmount)} confirmed` : undefined,
			});
		}

		prevActiveIdRef.current = activeId;
		prevActiveAmountRef.current = activeAmount;
		prevAllPaidRef.current = allPaid;
	}, [activeId, activeAmount, allPaid, data.businessName]);

	useEffect(() => {
		if (!celebration) return;
		const timer = setTimeout(
			() => setCelebration(null),
			CELEBRATION_DURATION_MS,
		);
		return () => clearTimeout(timer);
	}, [celebration]);

	// Zero-payment-row invoices fall through to the normal render: an empty
	// installment list with no pay surface (view-only).
	const baseRail = (() => {
		if (allPaid) {
			return (
				<PaidStatusPanel
					data={{
						invoice: { _id: data.invoice._id },
						businessName: data.businessName,
						payments: data.payments,
					}}
					hasPdf={hasPdf}
				/>
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
						// Key on active._id so paymentSurfaceOpen resets between installments.
						key={active._id}
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

	const rightRail = (
		<AnimatePresence mode="wait" initial={false}>
			{celebration ? (
				<PaidSuccessOverlay
					key="paid-success-overlay"
					message={celebration.message}
					subline={celebration.subline}
				/>
			) : (
				<motion.div
					key="rail-content"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
				>
					{baseRail}
				</motion.div>
			)}
		</AnimatePresence>
	);

	// Mobile-only: docked bottom-sheet hosts the payment surface for non-legacy,
	// non-paid invoices with an active payment row.
	const mobileSheet =
		!data.paymentSummary.isLegacy &&
		!allPaid &&
		data.activePaymentPublic &&
		isDesktop === false ? (
			<PaymentBottomSheet
				// Key on active._id so the sheet collapses between installments.
				key={data.activePaymentPublic._id}
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
			<div className="px-6 py-8 pb-28 md:px-9 md:pb-10">
				<InvoicePaper
					invoice={data.invoice}
					lineItems={data.lineItems}
					businessName={data.businessName}
					businessLogoUrl={data.businessLogoUrl}
					clientName={data.clientName}
					clientEmail={data.clientEmail}
					displayStatus={data.paymentSummary.displayStatus}
					paymentSummary={data.paymentSummary}
					paySlot={rightRail}
				/>
				<div className="mx-auto mt-6 flex w-full flex-wrap items-center justify-center gap-2">
					<DownloadPdfButton invoiceId={data.invoice._id} hasPdf={hasPdf} />
					<PrintButton />
				</div>
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
