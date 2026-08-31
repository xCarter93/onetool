"use client";

import { isPastDue } from "@onetool/backend/convex/lib/invoiceLateness";

import { StatusBadge, type StatusRole } from "@/components/domain/status-badge";
import { formatDate, formatMoney } from "@/lib/portal/format";

import { PaymentReceipt } from "./payment-receipt";

export interface InstallmentRow {
	_id: string;
	paymentAmount: number;
	dueDate: number;
	description: string | null;
	sortOrder: number;
	status: "pending" | "sent" | "paid" | "refunded" | "overdue" | "cancelled";
	paidAt: number | null;
	cardLast4: string | null;
	cardBrand: string | null;
	receiptUrl: string | null;
	recordedOutsidePortal: boolean;
	// Dollars refunded on this row; absent or null means nothing came back out.
	refundedAmount?: number | null;
}

export interface InstallmentListProps {
	installments: InstallmentRow[];
	activeIndex: number | null;
	/** The business's calendar day, from the server — never the visitor's clock. */
	orgToday: number;
}

function pillFor(
	row: InstallmentRow,
	isUpcoming: boolean,
	orgToday: number
): { label: string; role: StatusRole } {
	// Terminal states first — a refunded row past its due date is not overdue,
	// and telling the client to pay money the business returned is the worst
	// thing this list can say.
	if (row.status === "refunded") return { label: "Refunded", role: "neutral" };
	if (row.status === "cancelled") return { label: "Cancelled", role: "neutral" };
	if (row.status === "paid") {
		if (row.refundedAmount) {
			return { label: "Partially refunded", role: "warning" };
		}
		return {
			label: row.paidAt ? `Paid · ${formatDate(row.paidAt)}` : "Paid",
			role: "success",
		};
	}
	if (isPastDue(row.dueDate, orgToday))
		return { label: "Overdue", role: "danger" };
	if (isUpcoming) return { label: "Upcoming", role: "neutral" };
	return { label: "Due", role: "info" };
}

export function InstallmentList({
	installments,
	activeIndex,
	orgToday,
}: InstallmentListProps) {
	if (installments.length === 0) {
		return (
			<div
				className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center"
				data-installment-empty
			>
				<p className="text-[13px] text-muted-foreground">
					No installments configured.
				</p>
			</div>
		);
	}

	return (
		<ol className="flex flex-col gap-3" data-installment-list>
			{installments.map((row, idx) => {
				const isActive = activeIndex !== null && idx === activeIndex;
				const isUpcoming =
					activeIndex !== null && idx > activeIndex && row.status !== "paid";
				const pill = pillFor(row, isUpcoming, orgToday);
				return (
					<li
						key={row._id}
						data-installment-row
						data-active={isActive ? "true" : undefined}
						className={`rounded-xl border bg-card p-4 transition-colors ${
							isActive
								? "border-primary border-l-[3px] border-l-primary"
								: "border-border"
						}`}
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
									Due {formatDate(row.dueDate)}
								</p>
								<p className="mt-1 text-[14px] font-medium text-foreground">
									{row.description ?? `Installment ${idx + 1}`}
								</p>
							</div>
							<div className="flex flex-col items-end gap-1.5">
								<span className="text-[18px] font-semibold tabular-nums">
									{formatMoney(row.paymentAmount)}
								</span>
								<StatusBadge role={pill.role} appearance="soft">
									{pill.label}
								</StatusBadge>
							</div>
						</div>
						{row.refundedAmount ? (
							<p className="mt-3 text-[13px] text-muted-foreground">
								{formatMoney(row.refundedAmount)} was refunded to your original
								payment method.
							</p>
						) : null}
						{row.status === "paid" ? (
							<div className="mt-3">
								<PaymentReceipt
									payment={{
										_id: row._id,
										description: row.description,
										paymentAmount: row.paymentAmount,
										paidAt: row.paidAt,
										cardBrand: row.cardBrand,
										cardLast4: row.cardLast4,
										receiptUrl: row.receiptUrl,
										recordedOutsidePortal: row.recordedOutsidePortal,
									}}
								/>
							</div>
						) : null}
					</li>
				);
			})}
		</ol>
	);
}
