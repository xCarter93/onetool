import { Check } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import { cn } from "@/lib/utils";
import { PanelBar } from "./feature";

const TASKS = [
	{ title: "Confirm the gate code", who: "DR", due: "Oct 5", status: "completed", label: "Done" },
	{ title: "Haul the brush away", who: "TR", due: "Oct 5", status: "overdue", label: "Overdue" },
	{ title: "Before and after photos", who: "JO", due: "Oct 6", status: "scheduled", label: "Today" },
	{ title: "Send the invoice", who: "DR", due: "Oct 7", status: "pending", label: "Up next" },
];

export function ProjectCell() {
	return (
		<div className="flex h-full flex-col">
			<PanelBar>
				<span className="min-w-0 truncate text-sm">
					<span className="font-semibold text-(--ink)">Fall property cleanup</span>
					<span className="hidden text-(--ink-2) @md:inline"> · Whitfield Property Group</span>
				</span>
				<StatusBadge status="active">In progress</StatusBadge>
			</PanelBar>
			<ul className="divide-y divide-(--rule) px-4">
				{TASKS.map((task) => {
					const done = task.status === "completed";
					return (
						<li key={task.title} className="flex items-center gap-3 py-[11px]">
							<span
								aria-hidden="true"
								className={cn(
									"grid size-[18px] flex-none place-items-center rounded-sm border-[1.5px] text-(--paper)",
									done ? "border-(--paid) bg-(--paid)" : "border-(--rule-3)",
								)}
							>
								{done ? <Check className="size-3" strokeWidth={3} /> : null}
							</span>
							<span className={cn("min-w-0 flex-1 truncate text-sm", done ? "text-(--ink-3) line-through" : "text-(--ink)")}>
								{task.title}
							</span>
							<span className="grid size-6 flex-none place-items-center rounded-full bg-(--accent-wash) text-2xs font-semibold text-(--accent-ink)">
								{task.who}
							</span>
							<span className="hidden w-11 text-right text-xs tabular-nums text-(--ink-3) @sm:inline">{task.due}</span>
							<StatusBadge status={task.status}>{task.label}</StatusBadge>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
