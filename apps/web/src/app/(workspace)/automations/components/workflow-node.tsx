"use client";

import React, { useState } from "react";
import { GitBranch, Play, Trash2, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { STATUS_OPTIONS } from "./trigger-node";

export type NodeType = "condition" | "action";

export type WorkflowNode = {
	id: string;
	type: NodeType;
	condition?: {
		field: string;
		operator: "equals" | "not_equals" | "contains" | "exists";
		value: unknown;
	};
	action?: {
		targetType: "self" | "project" | "client" | "quote" | "invoice";
		actionType: "update_status";
		newStatus: string;
	};
	nextNodeId?: string;
	elseNodeId?: string;
};

// Field options for conditions
const FIELD_OPTIONS: Record<
	string,
	{ value: string; label: string }[]
> = {
	client: [
		{ value: "status", label: "Status" },
		{ value: "priorityLevel", label: "Priority Level" },
		{ value: "clientType", label: "Client Type" },
		{ value: "clientSize", label: "Client Size" },
		{ value: "category", label: "Category" },
		{ value: "industry", label: "Industry" },
	],
	project: [
		{ value: "status", label: "Status" },
		{ value: "projectType", label: "Project Type" },
		{ value: "title", label: "Title" },
	],
	quote: [
		{ value: "status", label: "Status" },
		{ value: "title", label: "Title" },
	],
	invoice: [
		{ value: "status", label: "Status" },
		{ value: "invoiceNumber", label: "Invoice Number" },
	],
	task: [
		{ value: "status", label: "Status" },
		{ value: "priority", label: "Priority" },
		{ value: "type", label: "Type" },
	],
};

const OPERATOR_OPTIONS = [
	{ value: "equals", label: "equals" },
	{ value: "not_equals", label: "does not equal" },
	{ value: "contains", label: "contains" },
	{ value: "exists", label: "exists" },
];

// Target options for actions
const TARGET_OPTIONS: Record<
	string,
	{ value: string; label: string; type: string }[]
> = {
	client: [{ value: "self", label: "This Client", type: "client" }],
	project: [
		{ value: "self", label: "This Project", type: "project" },
		{ value: "client", label: "Related Client", type: "client" },
	],
	quote: [
		{ value: "self", label: "This Quote", type: "quote" },
		{ value: "project", label: "Related Project", type: "project" },
		{ value: "client", label: "Related Client", type: "client" },
	],
	invoice: [
		{ value: "self", label: "This Invoice", type: "invoice" },
		{ value: "project", label: "Related Project", type: "project" },
		{ value: "client", label: "Related Client", type: "client" },
	],
	task: [
		{ value: "self", label: "This Task", type: "task" },
		{ value: "project", label: "Related Project", type: "project" },
		{ value: "client", label: "Related Client", type: "client" },
	],
};

interface WorkflowNodeProps {
	node: WorkflowNode;
	triggerObjectType: string;
	onUpdate: (node: WorkflowNode) => void;
	onDelete: () => void;
	isLast: boolean;
}

export function WorkflowNodeComponent({
	node,
	triggerObjectType,
	onUpdate,
	onDelete,
	isLast,
}: WorkflowNodeProps) {
	const [isOpen, setIsOpen] = useState(false);
	const isCondition = node.type === "condition";

	// Get display labels
	const getNodeSummary = () => {
		if (isCondition && node.condition) {
			const fieldOptions = FIELD_OPTIONS[triggerObjectType] || [];
			const fieldLabel =
				fieldOptions.find((f) => f.value === node.condition?.field)?.label ||
				node.condition.field;
			const opLabel =
				OPERATOR_OPTIONS.find((o) => o.value === node.condition?.operator)
					?.label || node.condition.operator;

			if (node.condition.operator === "exists") {
				return `If ${fieldLabel} ${opLabel}`;
			}
			return `If ${fieldLabel} ${opLabel} "${node.condition.value || "..."}"`;
		}

		if (!isCondition && node.action) {
			const targetOptions = TARGET_OPTIONS[triggerObjectType] || [];
			const targetLabel =
				targetOptions.find((t) => t.value === node.action?.targetType)?.label ||
				node.action.targetType;
			const targetType =
				targetOptions.find((t) => t.value === node.action?.targetType)?.type ||
				triggerObjectType;
			const statusOptions = STATUS_OPTIONS[targetType] || [];
			const statusLabel =
				statusOptions.find((s) => s.value === node.action?.newStatus)?.label ||
				node.action.newStatus;

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
			<Popover open={isOpen} onOpenChange={setIsOpen}>
				<PopoverTrigger asChild>
					<div className="relative group">
						<button
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

							{/* Chevron */}
							<ChevronDown
								className={cn(
									"h-4 w-4 transition-transform duration-200",
									colorClasses.chevron,
									isOpen && "rotate-180"
								)}
							/>
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
				</PopoverTrigger>

				<PopoverContent className="w-80 p-4" align="center">
					{isCondition ? (
						<ConditionEditor
							condition={node.condition}
							objectType={triggerObjectType}
							onChange={(condition) => onUpdate({ ...node, condition })}
							onClose={() => setIsOpen(false)}
						/>
					) : (
						<ActionEditor
							action={node.action}
							objectType={triggerObjectType}
							onChange={(action) => onUpdate({ ...node, action })}
							onClose={() => setIsOpen(false)}
						/>
					)}
				</PopoverContent>
			</Popover>

			{/* Connector line going down (only if not last) */}
			{!isLast && <div className="w-0.5 h-8 bg-border" />}
		</div>
	);
}

// Condition Editor Component
function ConditionEditor({
	condition,
	objectType,
	onChange,
	onClose,
}: {
	condition?: WorkflowNode["condition"];
	objectType: string;
	onChange: (condition: NonNullable<WorkflowNode["condition"]>) => void;
	onClose: () => void;
}) {
	const fieldOptions = FIELD_OPTIONS[objectType] || [];
	const currentCondition = condition || {
		field: fieldOptions[0]?.value || "status",
		operator: "equals" as const,
		value: "",
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2 pb-2 border-b">
				<div className="flex items-center justify-center w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-900/50">
					<GitBranch className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
				</div>
				<span className="font-medium text-sm">Configure Condition</span>
			</div>

			<div className="space-y-3">
				<div className="space-y-1.5">
					<Label className="text-xs text-muted-foreground">If field</Label>
					<Select
						value={currentCondition.field}
						onValueChange={(value) =>
							onChange({ ...currentCondition, field: value })
						}
					>
						<SelectTrigger className="h-9">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{fieldOptions.map((field) => (
								<SelectItem key={field.value} value={field.value}>
									{field.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-1.5">
					<Label className="text-xs text-muted-foreground">Operator</Label>
					<Select
						value={currentCondition.operator}
						onValueChange={(value) =>
							onChange({
								...currentCondition,
								operator: value as typeof currentCondition.operator,
							})
						}
					>
						<SelectTrigger className="h-9">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{OPERATOR_OPTIONS.map((op) => (
								<SelectItem key={op.value} value={op.value}>
									{op.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{currentCondition.operator !== "exists" && (
					<div className="space-y-1.5">
						<Label className="text-xs text-muted-foreground">Value</Label>
						<Input
							value={String(currentCondition.value || "")}
							onChange={(e) =>
								onChange({ ...currentCondition, value: e.target.value })
							}
							placeholder="Enter value"
							className="h-9"
						/>
					</div>
				)}
			</div>

			<Button className="w-full mt-2" size="sm" onPress={onClose}>
				<Check className="h-4 w-4 mr-1.5" />
				Done
			</Button>
		</div>
	);
}

// Action Editor Component
function ActionEditor({
	action,
	objectType,
	onChange,
	onClose,
}: {
	action?: WorkflowNode["action"];
	objectType: string;
	onChange: (action: NonNullable<WorkflowNode["action"]>) => void;
	onClose: () => void;
}) {
	const targetOptions = TARGET_OPTIONS[objectType] || [];
	const currentAction = action || {
		targetType: "self" as const,
		actionType: "update_status" as const,
		newStatus: "",
	};

	const selectedTarget = targetOptions.find(
		(t) => t.value === currentAction.targetType
	);
	const targetObjectType = selectedTarget?.type || objectType;
	const statusOptions = STATUS_OPTIONS[targetObjectType] || [];

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2 pb-2 border-b">
				<div className="flex items-center justify-center w-6 h-6 rounded-lg bg-green-100 dark:bg-green-900/50">
					<Play className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
				</div>
				<span className="font-medium text-sm">Configure Action</span>
			</div>

			<div className="space-y-3">
				<div className="space-y-1.5">
					<Label className="text-xs text-muted-foreground">Update</Label>
					<Select
						value={currentAction.targetType}
						onValueChange={(value) => {
							const newTarget = targetOptions.find((t) => t.value === value);
							const newTargetType = newTarget?.type || objectType;
							const newStatusOptions = STATUS_OPTIONS[newTargetType] || [];
							onChange({
								...currentAction,
								targetType: value as typeof currentAction.targetType,
								newStatus: newStatusOptions[0]?.value || "",
							});
						}}
					>
						<SelectTrigger className="h-9">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{targetOptions.map((target) => (
								<SelectItem key={target.value} value={target.value}>
									{target.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-1.5">
					<Label className="text-xs text-muted-foreground">Set status to</Label>
					<Select
						value={currentAction.newStatus}
						onValueChange={(value) =>
							onChange({ ...currentAction, newStatus: value })
						}
					>
						<SelectTrigger className="h-9">
							<SelectValue placeholder="Select status" />
						</SelectTrigger>
						<SelectContent>
							{statusOptions.map((status) => (
								<SelectItem key={status.value} value={status.value}>
									{status.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<Button className="w-full mt-2" size="sm" onPress={onClose}>
				<Check className="h-4 w-4 mr-1.5" />
				Done
			</Button>
		</div>
	);
}

export { FIELD_OPTIONS, TARGET_OPTIONS };

