import { ArrowRight, ChevronDown, FileSpreadsheet } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import { PanelBar } from "./feature";

// Shaped like the import wizard's Map columns step: file column, suggested field, confidence.
const MAPPINGS = [
	{ column: "Customer Name", field: "Company name", high: true },
	{ column: "Email", field: "Email", high: true },
	{ column: "Service Address", field: "Street address", high: true },
	{ column: "Gate Code", field: "Notes", high: false },
];

export function ImportCell() {
	return (
		<div className="flex h-full flex-col">
			<PanelBar>
				<span className="text-sm font-semibold text-(--ink)">Map columns</span>
				<span className="flex items-center gap-1.5 text-xs text-(--ink-2)">
					<FileSpreadsheet aria-hidden="true" className="size-4" />
					clients.csv
				</span>
			</PanelBar>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-(--rule) px-4 py-2.5 text-xs text-(--ink-2)">
				<span>
					<span className="font-medium text-(--ink)">4</span> of{" "}
					<span className="font-medium text-(--ink)">4</span> columns mapped
				</span>
				<StatusBadge role="success">
					3 high confidence
				</StatusBadge>
				<StatusBadge role="warning">
					1 low confidence
				</StatusBadge>
			</div>
			<ul className="divide-y divide-(--rule)">
				{MAPPINGS.map((mapping) => (
					<li
						key={mapping.column}
						className="grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)_44px] items-center gap-2.5 px-4 py-1.5 @md:gap-3"
					>
						<span className="text-xs font-medium text-(--ink) @md:text-sm">{mapping.column}</span>
						<ArrowRight aria-hidden="true" className="size-4 text-(--ink-2)" />
						<span className="flex h-8 items-center justify-between gap-1 rounded-md border border-(--rule-2) bg-(--sheet) px-2 text-xs text-(--ink) @md:text-sm">
							{mapping.field}
							<ChevronDown aria-hidden="true" className="hidden size-3.5 shrink-0 text-(--ink-2) @md:block" />
						</span>
						<StatusBadge role={mapping.high ? "success" : "warning"} className="justify-self-end">
							{mapping.high ? "High" : "Low"}
						</StatusBadge>
					</li>
				))}
			</ul>
		</div>
	);
}
