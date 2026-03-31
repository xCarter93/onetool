/**
 * Discriminated union type system for workflow automation nodes.
 *
 * Every node type has its own typed config shape. The discriminated union
 * keyed on `type` makes invalid combinations (e.g. condition + action on
 * same node) structurally impossible. Adding new node types in Phase 10
 * is additive -- just add a new union member.
 */

import type { Node, Edge } from "@xyflow/react";
import type { TriggerConfig, TriggerType } from "../components/trigger-node";

// Re-export trigger types for convenience
export type { TriggerConfig, TriggerType };

// ---------------------------------------------------------------------------
// 1. Shared operator type (extracted for use in both NodeBase and ConditionConfig)
// ---------------------------------------------------------------------------

export type ConditionOperator =
	| "equals"
	| "not_equals"
	| "contains"
	| "exists"
	| "greater_than"
	| "less_than"
	| "is_true"
	| "is_false"
	| "before"
	| "after";

// ---------------------------------------------------------------------------
// 2. NodeBase -- shared fields across all node types
// ---------------------------------------------------------------------------

export interface NodeBase {
	id: string;
	nextNodeId?: string;
	elseNodeId?: string;
	/**
	 * @deprecated Legacy field -- use `config` on ConditionNode instead.
	 * Kept for backward compatibility during migration (Plans 02-05).
	 */
	condition?: {
		field: string;
		operator: ConditionOperator;
		value: unknown;
	};
	/**
	 * @deprecated Legacy field -- use `config` on ActionNode instead.
	 * Kept for backward compatibility during migration (Plans 02-05).
	 */
	action?: {
		targetType: "self" | "project" | "client" | "quote" | "invoice";
		actionType: "update_status" | "update_field" | "send_notification" | "create_record";
		newStatus: string;
		field?: string;
		value?: unknown;
		notificationRecipient?: string;
		notificationMessage?: string;
		createRecordType?: "task" | "project";
		createRecordFields?: Record<string, unknown>;
	};
}

// ---------------------------------------------------------------------------
// 3. Per-type config interfaces
// ---------------------------------------------------------------------------

export type ConditionConfig = {
	field: string;
	operator: ConditionOperator;
	value: unknown;
};

export type ActionConfig = {
	targetType: "self" | "project" | "client" | "quote" | "invoice";
	actionType: "update_field" | "send_notification" | "create_record";
	/** Backward compat for existing automations using update_status */
	newStatus?: string;
	field?: string;
	value?: unknown;
	notificationRecipient?: string;
	notificationMessage?: string;
	createRecordType?: "task" | "project";
	createRecordFields?: Record<string, unknown>;
};

export type FetchConfig = {
	entityType: "client" | "project" | "quote" | "invoice" | "task";
	filters?: Array<{ field: string; operator: string; value: unknown }>;
	limit?: number;
};

// ---------------------------------------------------------------------------
// 4. Discriminated union WorkflowNode
// ---------------------------------------------------------------------------

export type WorkflowNode =
	| (NodeBase & { type: "condition"; config?: ConditionConfig })
	| (NodeBase & { type: "action"; config?: ActionConfig })
	| (NodeBase & { type: "fetch_records"; config?: FetchConfig })
	| (NodeBase & { type: "loop"; config?: FetchConfig })
	| (NodeBase & { type: "end" });

// ---------------------------------------------------------------------------
// 5. NodeType literal union (derived from discriminated union)
// ---------------------------------------------------------------------------

export type NodeType = WorkflowNode["type"];

// ---------------------------------------------------------------------------
// 6. Type guards
// ---------------------------------------------------------------------------

export function isConditionNode(
	node: WorkflowNode
): node is Extract<WorkflowNode, { type: "condition" }> {
	return node.type === "condition";
}

export function isActionNode(
	node: WorkflowNode
): node is Extract<WorkflowNode, { type: "action" }> {
	return node.type === "action";
}

export function isFetchNode(
	node: WorkflowNode
): node is Extract<WorkflowNode, { type: "fetch_records" }> {
	return node.type === "fetch_records";
}

export function isLoopNode(
	node: WorkflowNode
): node is Extract<WorkflowNode, { type: "loop" }> {
	return node.type === "loop";
}

export function isEndNode(
	node: WorkflowNode
): node is Extract<WorkflowNode, { type: "end" }> {
	return node.type === "end";
}

// ---------------------------------------------------------------------------
// 7. React Flow node data types (per RF v12 Node<T, string> generics)
// ---------------------------------------------------------------------------

export type TriggerNodeData = {
	nodeType: "trigger";
	trigger: TriggerConfig;
	triggerObjectType: string | null;
};

export type TriggerPlaceholderNodeData = {
	nodeType: "triggerPlaceholder";
};

export type ConditionNodeData = {
	nodeType: "condition";
	config: ConditionConfig;
	triggerObjectType: string | null;
	_dbNode: WorkflowNode;
};

export type ActionNodeData = {
	nodeType: "action";
	config: ActionConfig;
	triggerObjectType: string | null;
	_dbNode: WorkflowNode;
};

export type FetchNodeData = {
	nodeType: "fetch_records";
	config?: FetchConfig;
	triggerObjectType: string | null;
	_dbNode: WorkflowNode;
};

export type LoopNodeData = {
	nodeType: "loop";
	config?: FetchConfig;
	triggerObjectType: string | null;
	_dbNode: WorkflowNode;
};

export type EndNodeData = {
	nodeType: "end";
	_dbNode: WorkflowNode;
};

export type PlaceholderNodeData = {
	nodeType: "placeholder";
};

export type TerminalNodeData = {
	nodeType: "terminal";
};

// ---------------------------------------------------------------------------
// 8. AppNode union (typed RF nodes)
// ---------------------------------------------------------------------------

export type TriggerRFNode = Node<TriggerNodeData, "triggerNode">;
export type TriggerPlaceholderRFNode = Node<TriggerPlaceholderNodeData, "triggerPlaceholderNode">;
export type ConditionRFNode = Node<ConditionNodeData, "conditionNode">;
export type ActionRFNode = Node<ActionNodeData, "actionNode">;
export type FetchRFNode = Node<FetchNodeData, "fetchNode">;
export type LoopRFNode = Node<LoopNodeData, "loopNode">;
export type EndRFNode = Node<EndNodeData, "endNode">;
export type PlaceholderRFNode = Node<PlaceholderNodeData, "placeholderNode">;
export type TerminalRFNode = Node<TerminalNodeData, "terminalNode">;

export type AppNode =
	| TriggerRFNode
	| TriggerPlaceholderRFNode
	| ConditionRFNode
	| ActionRFNode
	| FetchRFNode
	| LoopRFNode
	| EndRFNode
	| PlaceholderRFNode
	| TerminalRFNode;

// ---------------------------------------------------------------------------
// 9. AppEdge type
// ---------------------------------------------------------------------------

export type BranchType = "yes" | "no" | "each" | "after" | "loop_back";

export type EdgeData = {
	branchType?: BranchType;
	label?: string;
	variant?: string;
	isTerminal?: boolean;
	onInsertNode?: (edgeId: string, nodeType: string) => void;
};

export type AppEdge = Edge<EdgeData>;

// ---------------------------------------------------------------------------
// 10. Constants re-exported from workflow-node.tsx and trigger-node.tsx
// ---------------------------------------------------------------------------

/** Field options for conditions, keyed by trigger object type */
export const FIELD_OPTIONS: Record<string, { value: string; label: string }[]> = {
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

/** Target options for actions, keyed by trigger object type */
export const TARGET_OPTIONS: Record<
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
