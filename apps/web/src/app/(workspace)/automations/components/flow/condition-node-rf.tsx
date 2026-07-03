"use client";

import { memo, useMemo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import {
	VALUELESS_OPERATORS,
	getFilterableFields,
	type AutomationObjectType,
	type ConditionNodeConfig,
	type ConditionRule,
} from "../../lib/node-types";

const OPERATOR_LABELS: Record<string, string> = {
	equals: "equals",
	not_equals: "does not equal",
	contains: "contains",
	not_contains: "does not contain",
	is_empty: "is empty",
	is_not_empty: "is not empty",
	greater_than: "is greater than",
	less_than: "is less than",
	gte: "is at least",
	lte: "is at most",
	is_true: "is true",
	is_false: "is false",
	before: "is before",
	after: "is after",
};

function describeRule(rule: ConditionRule): string {
	const opLabel = OPERATOR_LABELS[rule.operator] ?? rule.operator;
	if ((VALUELESS_OPERATORS as readonly string[]).includes(rule.operator)) {
		return `${rule.field} ${opLabel}`;
	}
	const value = rule.value?.kind === "static" ? rule.value.value : "...";
	return `${rule.field} ${opLabel} "${value ?? "..."}"`;
}

function getSummary(config: ConditionNodeConfig | undefined): {
	title: string;
	description: string;
	isConfigured: boolean;
} {
	const allRules = (config?.groups ?? []).flatMap((g) => g.rules);
	if (!config || allRules.length === 0) {
		return { title: "Set a condition", description: "Configure condition...", isConfigured: false };
	}

	const [first, ...rest] = allRules;
	const description =
		rest.length > 0 ? `${describeRule(first)} +${rest.length} more` : describeRule(first);

	return { title: first.field, description, isConfigured: true };
}

export const ConditionNodeRF = memo(({ data, selected }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as ConditionNodeConfig | undefined;
	const { title, description, isConfigured } = getSummary(config);
	const triggerObjectType = data?.triggerObjectType as AutomationObjectType | null;

	const isFieldInvalid = useMemo(() => {
		const allRules = (config?.groups ?? []).flatMap((g) => g.rules);
		if (allRules.length === 0 || !triggerObjectType) return false;
		const validFields = getFilterableFields(triggerObjectType);
		if (validFields.length === 0) return false;
		return allRules.some(
			(rule) => rule.field && !validFields.some((f) => f.key === rule.field)
		);
	}, [config, triggerObjectType]);

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
