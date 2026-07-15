"use client";

import { memo, useMemo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import {
	getFieldDefinition,
	getFilterableFields,
	type AutomationObjectType,
	type ConditionNodeConfig,
} from "../../lib/node-types";
import { conditionSentence, describeVarPath } from "../../lib/condition-sentence";

function getSummary(
	config: ConditionNodeConfig | undefined,
	objectType: AutomationObjectType | null
): {
	title: string;
	description: string;
	isConfigured: boolean;
} {
	const allRules = (config?.groups ?? []).flatMap((g) => g.rules);
	if (!config || allRules.length === 0) {
		return { title: "Set a condition", description: "Configure condition...", isConfigured: false };
	}

	const firstRule = allRules[0];
	const title = firstRule.left?.kind === "var"
		? describeVarPath(firstRule.left.path, objectType)
		: ((objectType
				? getFieldDefinition(objectType, firstRule.field)?.label
				: undefined) ?? firstRule.field);
	// Full plain-English readback (A5-1); the card truncates to one line.
	const description =
		conditionSentence(config.logic, config.groups, objectType) ||
		"Configure condition...";

	return { title, description, isConfigured: true };
}

export const ConditionNodeRF = memo(({ data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as ConditionNodeConfig | undefined;
	const triggerObjectType = data?.triggerObjectType as AutomationObjectType | null;
	const { title, description, isConfigured } = getSummary(config, triggerObjectType ?? null);

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
					? "border-l-4 border-l-violet-500 dark:border-l-violet-400"
					: "border-dashed border-muted-foreground/30",
				// dark: variant needed so tw-merge drops the dark accent class too
				isFieldInvalid && "border-yellow-400 dark:border-yellow-400",
			)}
			aria-label={`Condition: ${description}`}
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300 flex items-center justify-center shrink-0">
						<GitBranch className="h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-semibold truncate">{title}</div>
						{/* Full sentence readback (A5-1); derived layout measures real heights, so multi-line is safe. */}
						<div className="text-xs text-muted-foreground line-clamp-3">
							{description}
						</div>
					</div>
					<div className="flex items-center gap-1.5 shrink-0">
						{isFieldInvalid && (
							<div className="relative group">
								<AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
								<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
									<div className="bg-yellow-100 dark:bg-yellow-500/15 border border-yellow-300 dark:border-yellow-500/30 rounded-md px-2 py-1 text-xs font-semibold text-yellow-800 dark:text-yellow-300 whitespace-nowrap">
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
