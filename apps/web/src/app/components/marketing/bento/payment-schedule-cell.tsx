import { CheckCircle, Clock, Settings } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import { PanelBar } from "./feature";

// Mirrors the invoice's Payment Schedule tab: progress, then one card per installment.
const INSTALLMENTS = [
	{ n: 1, description: "Deposit", due: "Oct 2, 2026", amount: 460, paid: true },
	{ n: 2, description: "Balance", due: "Nov 13, 2026", amount: 1380.25, paid: false },
];

export function PaymentScheduleCell() {
	return (
		<div className="flex h-full flex-col">
			<PanelBar>
				<span className="min-w-0 truncate text-sm">
					<span className="font-semibold text-(--ink)">Invoice INV-002091</span>
					<span className="text-(--ink-2)"> · Maple Court Condos</span>
				</span>
				<StatusBadge status="sent">Sent</StatusBadge>
			</PanelBar>
			<div className="flex-1 p-4">
				<div className="mb-4 flex min-h-8 items-center justify-between">
					<p className="text-xs font-medium uppercase tracking-wider text-(--ink-3)">Payment Schedule</p>
					<span className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-(--rule-2) px-2.5 text-xs font-medium text-(--ink)">
						<Settings aria-hidden="true" className="size-3.5" />
						Configure
					</span>
				</div>
				<div className="mb-5 grid gap-2">
					<div className="flex items-center justify-between text-sm">
						<span className="text-(--ink-2)">1 of 2 payments complete</span>
						<span className="font-medium tabular-nums text-(--ink)">25%</span>
					</div>
					<div className="h-1 overflow-hidden rounded-full bg-(--rule)">
						<div className="h-full w-1/4 bg-(--accent-ink)" />
					</div>
					<div className="flex justify-between text-xs tabular-nums text-(--ink-2)">
						<span>{formatCurrency(460)} paid</span>
						<span>{formatCurrency(1380.25)} remaining</span>
					</div>
				</div>
				<div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
					{INSTALLMENTS.map((row) => (
						<div
							key={row.n}
							className={cn(
								"rounded-lg border p-3.5",
								row.paid
									? "border-(--paid)/40"
									: "border-(--rule-2)"
							)}
						>
							<div className="mb-2 flex items-start justify-between gap-2">
								<div className="flex items-center gap-2">
									<span className="grid size-7 flex-none place-items-center rounded-full bg-(--paper) text-sm font-semibold text-(--ink)">
										{row.n}
									</span>
									<div>
										<p className="text-sm font-medium text-(--ink)">{row.description}</p>
										<p className="text-xs text-(--ink-2)">Due: {row.due}</p>
									</div>
								</div>
								{row.paid ? (
									<StatusBadge status="paid" className="gap-1">
										<CheckCircle aria-hidden="true" className="size-3" />
										Paid
									</StatusBadge>
								) : (
									<StatusBadge status="pending" appearance="outline" className="gap-1">
										<Clock aria-hidden="true" className="size-3" />
										Pending
									</StatusBadge>
								)}
							</div>
							<p className="text-xl font-bold tabular-nums text-(--ink)">{formatCurrency(row.amount)}</p>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
