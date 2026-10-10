import type { LucideIcon } from "lucide-react";
import { CircleCheck, CreditCard, ReceiptText, Undo2, Users } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";

// Timing per the QuickBooks sync help article.
const RECORDS: { label: string; icon: LucideIcon; when: string }[] = [
	{ label: "Clients", icon: Users, when: "When created or edited" },
	{ label: "Invoices", icon: ReceiptText, when: "When sent" },
	{ label: "Payments", icon: CreditCard, when: "When paid" },
	{ label: "Refunds", icon: Undo2, when: "When the refund succeeds" },
];

export function SyncCell() {
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-start justify-between gap-3 border-b border-(--rule) px-4 py-3">
				<div>
					<p className="text-sm font-semibold text-(--ink)">QuickBooks Online</p>
					<p className="text-xs text-(--ink-2)">Ridgeline Home Services</p>
				</div>
				<StatusBadge role="success">
					Connected
				</StatusBadge>
			</div>
			<ul className="flex-1 divide-y divide-(--rule)">
				{RECORDS.map((record) => {
					const Icon = record.icon;
					return (
						<li key={record.label} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
							<Icon aria-hidden="true" className="size-4 shrink-0 text-(--ink-2)" />
							<span className="font-medium text-(--ink)">{record.label}</span>
							<span className="ml-auto text-right text-xs text-(--ink-2)">{record.when}</span>
						</li>
					);
				})}
			</ul>
			<p className="flex items-center gap-2 border-t border-(--rule) px-4 py-3 text-xs text-(--ink-2)">
				<CircleCheck aria-hidden="true" className="size-4 shrink-0 text-(--paid)" />
				No sync issues · Connection checked 2 min ago
			</p>
		</div>
	);
}
