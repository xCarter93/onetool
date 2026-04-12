"use client";

import React from "react";
import { GitBranch, Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_OPTIONS } from "./trigger-node";

// Compatibility shim: re-export types and constants from the canonical node-types module.
// Existing imports from "../components/workflow-node" continue to work during migration.
export {
	type WorkflowNode,
	type NodeType,
	FIELD_OPTIONS,
	TARGET_OPTIONS,
} from "../lib/node-types";

import {
	type WorkflowNode,
	FIELD_OPTIONS,
	TARGET_OPTIONS,
	isConditionNode,
	isActionNode,
} from "../lib/node-types";

interface WorkflowNodeProps {
	node: WorkflowNode;
	triggerObjectType: string;
	onUpdate: (node: WorkflowNode) => void;
	onDelete: () => void;
	onClick?: () => void;
	isLast: boolean;
}

export function WorkflowNodeComponent({
	node,
	triggerObjectType,
	onUpdate,
	onDelete,
	onClick,
	isLast,
}: WorkflowNodeProps) {
	const isCondition = node.type === "condition";

	// Get display labels
	const getNodeSummary = () => {
		// Support both new config shape and legacy condition/action fields
		const conditionData = isConditionNode(node)
			? node.config || node.condition
			: undefined;
		const actionData = isActionNode(node)
			? node.config || node.action
			: undefined;

		if (isConditionNode(node) && conditionData) {
			const fieldOptions = FIELD_OPTIONS[triggerObjectType] || [];
			const fieldLabel =
				fieldOptions.find((f) => f.value === conditionData.field)?.label ||
				conditionData.field;

			// Operator labels
			const operatorLabels: Record<string, string> = {
				equals: "equals",
				not_equals: "does not equal",
				contains: "contains",
				exists: "exists",
			};
			const opLabel = operatorLabels[conditionData.operator] || conditionData.operator;

			if (conditionData.operator === "exists") {
				return `If ${fieldLabel} ${opLabel}`;
			}
			return `If ${fieldLabel} ${opLabel} "${conditionData.value || "..."}"`;
		}

		if (isActionNode(node) && actionData) {
			const targetOptions = TARGET_OPTIONS[triggerObjectType] || [];
			const targetLabel =
				targetOptions.find((t) => t.value === actionData.targetType)?.label ||
				actionData.targetType;
			const targetType =
				targetOptions.find((t) => t.value === actionData.targetType)?.type ||
				triggerObjectType;
			const statusOptions = STATUS_OPTIONS[targetType] || [];
			const statusLabel =
				statusOptions.find((s) => s.value === actionData.newStatus)?.label ||
				actionData.newStatus;

			return `Set ${targetLabel} → ${statusLabel}`;
		}

		return isCondition ? "Configure condition..." : "Configure action...";
	};

	const colorClasses = isCondition
		? {
				bg: "from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/40",
				border: "border-purple-200 dark:border-purple-800",
				shadow: "shadow-purple-100/50 dark:shadow-purple-900/20",
				hoverShadow:
					"hover:shadow-purple-200/50 dark:hover:shadow-purple-800/30",
				hoverBorder: "hover:border-purple-300 dark:hover:border-purple-700",
				iconBg: "from-purple-400 to-violet-500",
				label: "text-purple-600 dark:text-purple-400",
				chevron: "text-purple-500",
		  }
		: {
				bg: "from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40",
				border: "border-green-200 dark:border-green-800",
				shadow: "shadow-green-100/50 dark:shadow-green-900/20",
				hoverShadow: "hover:shadow-green-200/50 dark:hover:shadow-green-800/30",
				hoverBorder: "hover:border-green-300 dark:hover:border-green-700",
				iconBg: "from-green-400 to-emerald-500",
				label: "text-green-600 dark:text-green-400",
				chevron: "text-green-500",
		  };

	const Icon = isCondition ? GitBranch : Play;

	return (
		<div className="flex flex-col items-center">
			<div className="relative group">
				<button
					onClick={onClick}
					className={cn(
						"relative flex items-center gap-3 px-5 py-4 rounded-2xl",
						`bg-gradient-to-br ${colorClasses.bg}`,
						`border-2 ${colorClasses.border}`,
						`shadow-lg ${colorClasses.shadow}`,
						`${colorClasses.hoverShadow}`,
						`${colorClasses.hoverBorder}`,
						"transition-all duration-200 cursor-pointer",
						"min-w-[280px]"
					)}
				>
					{/* Icon */}
					<div
						className={cn(
							"flex items-center justify-center w-10 h-10 rounded-xl shadow-md",
							`bg-gradient-to-br ${colorClasses.iconBg}`
						)}
					>
						<Icon className="h-5 w-5 text-white" />
					</div>

					{/* Content */}
					<div className="flex-1 text-left">
						<div
							className={cn(
								"text-xs font-medium uppercase tracking-wide",
								colorClasses.label
							)}
						>
							{isCondition ? "Condition" : "Action"}
						</div>
						<div className="text-sm font-semibold text-foreground truncate max-w-[180px]">
							{getNodeSummary()}
						</div>
					</div>
				</button>

				{/* Delete button */}
				<button
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
					className={cn(
						"absolute -right-2 -top-2 p-1.5 rounded-full",
						"bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400",
						"opacity-0 group-hover:opacity-100 transition-opacity",
						"hover:bg-red-200 dark:hover:bg-red-800/50",
						"border border-red-200 dark:border-red-800"
					)}
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>

			{/* Connector line going down (only if not last) */}
			{!isLast && <div className="w-[2.5px] h-8 bg-border" />}
		</div>
	);
}
