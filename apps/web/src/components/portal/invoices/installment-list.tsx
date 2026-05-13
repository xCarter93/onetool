"use client";

import { formatDate, formatMoney } from "@/lib/portal/format";

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
}

export interface InstallmentListProps {
	installments: InstallmentRow[];
	activeIndex: number | null;
}

function pillFor(row: InstallmentRow, isUpcoming: boolean) {
	if (row.status === "paid") {
		const paidLabel = row.paidAt
			? `Paid · ${formatDate(row.paidAt)}`
			: "Paid";
		return {
			label: paidLabel,
			cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
		};
	}
	const now = Date.now();
	const isOverdue =
		row.dueDate < now &&
		row.status !== "paid" &&
		row.status !== "cancelled";
	if (isOverdue) {
		return {
			label: "Overdue",
			cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
		};
	}
	if (isUpcoming) {
		return {
			label: "Upcoming",
			cls: "bg-muted text-muted-foreground border-border",
		};
	}
	return {
		label: "Due",
		cls: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
	};
}

export function InstallmentList({
	installments,
	activeIndex,
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
				const pill = pillFor(row, isUpcoming);
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
								{row.status === "paid" &&
								(row.cardBrand || row.cardLast4) ? (
									<p className="mt-1 text-[12px] text-muted-foreground">
										{row.cardBrand ? `${row.cardBrand} ` : ""}
										{row.cardLast4 ? `•••• ${row.cardLast4}` : ""}
									</p>
								) : null}
							</div>
							<div className="flex flex-col items-end gap-1.5">
								<span className="text-[18px] font-semibold tabular-nums">
									{formatMoney(row.paymentAmount)}
								</span>
								<span
									className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${pill.cls}`}
								>
									<span className="h-1.5 w-1.5 rounded-full bg-current" />
									{pill.label}
								</span>
							</div>
						</div>
					</li>
				);
			})}
		</ol>
	);
}
