"use client";

import React from "react";
import { Trash2, GitBranch, ChevronDown } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { FIELD_OPTIONS, type ConditionConfig } from "../../../lib/node-types";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";

const OPERATOR_OPTIONS = [
	{ value: "equals", label: "equals" },
	{ value: "not_equals", label: "does not equal" },
	{ value: "contains", label: "contains" },
	{ value: "exists", label: "exists" },
	{ value: "greater_than", label: "is greater than" },
	{ value: "less_than", label: "is less than" },
	{ value: "is_true", label: "is true" },
	{ value: "is_false", label: "is false" },
	{ value: "before", label: "is before" },
	{ value: "after", label: "is after" },
] as const;

const NO_VALUE_OPERATORS = ["exists", "is_true", "is_false"];

export function ConditionConfigPanel({
	nodeId,
	trigger,
	nodes,
	onNodeChange,
	onDeleteNode,
}: ConfigPanelProps) {
	const node = nodeId ? nodes.find((item) => item.id === nodeId) : undefined;

	if (!nodeId || !node || node.type !== "condition") {
		return (
			<div className="text-sm text-muted-foreground">
				This condition could not be found.
			</div>
		);
	}

	const triggerObjectType = trigger?.objectType || "quote";
	const fieldOptions = FIELD_OPTIONS[triggerObjectType] || [];
	const currentCondition =
		(node.config as ConditionConfig | undefined) ||
		node.condition || {
			field: fieldOptions[0]?.value || "status",
			operator: "equals" as const,
			value: "",
		};

	const needsValue = !NO_VALUE_OPERATORS.includes(currentCondition.operator);

	const selectedFieldLabel =
		fieldOptions.find((f) => f.value === currentCondition.field)?.label ||
		currentCondition.field;
	const selectedOperatorLabel =
		OPERATOR_OPTIONS.find((o) => o.value === currentCondition.operator)
			?.label || currentCondition.operator;

	const updateCondition = (updates: Partial<ConditionConfig>) => {
		onNodeChange(nodeId, {
			config: {
				...currentCondition,
				...updates,
			},
		});
	};

	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={GitBranch}
				iconBgColor="bg-purple-50 dark:bg-purple-950/40"
				iconFgColor="text-purple-600 dark:text-purple-400"
				categoryBadge="Conditions"
				nodeTypeName="Condition"
			/>

			<div className="flex-1">
				{/* Inline pill/tag condition builder */}
				<div className="border-b border-border py-4">
					<div className="text-xs font-medium text-muted-foreground mb-2">
						When
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{/* Field pill */}
						<Popover>
							<PopoverTrigger asChild>
								<button
									type="button"
									className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 text-xs font-semibold border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-950/60 transition-colors nodrag"
								>
									{selectedFieldLabel || "Field"}
									<ChevronDown className="h-3 w-3" />
								</button>
							</PopoverTrigger>
							<PopoverContent className="w-48 p-1" align="start">
								{fieldOptions.map((opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() =>
											updateCondition({ field: opt.value })
										}
										className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent"
									>
										{opt.label}
									</button>
								))}
							</PopoverContent>
						</Popover>

						{/* Operator pill */}
						<Popover>
							<PopoverTrigger asChild>
								<button
									type="button"
									className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-semibold border border-border hover:bg-accent transition-colors nodrag"
								>
									{selectedOperatorLabel || "operator"}
									<ChevronDown className="h-3 w-3" />
								</button>
							</PopoverTrigger>
							<PopoverContent className="w-40 p-1" align="start">
								{OPERATOR_OPTIONS.map((opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() =>
											updateCondition({
												operator:
													opt.value as ConditionConfig["operator"],
												value: NO_VALUE_OPERATORS.includes(
													opt.value
												)
													? ""
													: currentCondition.value,
											})
										}
										className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent"
									>
										{opt.label}
									</button>
								))}
							</PopoverContent>
						</Popover>

						{/* Value input (hidden for exists/is_true/is_false) */}
						{needsValue && (
							<input
								className="px-2.5 py-1 rounded-full bg-muted text-xs border border-border w-24 focus:outline-none focus:ring-1 focus:ring-primary nodrag"
								value={String(currentCondition.value ?? "")}
								onChange={(e) =>
									updateCondition({ value: e.target.value })
								}
								placeholder="value"
							/>
						)}
					</div>
				</div>
			</div>

			{/* Delete button */}
			{onDeleteNode && (
				<div className="pt-4 border-t border-border mt-2">
					<button
						type="button"
						className="text-destructive hover:bg-destructive/10 flex items-center gap-2 px-3 py-2 rounded-md transition-colors w-full"
						onClick={() => onDeleteNode(nodeId)}
						aria-label="Delete step"
					>
						<Trash2 className="h-4 w-4" />
						<span className="text-sm font-medium">Delete Node</span>
					</button>
				</div>
			)}
		</div>
	);
}
