"use client";

import React, { useEffect, useRef } from "react";
import { X, Zap, GitBranch, Play, Trash2, Search, Repeat } from "lucide-react";
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

export type SelectedNode =
	| { type: "trigger" }
	| { type: "condition"; id: string }
	| { type: "action"; id: string }
	| { type: "fetch_records"; id: string }
	| { type: "loop"; id: string };

interface NodeEditorSidebarProps {
	isOpen: boolean;
	selectedNode: SelectedNode | null;
	trigger: TriggerConfig | null;
	nodes: WorkflowNode[];
	onClose: () => void;
	onTriggerChange: (trigger: TriggerConfig) => void;
	onNodeChange: (nodeId: string, updates: Partial<WorkflowNode>) => void;
	onDeleteNode?: (nodeId: string) => void;
}

export function NodeEditorSidebar({
	isOpen,
	selectedNode,
	trigger,
	nodes,
	onClose,
	onTriggerChange,
	onNodeChange,
	onDeleteNode,
}: NodeEditorSidebarProps) {
	const contentRef = useRef<HTMLDivElement>(null);

	// Focus first input when sidebar opens
	useEffect(() => {
		if (isOpen && contentRef.current) {
			const timer = setTimeout(() => {
				const firstInput = contentRef.current?.querySelector<HTMLElement>(
					"input, select, button[role='combobox']"
				);
				firstInput?.focus();
			}, 250); // Wait for slide-in transition
			return () => clearTimeout(timer);
		}
	}, [isOpen, selectedNode]);

	// Escape key closes sidebar
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	if (!isOpen || !selectedNode) {
		return null;
	}

	return (
		<div className="w-full h-full flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between p-6 border-b border-border">
				<div className="flex items-center gap-3">
					{selectedNode.type === "trigger" && (
						<>
							<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50">
								<Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
							</div>
							<span className="text-lg font-semibold">Configure Trigger</span>
						</>
					)}
					{selectedNode.type === "condition" && (
						<>
							<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/50">
								<GitBranch className="h-4 w-4 text-purple-600 dark:text-purple-400" />
							</div>
							<span className="text-lg font-semibold">Configure Condition</span>
						</>
					)}
					{selectedNode.type === "action" && (
						<>
							<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/50">
								<Play className="h-4 w-4 text-green-600 dark:text-green-400" />
							</div>
							<span className="text-lg font-semibold">Configure Action</span>
						</>
					)}
					{selectedNode.type === "fetch_records" && (
						<>
							<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50">
								<Search className="h-4 w-4 text-blue-600 dark:text-blue-400" />
							</div>
							<span className="text-lg font-semibold">Configure Fetch</span>
						</>
					)}
					{selectedNode.type === "loop" && (
						<>
							<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/50">
								<Repeat className="h-4 w-4 text-orange-600 dark:text-orange-400" />
							</div>
							<span className="text-lg font-semibold">Configure Loop</span>
						</>
					)}
				</div>
				<button
					onClick={onClose}
					className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
					aria-label="Close sidebar"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			{/* Content */}
			<div ref={contentRef} className="flex-1 overflow-auto p-6">
				{selectedNode.type === "trigger" && (
					<TriggerEditor trigger={trigger} onChange={onTriggerChange} />
				)}
				{selectedNode.type === "condition" && (
					<ConditionEditor
						node={nodes.find((n) => n.id === selectedNode.id)}
						triggerObjectType={trigger?.objectType || "quote"}
						onChange={(updates) => onNodeChange(selectedNode.id, updates)}
						allNodes={nodes}
					/>
				)}
				{selectedNode.type === "action" && (
					<ActionEditor
						node={nodes.find((n) => n.id === selectedNode.id)}
						triggerObjectType={trigger?.objectType || "quote"}
						onChange={(updates) => onNodeChange(selectedNode.id, updates)}
					/>
				)}
				{selectedNode.type === "fetch_records" && (
					<div className="text-sm text-muted-foreground">
						Configuration for this node type will be available in a future update.
					</div>
				)}
				{selectedNode.type === "loop" && (
					<div className="text-sm text-muted-foreground">
						Configuration for this node type will be available in a future update.
					</div>
				)}
			</div>

			{/* Delete Node button -- only for non-trigger nodes */}
			{selectedNode && selectedNode.type !== "trigger" && onDeleteNode && (
				<div className="p-6 border-t border-border">
					<Button
						intent="destructive"
						className="w-full"
						onPress={() => {
							if ("id" in selectedNode) {
								onDeleteNode(selectedNode.id);
							}
						}}
					>
						<Trash2 className="h-4 w-4 mr-2" />
						Delete Node
					</Button>
				</div>
			)}
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
		<div className="space-y-6">
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
	allNodes,
}: {
	node?: WorkflowNode;
	triggerObjectType: string;
	onChange: (updates: Partial<WorkflowNode>) => void;
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

	// Find nodes that are linked as true/false branches (for display only)
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

			{/* Branch Info (read-only display -- insertion handled by edge plus buttons) */}
			<div className="border-t border-border pt-6 space-y-4">
				<div className="text-sm font-semibold text-foreground">Branches</div>

				<div className="space-y-3">
					<div className="flex items-center gap-2 text-sm">
						<div className="w-2 h-2 rounded-full bg-emerald-500" />
						<span className="text-muted-foreground">Yes:</span>
						<span className="font-medium">
							{trueNode
								? trueNode.type === "condition"
									? "Condition"
									: "Action"
								: "End"}
						</span>
					</div>
					<div className="flex items-center gap-2 text-sm">
						<div className="w-2 h-2 rounded-full bg-rose-400" />
						<span className="text-muted-foreground">No:</span>
						<span className="font-medium">
							{falseNode
								? falseNode.type === "condition"
									? "Condition"
									: "Action"
								: "End"}
						</span>
					</div>
				</div>

				<p className="text-xs text-muted-foreground">
					Use the + buttons on the canvas edges to add nodes to branches.
				</p>
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
		<div className="space-y-6">
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
