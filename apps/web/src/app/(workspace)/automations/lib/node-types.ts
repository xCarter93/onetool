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
	ConditionGroup,
} from "@onetool/backend/convex/lib/workflowTypes";
import { AUTOMATION_OBJECT_TYPES } from "@onetool/backend/convex/lib/workflowTypes";
import {
	RELATED_OBJECTS,
	CREATABLE_OBJECT_TYPES,
} from "@onetool/backend/convex/lib/fieldRegistry";

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
	FORMULA_RETURN_TYPES,
	MAX_FORMULAS,
} from "@onetool/backend/convex/lib/workflowTypes";

export type {
	AutomationObjectType,
	AutomationTrigger,
	AutomationTriggerV2,
	AutomationStatus,
	AutomationAction,
	ActionTarget,
	TeamMessageMention,
	ConditionOperator,
	ConditionRule,
	ConditionGroup,
	ValueRef,
	WorkflowNodeConfig,
	WorkflowNodeType,
	AggregateOperation,
	AdjustTimeUnit,
	FormulaResource,
	FormulaReturnType,
} from "@onetool/backend/convex/lib/workflowTypes";

export {
	FIELD_REGISTRY,
	OPERATORS_BY_TYPE,
	RELATED_OBJECTS,
	RELATION_FIELD,
	CREATABLE_OBJECT_TYPES,
	USER_REF_RECIPIENT_FIELDS,
	getFieldDefinition,
	getWritableFields,
	getFilterableFields,
	getCreatableFields,
	getRequiredCreateFields,
	isCreatableObjectType,
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

/** Object types a create_record action may insert (client/project/task today). */
export const CREATABLE_OBJECT_TYPE_OPTIONS: {
	value: AutomationObjectType;
	label: string;
}[] = CREATABLE_OBJECT_TYPES.map((value) => ({
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
export type UpdateFieldsAction = Extract<
	AutomationAction,
	{ type: "update_fields" }
>;
export type CreateTaskAction = Extract<AutomationAction, { type: "create_task" }>;
export type CreateRecordAction = Extract<
	AutomationAction,
	{ type: "create_record" }
>;
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
	/** Condition continuation: where flow resumes after either branch completes. */
	mergeNodeId?: string;
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

/** Fields shared by every trigger draft, regardless of type. */
type TriggerConfigBase = {
	/** status_changed */
	fromStatus?: string;
	toStatus?: string;
	/** record_updated — fire only when one of these fields changed. */
	fields?: string[];
	/** Event triggers — only run when the record matches (A5-2). */
	entryCriteria?: { logic: "and" | "or"; groups: ConditionGroup[] };
	/** scheduled (Slice 2) */
	schedule?: {
		frequency: "daily" | "weekly" | "monthly";
		timezone: string;
		time?: string;
		dayOfWeek?: number;
		dayOfMonth?: number;
	};
};

/**
 * The scheduled variant OMITS objectType — a scheduled run has no triggering
 * record, so there is no object for it to name. Omission (not `objectType?:
 * never`) is deliberate: `never` still typechecks on reads, so it would let
 * every stale `trigger.objectType` site keep compiling. Absent means the
 * compiler names them all.
 */
export type TriggerConfig =
	| (TriggerConfigBase & {
			type?: "status_changed" | "record_created" | "record_updated";
			objectType?: AutomationObjectType;
	  })
	| (TriggerConfigBase & { type: "scheduled" });

/**
 * Operators offered when a condition rule's left side is a variable (a step
 * result or a formula) rather than a record field. No registry entry exists to
 * derive them from, so the set is fixed and deliberately conservative.
 */
export const VARIABLE_LEFT_OPERATORS = [
	"equals",
	"not_equals",
	"greater_than",
	"less_than",
	"gte",
	"lte",
	"is_empty",
	"is_not_empty",
] as const;

/** The object type bound to `trigger.record`, or null when there is none. */
export function triggerScopeObjectType(
	trigger: TriggerConfig | null | undefined
): AutomationObjectType | null {
	if (!trigger || trigger.type === "scheduled") return null;
	return trigger.objectType ?? null;
}

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
};

export type ActionNodeData = {
	nodeType: "action";
	config?: ActionNodeConfig;
	triggerObjectType: AutomationObjectType | null;
};

export type FetchNodeData = {
	nodeType: "fetch_records";
	config?: FetchNodeConfig;
	triggerObjectType: AutomationObjectType | null;
};

export type LoopNodeData = {
	nodeType: "loop";
	config?: LoopNodeConfig;
	triggerObjectType: AutomationObjectType | null;
};

export type AggregateNodeData = {
	nodeType: "aggregate";
	config?: AggregateNodeConfig;
	triggerObjectType: AutomationObjectType | null;
};

export type AdjustTimeNodeData = {
	nodeType: "adjust_time";
	config?: AdjustTimeNodeConfig;
	triggerObjectType: AutomationObjectType | null;
};

export type DelayNodeData = {
	nodeType: "delay";
	config?: DelayNodeConfig;
	triggerObjectType: AutomationObjectType | null;
};

export type DelayUntilNodeData = {
	nodeType: "delay_until";
	config?: DelayUntilNodeConfig;
	triggerObjectType: AutomationObjectType | null;
};

export type EndNodeData = {
	nodeType: "end";
};

export type NextItemNodeData = {
	nodeType: "next_item";
};

export type PlaceholderNodeData = {
	nodeType: "placeholder";
};

export type TerminalNodeData = {
	nodeType: "terminal";
};

/**
 * Ghost "Choose a step" card rendered in an empty condition branch or empty
 * loop body — the same affordance a transient placeholder shows, so lanes
 * look identical whether or not an insert has started. Clicking it inserts
 * a placeholder via its incoming edge. Display-only — never serialized.
 */
export type BranchGhostNodeData = {
	nodeType: "branchGhost";
	/** The incoming branch edge id, used to route the insert. */
	edgeId: string;
	onInsertNode?: (edgeId: string, nodeType: string, actionType?: string) => void;
};

/**
 * Synthetic join point rendered below a condition inside a loop body: both
 * branch tails reconverge here before the loop-back edge returns to the loop
 * header. Display-only — never serialized.
 */
export type MergeNodeData = {
	nodeType: "merge";
	conditionId: string;
};

/** Non-interactive dotted frame rendered behind a loop's body (derived layout). */
export type LoopContainerNodeData = {
	nodeType: "loopContainer";
	loopId: string;
	width: number;
	height: number;
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
export type NextItemRFNode = Node<NextItemNodeData, "nextItemNode">;
export type PlaceholderRFNode = Node<PlaceholderNodeData, "placeholderNode">;
export type TerminalRFNode = Node<TerminalNodeData, "terminalNode">;
export type MergeRFNode = Node<MergeNodeData, "mergeNode">;
export type BranchGhostRFNode = Node<BranchGhostNodeData, "branchGhostNode">;
export type LoopContainerRFNode = Node<LoopContainerNodeData, "loopContainerNode">;

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
	| NextItemRFNode
	| PlaceholderRFNode
	| TerminalRFNode
	| MergeRFNode
	| BranchGhostRFNode
	| LoopContainerRFNode;

// ---------------------------------------------------------------------------
// 9. AppEdge type
// ---------------------------------------------------------------------------

export type BranchType =
	| "next"
	| "yes"
	| "no"
	| "each"
	| "after"
	| "loop_back"
	| "merge_in"
	| "merge";

export type EdgeData = {
	branchType?: BranchType;
	label?: string;
	variant?: string;
	isTerminal?: boolean;
	/**
	 * Dangling condition branch inside a loop body: falling off the end skips
	 * to the next item. Renders an explicit "↩ Next item" marker so the
	 * engine's skip-item semantics are visible on the canvas.
	 */
	impliedNextItem?: boolean;
	/** X of the After-Last edge's vertical run (derived layout, loop edges only). */
	routeRightX?: number;
	/** X of the loop-back edge's vertical run (derived layout, loop edges only). */
	routeLeftX?: number;
	/** Merge-in edge starts at a terminal stub — offset below its "+" button. */
	fromTerminalStub?: boolean;
	/** Edge targets a ghost "Choose a step" card — the card is the insert affordance, hide the edge "+". */
	ghostTarget?: boolean;
	/** Edge lives inside a loop body — renders in the loop's accent color. */
	inLoop?: boolean;
	/** actionType selects the action variant when nodeType is "action". */
	onInsertNode?: (edgeId: string, nodeType: string, actionType?: string) => void;
};

export type AppEdge = Edge<EdgeData>;
