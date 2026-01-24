"use client";

import React from "react";
import { X, Zap, GitBranch, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { STATUS_OPTIONS, OBJECT_TYPES, type TriggerConfig } from "./trigger-node";
import { FIELD_OPTIONS, TARGET_OPTIONS, type WorkflowNode } from "./workflow-node";

type SelectedNode =
	| { type: "trigger" }
	| { type: "condition"; id: string }
	| { type: "action"; id: string };

interface NodeEditorSidebarProps {
	isOpen: boolean;
	selectedNode: SelectedNode | null;
	trigger: TriggerConfig | null;
	nodes: WorkflowNode[];
	onClose: () => void;
	onTriggerChange: (trigger: TriggerConfig) => void;
	onNodeChange: (nodeId: string, updates: Partial<WorkflowNode>) => void;
	onAddTrueBranch?: (nodeId: string) => void;
	onAddFalseBranch?: (nodeId: string) => void;
}

export function NodeEditorSidebar({
	isOpen,
	selectedNode,
	trigger,
	nodes,
	onClose,
	onTriggerChange,
	onNodeChange,
	onAddTrueBranch,
	onAddFalseBranch,
}: NodeEditorSidebarProps) {
	if (!isOpen || !selectedNode) {
		return null;
	}

	return (
		<div
			className={cn(
				"h-full border-l bg-background transition-all duration-300 overflow-hidden",
				isOpen ? "w-[400px]" : "w-0"
			)}
		>
			<div className="flex flex-col h-full">
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b">
					<div className="flex items-center gap-2">
						{selectedNode.type === "trigger" && (
							<>
								<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50">
									<Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
								</div>
								<span className="font-semibold text-sm">Edit Trigger</span>
							</>
						)}
						{selectedNode.type === "condition" && (
							<>
								<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/50">
									<GitBranch className="h-4 w-4 text-purple-600 dark:text-purple-400" />
								</div>
								<span className="font-semibold text-sm">Edit Condition</span>
							</>
						)}
						{selectedNode.type === "action" && (
							<>
								<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/50">
									<Play className="h-4 w-4 text-green-600 dark:text-green-400" />
								</div>
								<span className="font-semibold text-sm">Edit Action</span>
							</>
						)}
					</div>
					<Button
						intent="outline"
						size="sq-sm"
						onPress={onClose}
						aria-label="Close sidebar"
					>
						<X className="h-4 w-4" />
					</Button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-auto p-4">
					{selectedNode.type === "trigger" && (
						<TriggerEditor trigger={trigger} onChange={onTriggerChange} />
					)}
					{selectedNode.type === "condition" && (
						<ConditionEditor
							node={nodes.find((n) => n.id === selectedNode.id)}
							triggerObjectType={trigger?.objectType || "quote"}
							onChange={(updates) => onNodeChange(selectedNode.id, updates)}
							allNodes={nodes}
							onAddTrueBranch={() => onAddTrueBranch?.(selectedNode.id)}
							onAddFalseBranch={() => onAddFalseBranch?.(selectedNode.id)}
						/>
					)}
					{selectedNode.type === "action" && (
						<ActionEditor
							node={nodes.find((n) => n.id === selectedNode.id)}
							triggerObjectType={trigger?.objectType || "quote"}
							onChange={(updates) => onNodeChange(selectedNode.id, updates)}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

// Trigger Editor
function TriggerEditor({
	trigger,
	onChange,
}: {
	trigger: TriggerConfig | null;
	onChange: (trigger: TriggerConfig) => void;
}) {
	// Initialize with default if null
	const currentTrigger = trigger || {
		objectType: "quote" as const,
		toStatus: "approved",
	};
	const statusOptions = STATUS_OPTIONS[currentTrigger.objectType] || [];

	const handleObjectTypeChange = (value: string) => {
		const newType = value as TriggerConfig["objectType"];
		const newStatusOptions = STATUS_OPTIONS[newType] || [];
		onChange({
			objectType: newType,
			fromStatus: undefined,
			toStatus: newStatusOptions[0]?.value || "",
		});
	};

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-sm font-medium">When this object</Label>
				<Select value={currentTrigger.objectType} onValueChange={handleObjectTypeChange}>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{OBJECT_TYPES.map((type) => (
							<SelectItem key={type.value} value={type.value}>
								{type.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-2">
				<Label className="text-sm font-medium">Changes from</Label>
				<Select
					value={currentTrigger.fromStatus || "any"}
					onValueChange={(value) =>
						onChange({
							...currentTrigger,
							fromStatus: value === "any" ? undefined : value,
						})
					}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="any">Any status</SelectItem>
						{statusOptions.map((status) => (
							<SelectItem key={status.value} value={status.value}>
								{status.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-2">
				<Label className="text-sm font-medium">To</Label>
				<Select
					value={currentTrigger.toStatus}
					onValueChange={(value) => onChange({ ...currentTrigger, toStatus: value })}
				>
					<SelectTrigger>
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

			<div className="pt-4 text-xs text-muted-foreground">
				Changes are saved automatically
			</div>
		</div>
	);
}

// Condition Editor
function ConditionEditor({
	node,
	triggerObjectType,
	onChange,
	onAddTrueBranch,
	onAddFalseBranch,
	allNodes,
}: {
	node?: WorkflowNode;
	triggerObjectType: string;
	onChange: (updates: Partial<WorkflowNode>) => void;
	onAddTrueBranch?: () => void;
	onAddFalseBranch?: () => void;
	allNodes?: WorkflowNode[];
}) {
	if (!node || node.type !== "condition") return null;

	const fieldOptions = FIELD_OPTIONS[triggerObjectType] || [];
	const currentCondition = node.condition || {
		field: fieldOptions[0]?.value || "status",
		operator: "equals" as const,
		value: "",
	};

	const OPERATOR_OPTIONS = [
		{ value: "equals", label: "equals" },
		{ value: "not_equals", label: "does not equal" },
		{ value: "contains", label: "contains" },
		{ value: "exists", label: "exists" },
	];

	// Find nodes that are linked as true/false branches
	const trueNode = allNodes?.find((n) => n.id === node.nextNodeId);
	const falseNode = allNodes?.find((n) => n.id === node.elseNodeId);

	return (
		<div className="space-y-6">
			{/* Condition Configuration */}
			<div className="space-y-4">
				<div className="text-sm font-semibold text-foreground">Condition</div>

				<div className="space-y-2">
					<Label className="text-sm font-medium">If field</Label>
					<Select
						value={currentCondition.field}
						onValueChange={(value) =>
							onChange({ condition: { ...currentCondition, field: value } })
						}
					>
						<SelectTrigger>
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

				<div className="space-y-2">
					<Label className="text-sm font-medium">Operator</Label>
					<Select
						value={currentCondition.operator}
						onValueChange={(value) =>
							onChange({
								condition: {
									...currentCondition,
									operator: value as typeof currentCondition.operator,
								},
							})
						}
					>
						<SelectTrigger>
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
					<div className="space-y-2">
						<Label className="text-sm font-medium">Value</Label>
						<Input
							value={String(currentCondition.value || "")}
							onChange={(e) =>
								onChange({
									condition: { ...currentCondition, value: e.target.value },
								})
							}
							placeholder="Enter value"
						/>
					</div>
				)}
			</div>

			{/* Branch Configuration */}
			<div className="border-t pt-4 space-y-4">
				<div className="text-sm font-semibold text-foreground">Next step</div>

				{/* Is true branch */}
				<div className="space-y-2">
					<Label className="text-xs font-medium text-muted-foreground uppercase">
						Is true
					</Label>
					{trueNode ? (
						<div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
							<div className="flex items-center gap-2">
								{trueNode.type === "condition" ? (
									<GitBranch className="h-4 w-4 text-purple-600 dark:text-purple-400" />
								) : (
									<Play className="h-4 w-4 text-green-600 dark:text-green-400" />
								)}
								<span className="text-sm font-medium">
									{trueNode.type === "condition" ? "Condition" : "Action"}
								</span>
							</div>
							<Button
								intent="ghost"
								size="sq-sm"
								onPress={() => onChange({ nextNodeId: undefined })}
							>
								<X className="h-3.5 w-3.5" />
							</Button>
						</div>
					) : (
						<button
							onClick={onAddTrueBranch}
							className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 text-muted-foreground hover:text-foreground transition-colors text-sm"
						>
							<span>+ Add block</span>
						</button>
					)}
				</div>

				{/* Is false branch */}
				<div className="space-y-2">
					<Label className="text-xs font-medium text-muted-foreground uppercase">
						Is false
					</Label>
					{falseNode ? (
						<div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
							<div className="flex items-center gap-2">
								{falseNode.type === "condition" ? (
									<GitBranch className="h-4 w-4 text-purple-600 dark:text-purple-400" />
								) : (
									<Play className="h-4 w-4 text-green-600 dark:text-green-400" />
								)}
								<span className="text-sm font-medium">
									{falseNode.type === "condition" ? "Condition" : "Action"}
								</span>
							</div>
							<Button
								intent="ghost"
								size="sq-sm"
								onPress={() => onChange({ elseNodeId: undefined })}
							>
								<X className="h-3.5 w-3.5" />
							</Button>
						</div>
					) : (
						<button
							onClick={onAddFalseBranch}
							className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 text-muted-foreground hover:text-foreground transition-colors text-sm"
						>
							<span>+ Add block</span>
						</button>
					)}
				</div>
			</div>

			<div className="border-t pt-4">
				<div className="text-xs text-muted-foreground">
					Changes are saved automatically. Configure true/false branches by clicking the "+ Add block" buttons above.
				</div>
			</div>
		</div>
	);
}

// Action Editor
function ActionEditor({
	node,
	triggerObjectType,
	onChange,
}: {
	node?: WorkflowNode;
	triggerObjectType: string;
	onChange: (updates: Partial<WorkflowNode>) => void;
}) {
	if (!node || node.type !== "action") return null;

	const targetOptions = TARGET_OPTIONS[triggerObjectType] || [];
	const currentAction = node.action || {
		targetType: "self" as const,
		actionType: "update_status" as const,
		newStatus: "",
	};

	const selectedTarget = targetOptions.find(
		(t) => t.value === currentAction.targetType
	);
	const targetObjectType = selectedTarget?.type || triggerObjectType;
	const statusOptions = STATUS_OPTIONS[targetObjectType] || [];

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label className="text-sm font-medium">Update</Label>
				<Select
					value={currentAction.targetType}
					onValueChange={(value) => {
						const newTarget = targetOptions.find((t) => t.value === value);
						const newTargetType = newTarget?.type || triggerObjectType;
						const newStatusOptions = STATUS_OPTIONS[newTargetType] || [];
						onChange({
							action: {
								...currentAction,
								targetType: value as typeof currentAction.targetType,
								newStatus: newStatusOptions[0]?.value || "",
							},
						});
					}}
				>
					<SelectTrigger>
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

			<div className="space-y-2">
				<Label className="text-sm font-medium">Set status to</Label>
				<Select
					value={currentAction.newStatus}
					onValueChange={(value) =>
						onChange({ action: { ...currentAction, newStatus: value } })
					}
				>
					<SelectTrigger>
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

			<div className="pt-4 text-xs text-muted-foreground">
				Changes are saved automatically
			</div>
		</div>
	);
}
