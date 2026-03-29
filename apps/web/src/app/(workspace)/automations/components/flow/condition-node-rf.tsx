"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

function getSummary(data: Record<string, unknown>): string {
	const condition = data.condition as
		| { field?: string; operator?: string; value?: unknown }
		| undefined;
	if (!condition || !condition.field) return "Configure condition...";

	const operatorLabels: Record<string, string> = {
		equals: "equals",
		not_equals: "does not equal",
		contains: "contains",
		exists: "exists",
	};
	const opLabel = condition.operator
		? (operatorLabels[condition.operator] ?? condition.operator)
		: "equals";

	if (condition.operator === "exists") {
		return `${condition.field} ${opLabel}`;
	}
	return `${condition.field} ${opLabel} "${condition.value ?? "..."}"`;
}

export const ConditionNodeRF = memo(({ data, selected }: NodeProps) => {
	const summary = getSummary(data);

	return (
		<div
			className={cn(
				"px-4 py-3 rounded-xl border-2 min-w-[260px]",
				"bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
				selected && "ring-2 ring-purple-400 dark:ring-purple-500"
			)}
			aria-label={`Condition: ${summary}`}
		>
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-border !w-2 !h-2 !border-0"
			/>
			<div className="flex items-center gap-3">
				<div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
					<GitBranch className="h-4 w-4 text-purple-600 dark:text-purple-400" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-xs font-semibold uppercase text-purple-600 dark:text-purple-400">
						Condition
					</div>
					<div className="text-sm font-semibold text-foreground truncate">
						{summary}
					</div>
				</div>
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				id="yes"
				className="!bg-emerald-500 !w-2 !h-2 !border-0"
				style={{ left: "35%" }}
			/>
			<Handle
				type="source"
				position={Position.Bottom}
				id="no"
				className="!bg-rose-400 !w-2 !h-2 !border-0"
				style={{ left: "65%" }}
			/>
		</div>
	);
});
ConditionNodeRF.displayName = "ConditionNodeRF";
