"use client";

import { memo, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { FIELD_OPTIONS } from "../../lib/node-types";

function getSummary(data: Record<string, unknown>): string {
	// Read from new config shape with fallback to legacy condition
	const config = (data as Record<string, unknown>).config || (data as Record<string, unknown>).condition;
	const condition = config as
		| { field?: string; operator?: string; value?: unknown }
		| undefined;
	if (!condition || !condition.field) return "Set a condition";

	const operatorLabels: Record<string, string> = {
		equals: "equals",
		not_equals: "does not equal",
		contains: "contains",
		exists: "exists",
		greater_than: "is greater than",
		less_than: "is less than",
		is_true: "is true",
		is_false: "is false",
		before: "is before",
		after: "is after",
	};
	const opLabel = condition.operator
		? (operatorLabels[condition.operator] ?? condition.operator)
		: "equals";

	if (condition.operator === "exists" || condition.operator === "is_true" || condition.operator === "is_false") {
		return `${condition.field} ${opLabel}`;
	}
	return `${condition.field} ${opLabel} "${condition.value ?? "..."}"`;
}

export const ConditionNodeRF = memo(({ data, selected }: NodeProps) => {
	const summary = getSummary(data);
	const config = (data as Record<string, unknown>)?.config || (data as Record<string, unknown>)?.condition;
	const condition = config as
		| { field?: string; operator?: string; value?: unknown }
		| undefined;
	const triggerObjectType = data?.triggerObjectType as string | null;

	const isFieldInvalid = useMemo(() => {
		if (!condition?.field || !triggerObjectType) return false;
		const validFields = FIELD_OPTIONS[triggerObjectType] || [];
		return validFields.length > 0 && !validFields.some((f) => f.value === condition.field);
	}, [condition?.field, triggerObjectType]);

	return (
		<div
			className={cn(
				"px-4 py-3 rounded-xl border-2 min-w-[260px]",
				"bg-purple-50 dark:bg-purple-950/40",
				isFieldInvalid
					? "border-yellow-400 dark:border-yellow-600"
					: "border-purple-200 dark:border-purple-800",
				selected && !isFieldInvalid && "ring-2 ring-purple-400 dark:ring-purple-500",
				selected && isFieldInvalid && "ring-2 ring-yellow-400 dark:ring-yellow-500"
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
				{isFieldInvalid && (
					<div className="relative group ml-auto">
						<AlertTriangle className="h-3.5 w-3.5 text-yellow-500 dark:text-yellow-400" />
						<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
							<div className="bg-yellow-50 dark:bg-yellow-950/60 border border-yellow-200 dark:border-yellow-800 rounded-md px-2 py-1 text-xs font-semibold text-yellow-700 dark:text-yellow-300 whitespace-nowrap">
								This condition may reference fields from the previous trigger type. Please review.
							</div>
						</div>
					</div>
				)}
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				id="center"
				className="!w-2 !h-2 !bg-purple-400"
			/>
		</div>
	);
});
ConditionNodeRF.displayName = "ConditionNodeRF";
