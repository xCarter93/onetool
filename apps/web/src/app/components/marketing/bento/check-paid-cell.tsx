import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Calendar, CalendarCheck, CheckCircle2, CircleDot, Landmark } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import { formatCurrency } from "@/lib/money";
import { PanelBar } from "./feature";

// Mirrors the invoice sidebar's Record Details rows, QuickBooks row included.
function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
	return (
		<div className="flex items-start gap-3 py-2.5 text-sm">
			<Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-(--ink-3)" />
			<span className="w-24 shrink-0 text-(--ink-2)">{label}</span>
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}

export function CheckPaidCell() {
	return (
		<div className="flex h-full flex-col">
			<PanelBar>
				<span className="min-w-0 truncate text-sm">
					<span className="font-semibold text-(--ink)">Invoice INV-002085</span>
					<span className="text-(--ink-2)"> · Kerr Road HOA</span>
				</span>
				<span className="text-sm font-semibold tabular-nums text-(--ink)">{formatCurrency(825)}</span>
			</PanelBar>
			<div className="flex-1 px-4 py-3">
				<p className="mb-1 text-xs font-medium uppercase tracking-wider text-(--ink-3)">Record Details</p>
				<Row icon={CircleDot} label="Status">
					<StatusBadge status="paid">Paid</StatusBadge>
				</Row>
				<Row icon={CalendarCheck} label="Due Date">
					<span className="text-(--ink)">Oct 15, 2026</span>
				</Row>
				<Row icon={Calendar} label="Paid">
					<span className="font-medium text-(--paid)">Oct 5, 2026</span>
				</Row>
				<Row icon={Landmark} label="QuickBooks">
					<span className="inline-flex items-center gap-1.5 text-(--ink)">
						<CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-(--paid)" />
						Synced 1 day ago
					</span>
				</Row>
			</div>
		</div>
	);
}
