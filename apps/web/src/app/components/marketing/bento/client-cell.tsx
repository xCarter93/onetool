import { MapPin, Phone } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import { formatCurrency } from "@/lib/money";
import { PanelBar } from "./feature";

// Mirrors the client detail page: properties, then the jobs and money tied to them.
const PROPERTIES = ["412 Ashfield Ct", "Unit 4, 90 Mill St"];

const WORK = [
	{ job: "Fall property cleanup", when: "Quote Q-001042 · Oct 6", amount: 1082.5, status: "approved", label: "Approved" },
	{ job: "Gutter clearing", when: "Invoice INV-002071 · Sep 12", amount: 180, status: "paid", label: "Paid" },
	{ job: "Spring cleanup", when: "Invoice INV-001988 · Apr 3", amount: 640, status: "paid", label: "Paid" },
];

export function ClientCell() {
	return (
		<div className="flex h-full flex-col">
			<PanelBar>
				<span className="min-w-0 truncate text-sm">
					<span className="font-semibold text-(--ink)">Whitfield Property Group</span>
					<span className="hidden text-(--ink-2) @md:inline"> · Rachel Whitfield</span>
				</span>
				<span className="flex items-center gap-1.5 text-xs text-(--ink-2)">
					<Phone aria-hidden="true" className="size-3.5" />
					(612) 555-0142
				</span>
			</PanelBar>
			<div className="grid flex-1 grid-cols-1 @lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
				<div className="border-b border-(--rule) px-4 py-3 @lg:border-b-0 @lg:border-r">
					<p className="text-2xs font-semibold uppercase tracking-[0.03em] text-(--ink-3)">Properties</p>
					<ul className="mt-2 grid gap-2">
						{PROPERTIES.map((address) => (
							<li key={address} className="flex items-center gap-2 text-sm text-(--ink)">
								<MapPin aria-hidden="true" className="size-3.5 shrink-0 text-(--ink-3)" />
								{address}
							</li>
						))}
					</ul>
					<p className="mt-4 text-2xs font-semibold uppercase tracking-[0.03em] text-(--ink-3)">Balance due</p>
					<p className="mt-1 text-lg font-semibold tabular-nums text-(--ink)">{formatCurrency(0)}</p>
				</div>
				<div className="px-4 py-3">
					<p className="text-2xs font-semibold uppercase tracking-[0.03em] text-(--ink-3)">Recent work</p>
					<ul className="mt-1 divide-y divide-(--rule)">
						{WORK.map((row) => (
							<li key={row.job} className="flex items-center justify-between gap-3 py-2">
								<span className="min-w-0">
									<span className="block truncate text-sm font-medium text-(--ink)">{row.job}</span>
									<span className="block truncate text-xs text-(--ink-2)">{row.when}</span>
								</span>
								<span className="flex shrink-0 items-center gap-2">
									<span className="text-sm tabular-nums text-(--ink)">{formatCurrency(row.amount)}</span>
									<StatusBadge status={row.status}>{row.label}</StatusBadge>
								</span>
							</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}
