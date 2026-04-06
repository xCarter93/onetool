"use client";

import { memo, useMemo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import { FIELD_OPTIONS } from "../../lib/node-types";

function getSummary(data: Record<string, unknown>): {
	title: string;
	description: string;
	isConfigured: boolean;
} {
	const config =
		(data as Record<string, unknown>).config ||
		(data as Record<string, unknown>).condition;
	const condition = config as
		| { field?: string; operator?: string; value?: unknown }
		| undefined;
	if (!condition || !condition.field)
		return { title: "Set a condition", description: "Configure condition...", isConfigured: false };

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

	const title = condition.field;
	let description: string;
	if (
		condition.operator === "exists" ||
		condition.operator === "is_true" ||
		condition.operator === "is_false"
	) {
		description = `${condition.field} ${opLabel}`;
	} else {
		description = `${condition.field} ${opLabel} "${condition.value ?? "..."}"`;
	}

	return { title, description, isConfigured: true };
}

export const ConditionNodeRF = memo(({ data, selected }: NodeProps) => {
	const { title, description, isConfigured } = getSummary(data);
	const config =
		(data as Record<string, unknown>)?.config ||
		(data as Record<string, unknown>)?.condition;
	const condition = config as
		| { field?: string; operator?: string; value?: unknown }
		| undefined;
	const triggerObjectType = data?.triggerObjectType as string | null;

	const isFieldInvalid = useMemo(() => {
		if (!condition?.field || !triggerObjectType) return false;
		const validFields = FIELD_OPTIONS[triggerObjectType] || [];
		return (
			validFields.length > 0 &&
			!validFields.some((f) => f.value === condition.field)
		);
	}, [condition?.field, triggerObjectType]);

	return (
		<BaseNode
			className={cn(
				"w-[280px]",
				isConfigured
					? "border-border shadow-sm"
					: "border-dashed border-muted-foreground/30",
				isFieldInvalid && "border-yellow-400",
				"hover:border-primary/30 transition-colors",
				selected && "ring-2 ring-primary/50",
			)}
			aria-label={`Condition: ${description}`}
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
						<GitBranch className="h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-semibold truncate">{title}</div>
						<div className="text-xs text-muted-foreground truncate">
							{description}
						</div>
					</div>
					<div className="flex items-center gap-1.5 shrink-0">
						{isFieldInvalid && (
							<div className="relative group">
								<AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
								<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
									<div className="bg-yellow-50 border border-yellow-200 rounded-md px-2 py-1 text-xs font-semibold text-yellow-700 whitespace-nowrap">
										Field may not match current trigger type
									</div>
								</div>
							</div>
						)}
						<span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
							Conditions
						</span>
					</div>
				</div>
			</BaseNodeContent>
			<BaseHandle type="source" position={Position.Bottom} id="yes" />
			<BaseHandle type="source" position={Position.Bottom} id="no" />
		</BaseNode>
	);
});
ConditionNodeRF.displayName = "ConditionNodeRF";
