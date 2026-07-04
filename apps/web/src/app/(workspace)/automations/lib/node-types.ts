/**
 * Workflow builder type system — a thin veneer over the shared backend model.
 *
 * The single source of truth for node/trigger/condition shapes is
 * packages/backend/convex/lib/workflowTypes.ts, and for per-entity field
 * metadata packages/backend/convex/lib/fieldRegistry.ts (both imported via
 * @onetool/backend subpath exports; neither pulls in _generated). This file
 * re-exports that model and adds editor-only types: React Flow node data
 * payloads and the in-progress trigger draft.
 */

import type { Node, Edge } from "@xyflow/react";
import type {
	AutomationAction,
	AutomationObjectType,
	WorkflowNodeConfig,
	WorkflowNodeType,
} from "@onetool/backend/convex/lib/workflowTypes";
import { AUTOMATION_OBJECT_TYPES } from "@onetool/backend/convex/lib/workflowTypes";
import { RELATED_OBJECTS } from "@onetool/backend/convex/lib/fieldRegistry";

// ---------------------------------------------------------------------------
// 1. Shared model re-exports
// ---------------------------------------------------------------------------

export {
	AUTOMATION_OBJECT_TYPES,
	CONDITION_OPERATORS,
	VALUELESS_OPERATORS,
	NODE_TYPES,
	MAX_FETCH_LIMIT,
	DEFAULT_FETCH_LIMIT,
	MAX_LOOP_ITERATIONS,
	MAX_CONDITION_GROUPS,
	MAX_RULES_PER_GROUP,
	MAX_DELAY_MS,
	DELAY_UNIT_MS,
	MAX_DUE_IN_DAYS,
	AGGREGATE_OPERATIONS,
	ADJUST_TIME_UNITS,
	ADJUST_TIME_UNIT_MS,
} from "@onetool/backend/convex/lib/workflowTypes";

export type {
	AutomationObjectType,
	AutomationTrigger,
	AutomationTriggerV2,
	AutomationStatus,
	AutomationAction,
	ActionTarget,
	ConditionOperator,
	ConditionRule,
	ConditionGroup,
	ValueRef,
	WorkflowNodeConfig,
	WorkflowNodeType,
	AggregateOperation,
	AdjustTimeUnit,
} from "@onetool/backend/convex/lib/workflowTypes";

export {
	FIELD_REGISTRY,
	OPERATORS_BY_TYPE,
	RELATED_OBJECTS,
	RELATION_FIELD,
	getFieldDefinition,
	getWritableFields,
	getFilterableFields,
	operatorsForField,
	getStatusOptions,
} from "@onetool/backend/convex/lib/fieldRegistry";

export type {
	FieldDefinition,
	FieldType,
} from "@onetool/backend/convex/lib/fieldRegistry";

export {
	DEFAULT_SCHEDULE_TIME,
	describeSchedule,
	validateSchedule,
} from "@onetool/backend/convex/lib/schedule";

export type { AutomationSchedule } from "@onetool/backend/convex/lib/workflowTypes";

// ---------------------------------------------------------------------------
// 2. Object-type UI options
// ---------------------------------------------------------------------------

export const OBJECT_TYPE_LABELS: Record<AutomationObjectType, string> = {
	client: "Client",
	project: "Project",
	quote: "Quote",
	invoice: "Invoice",
	task: "Task",
};

export const OBJECT_TYPE_OPTIONS: {
	value: AutomationObjectType;
	label: string;
}[] = AUTOMATION_OBJECT_TYPES.map((value) => ({
	value,
	label: OBJECT_TYPE_LABELS[value],
}));

// ---------------------------------------------------------------------------
// 3. Per-kind config aliases (narrowed from the shared discriminated union)
// ---------------------------------------------------------------------------

export type ConditionNodeConfig = Extract<
	WorkflowNodeConfig,
	{ kind: "condition" }
>;
export type ActionNodeConfig = Extract<WorkflowNodeConfig, { kind: "action" }>;
export type FetchNodeConfig = Extract<
	WorkflowNodeConfig,
	{ kind: "fetch_records" }
>;
export type LoopNodeConfig = Extract<WorkflowNodeConfig, { kind: "loop" }>;
export type AggregateNodeConfig = Extract<
	WorkflowNodeConfig,
	{ kind: "aggregate" }
>;
export type AdjustTimeNodeConfig = Extract<
	WorkflowNodeConfig,
	{ kind: "adjust_time" }
>;
export type DelayNodeConfig = Extract<WorkflowNodeConfig, { kind: "delay" }>;
export type DelayUntilNodeConfig = Extract<
	WorkflowNodeConfig,
	{ kind: "delay_until" }
>;

/** Per-action-type aliases (narrowed from the shared action union). */
export type UpdateFieldAction = Extract<AutomationAction, { type: "update_field" }>;
export type CreateTaskAction = Extract<AutomationAction, { type: "create_task" }>;
export type SendNotificationAction = Extract<
	AutomationAction,
	{ type: "send_notification" }
>;
export type SendTeamMessageAction = Extract<
	AutomationAction,
	{ type: "send_team_message" }
>;

// ---------------------------------------------------------------------------
// 4. Editor node — mirrors automations.ts nodeArgValidator, except `config`
//    is optional while the user is still configuring the step. Save-time
//    validation requires every node to have a complete config.
// ---------------------------------------------------------------------------

export interface WorkflowNode {
	id: string;
	type: WorkflowNodeType;
	config?: WorkflowNodeConfig;
	nextNodeId?: string;
	elseNodeId?: string;
	/** Loop body entry point. */
	bodyStartNodeId?: string;
	/** Persisted UI position from manual drag. */
	position?: { x: number; y: number };
}

export type NodeType = WorkflowNodeType;

// ---------------------------------------------------------------------------
// 5. Trigger draft — the editor's in-progress trigger state. Serialized to a
//    v2 AutomationTriggerV2 at save time (see validation.ts / flow-adapter).
//    email_received is intentionally absent: read-only legacy, never writable.
// ---------------------------------------------------------------------------

export type TriggerType =
	| "status_changed"
	| "record_created"
	| "record_updated"
	| "scheduled";

export const TRIGGER_TYPE_OPTIONS: {
	value: TriggerType;
	label: string;
	description: string;
	comingSoon?: boolean;
}[] = [
	{
		value: "status_changed",
		label: "Status changes",
		description: "When a record moves to a specific status",
	},
	{
		value: "record_created",
		label: "Record created",
		description: "When a new record is added",
	},
	{
		value: "record_updated",
		label: "Record updated",
		description: "When fields on a record change",
	},
	{
		value: "scheduled",
		label: "On a schedule",
		description: "Runs daily, weekly, or monthly",
	},
];

export type TriggerConfig = {
	type?: TriggerType;
	objectType?: AutomationObjectType;
	/** status_changed */
	fromStatus?: string;
	toStatus?: string;
	/** record_updated — fire only when one of these fields changed. */
	fields?: string[];
	/** scheduled (Slice 2) */
	schedule?: {
		frequency: "daily" | "weekly" | "monthly";
		timezone: string;
		time?: string;
		dayOfWeek?: number;
		dayOfMonth?: number;
	};
};

// ---------------------------------------------------------------------------
// 6. Action target UI options (derived from the registry relations map)
// ---------------------------------------------------------------------------

export type ActionTargetOption = {
	/** "self" or the related object type. */
	value: "self" | AutomationObjectType;
	label: string;
	/** The object type the target resolves to (drives field pickers). */
	objectType: AutomationObjectType;
};

export function getTargetOptions(
	objectType: AutomationObjectType
): ActionTargetOption[] {
	return [
		{
			value: "self",
			label: `This ${OBJECT_TYPE_LABELS[objectType]}`,
			objectType,
		},
		...RELATED_OBJECTS[objectType].map((related) => ({
			value: related,
			label: `Related ${OBJECT_TYPE_LABELS[related]}`,
			objectType: related,
		})),
	];
}

// ---------------------------------------------------------------------------
// 7. React Flow node data types (per RF v12 Node<T, string> generics)
// ---------------------------------------------------------------------------

export type TriggerNodeData = {
	nodeType: "trigger";
	trigger: TriggerConfig;
	triggerObjectType: AutomationObjectType | null;
};

export type TriggerPlaceholderNodeData = {
	nodeType: "triggerPlaceholder";
};

export type ConditionNodeData = {
	nodeType: "condition";
	config?: ConditionNodeConfig;
	triggerObjectType: AutomationObjectType | null;
	_dbNode: WorkflowNode;
};

export type ActionNodeData = {
	nodeType: "action";
	config?: ActionNodeConfig;
	triggerObjectType: AutomationObjectType | null;
	_dbNode: WorkflowNode;
};

export type FetchNodeData = {
	nodeType: "fetch_records";
	config?: FetchNodeConfig;
	triggerObjectType: AutomationObjectType | null;
	_dbNode: WorkflowNode;
};

export type LoopNodeData = {
	nodeType: "loop";
	config?: LoopNodeConfig;
	triggerObjectType: AutomationObjectType | null;
	_dbNode: WorkflowNode;
};

export type AggregateNodeData = {
	nodeType: "aggregate";
	config?: AggregateNodeConfig;
	triggerObjectType: AutomationObjectType | null;
	_dbNode: WorkflowNode;
};

export type AdjustTimeNodeData = {
	nodeType: "adjust_time";
	config?: AdjustTimeNodeConfig;
	triggerObjectType: AutomationObjectType | null;
	_dbNode: WorkflowNode;
};

export type DelayNodeData = {
	nodeType: "delay";
	config?: DelayNodeConfig;
	triggerObjectType: AutomationObjectType | null;
	_dbNode: WorkflowNode;
};

export type DelayUntilNodeData = {
	nodeType: "delay_until";
	config?: DelayUntilNodeConfig;
	triggerObjectType: AutomationObjectType | null;
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
export type TriggerPlaceholderRFNode = Node<
	TriggerPlaceholderNodeData,
	"triggerPlaceholderNode"
>;
export type ConditionRFNode = Node<ConditionNodeData, "conditionNode">;
export type ActionRFNode = Node<ActionNodeData, "actionNode">;
export type FetchRFNode = Node<FetchNodeData, "fetchNode">;
export type LoopRFNode = Node<LoopNodeData, "loopNode">;
export type AggregateRFNode = Node<AggregateNodeData, "aggregateNode">;
export type AdjustTimeRFNode = Node<AdjustTimeNodeData, "adjustTimeNode">;
export type DelayRFNode = Node<DelayNodeData, "delayNode">;
export type DelayUntilRFNode = Node<DelayUntilNodeData, "delayUntilNode">;
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
	| AggregateRFNode
	| AdjustTimeRFNode
	| DelayRFNode
	| DelayUntilRFNode
	| EndRFNode
	| PlaceholderRFNode
	| TerminalRFNode;

// ---------------------------------------------------------------------------
// 9. AppEdge type
// ---------------------------------------------------------------------------

export type BranchType = "next" | "yes" | "no" | "each" | "after" | "loop_back";

export type EdgeData = {
	branchType?: BranchType;
	label?: string;
	variant?: string;
	isTerminal?: boolean;
	/** actionType selects the action variant when nodeType is "action". */
	onInsertNode?: (edgeId: string, nodeType: string, actionType?: string) => void;
};

export type AppEdge = Edge<EdgeData>;
