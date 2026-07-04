import { v, type Infer } from "convex/values";

/**
 * Workflow automation v2 data model.
 *
 * Single source of truth for trigger/node shapes, shared by:
 * - schema.ts (table validators)
 * - automations.ts (create/update/publish arg validators)
 * - automationExecutor.ts (execution engine)
 * - apps/web (imported via @onetool/backend for the builder UI)
 *
 * Must stay free of ./_generated imports so the web app can import it
 * without pulling in the backend type cycle.
 */

// ---------------------------------------------------------------------------
// Object types
// ---------------------------------------------------------------------------

export const AUTOMATION_OBJECT_TYPES = [
	"client",
	"project",
	"quote",
	"invoice",
	"task",
] as const;

export type AutomationObjectType = (typeof AUTOMATION_OBJECT_TYPES)[number];

export const objectTypeValidator = v.union(
	v.literal("client"),
	v.literal("project"),
	v.literal("quote"),
	v.literal("invoice"),
	v.literal("task")
);

// ---------------------------------------------------------------------------
// Value references — every configurable input is either a static value or a
// variable path resolved at run time.
//
// Supported variable paths:
//   trigger.record.<field>      field on the triggering record
//   trigger.event.oldValue      previous value (status_changed / record_updated)
//   trigger.event.newValue      new value
//   loop.<loopNodeId>.item.<field>  field on the current loop item
//   loop.<loopNodeId>.index     zero-based loop index
//   node.<fetchNodeId>.count    number of records a fetch node returned
//   node.<computeNodeId>.result value produced by an aggregate/adjust-time node
// ---------------------------------------------------------------------------

export const valueRefValidator = v.union(
	v.object({
		kind: v.literal("static"),
		value: v.union(v.string(), v.number(), v.boolean(), v.null()),
	}),
	v.object({
		kind: v.literal("var"),
		path: v.string(),
		fallback: v.optional(v.union(v.string(), v.number(), v.boolean())),
	})
);

export type ValueRef = Infer<typeof valueRefValidator>;

// ---------------------------------------------------------------------------
// Condition model — two levels: groups combined with `logic`, rules within a
// group combined with the group's own logic.
// ---------------------------------------------------------------------------

export const CONDITION_OPERATORS = [
	"equals",
	"not_equals",
	"contains",
	"not_contains",
	"is_empty",
	"is_not_empty",
	"greater_than",
	"less_than",
	"gte",
	"lte",
	"is_true",
	"is_false",
	"before",
	"after",
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const conditionOperatorValidator = v.union(
	v.literal("equals"),
	v.literal("not_equals"),
	v.literal("contains"),
	v.literal("not_contains"),
	v.literal("is_empty"),
	v.literal("is_not_empty"),
	v.literal("greater_than"),
	v.literal("less_than"),
	v.literal("gte"),
	v.literal("lte"),
	v.literal("is_true"),
	v.literal("is_false"),
	v.literal("before"),
	v.literal("after")
);

/** Operators that do not take a comparison value. */
export const VALUELESS_OPERATORS: readonly ConditionOperator[] = [
	"is_empty",
	"is_not_empty",
	"is_true",
	"is_false",
];

const logicValidator = v.union(v.literal("and"), v.literal("or"));

export const conditionRuleValidator = v.object({
	field: v.string(),
	operator: conditionOperatorValidator,
	value: v.optional(valueRefValidator),
});

export const conditionGroupValidator = v.object({
	logic: logicValidator,
	rules: v.array(conditionRuleValidator),
});

export type ConditionRule = Infer<typeof conditionRuleValidator>;
export type ConditionGroup = Infer<typeof conditionGroupValidator>;

// ---------------------------------------------------------------------------
// Action configs
// ---------------------------------------------------------------------------

/** Which record an action operates on. */
export const actionTargetValidator = v.union(
	// The record in scope: trigger record, or loop item inside a loop body.
	v.literal("self"),
	// A record related to the one in scope (resolved via the field registry
	// relations map, e.g. a task's project, a quote's client).
	v.object({ related: objectTypeValidator })
);

export type ActionTarget = Infer<typeof actionTargetValidator>;

export const updateFieldActionValidator = v.object({
	type: v.literal("update_field"),
	target: actionTargetValidator,
	field: v.string(),
	value: valueRefValidator,
});

export const createTaskActionValidator = v.object({
	type: v.literal("create_task"),
	title: valueRefValidator,
	description: v.optional(valueRefValidator),
	/** Days from execution time; 0 = today. */
	dueInDays: v.optional(v.number()),
	assigneeUserId: v.optional(v.string()),
	/** Link the task to the in-scope record's project/client when resolvable. */
	linkToRecord: v.optional(v.boolean()),
});

export const sendNotificationActionValidator = v.object({
	type: v.literal("send_notification"),
	recipient: v.union(
		v.literal("org_admins"),
		v.literal("record_owner"),
		v.object({ userId: v.string() })
	),
	/** Supports {{trigger.record.<field>}} / {{loop.<id>.item.<field>}} interpolation. */
	message: v.string(),
});

export const sendTeamMessageActionValidator = v.object({
	type: v.literal("send_team_message"),
	recipients: v.union(
		v.literal("all_members"),
		v.literal("admins"),
		v.object({ userIds: v.array(v.string()) })
	),
	title: v.string(),
	/** Supports variable interpolation like send_notification. */
	message: v.string(),
});

export const actionValidator = v.union(
	updateFieldActionValidator,
	createTaskActionValidator,
	sendNotificationActionValidator,
	sendTeamMessageActionValidator
);

export type AutomationAction = Infer<typeof actionValidator>;

// ---------------------------------------------------------------------------
// Node configs (discriminated on `kind`, matching the node's `type`)
// ---------------------------------------------------------------------------

export const conditionNodeConfigValidator = v.object({
	kind: v.literal("condition"),
	logic: logicValidator,
	groups: v.array(conditionGroupValidator),
	/** What record the rules read from. Defaults to "trigger". */
	source: v.optional(
		v.union(v.literal("trigger"), v.object({ loopNodeId: v.string() }))
	),
});

export const actionNodeConfigValidator = v.object({
	kind: v.literal("action"),
	action: actionValidator,
});

export const fetchNodeConfigValidator = v.object({
	kind: v.literal("fetch_records"),
	objectType: objectTypeValidator,
	filters: v.array(conditionGroupValidator),
	/** Defaults to 50; the engine enforces MAX_FETCH_LIMIT. */
	limit: v.optional(v.number()),
	sortBy: v.optional(
		v.object({
			field: v.string(),
			direction: v.union(v.literal("asc"), v.literal("desc")),
		})
	),
});

export const loopNodeConfigValidator = v.object({
	kind: v.literal("loop"),
	/** Node id of the fetch_records node providing the array to iterate. */
	sourceNodeId: v.string(),
	/** Engine enforces MAX_LOOP_ITERATIONS regardless. */
	maxIterations: v.optional(v.number()),
});

export const delayNodeConfigValidator = v.object({
	kind: v.literal("delay"),
	amount: v.number(),
	unit: v.union(v.literal("minutes"), v.literal("hours"), v.literal("days")),
});

export const delayUntilNodeConfigValidator = v.object({
	kind: v.literal("delay_until"),
	/** Static epoch-ms, or a var path resolving to a date field. */
	until: valueRefValidator,
});

export const endNodeConfigValidator = v.object({
	kind: v.literal("end"),
});

// Compute nodes: read from scope, write a value into node.<id>.result. They
// perform no DB writes, so the dry test run executes them for real.

export const AGGREGATE_OPERATIONS = ["sum", "avg", "min", "max"] as const;
export type AggregateOperation = (typeof AGGREGATE_OPERATIONS)[number];

export const aggregateNodeConfigValidator = v.object({
	kind: v.literal("aggregate"),
	/** Node id of the fetch_records node whose records are aggregated. */
	sourceNodeId: v.string(),
	/** Numeric (number/currency) field on the fetched object type. */
	field: v.string(),
	op: v.union(
		v.literal("sum"),
		v.literal("avg"),
		v.literal("min"),
		v.literal("max")
	),
});

export const ADJUST_TIME_UNITS = ["minutes", "hours", "days", "weeks"] as const;
export type AdjustTimeUnit = (typeof ADJUST_TIME_UNITS)[number];

export const adjustTimeNodeConfigValidator = v.object({
	kind: v.literal("adjust_time"),
	/** Base timestamp: static epoch-ms/ISO string, or a var path to a date. */
	base: valueRefValidator,
	amount: v.number(),
	unit: v.union(
		v.literal("minutes"),
		v.literal("hours"),
		v.literal("days"),
		v.literal("weeks")
	),
	direction: v.union(v.literal("add"), v.literal("subtract")),
});

export const nodeConfigValidator = v.union(
	conditionNodeConfigValidator,
	actionNodeConfigValidator,
	fetchNodeConfigValidator,
	loopNodeConfigValidator,
	aggregateNodeConfigValidator,
	adjustTimeNodeConfigValidator,
	delayNodeConfigValidator,
	delayUntilNodeConfigValidator,
	endNodeConfigValidator
);

export type WorkflowNodeConfig = Infer<typeof nodeConfigValidator>;

export const NODE_TYPES = [
	"condition",
	"action",
	"fetch_records",
	"loop",
	"aggregate",
	"adjust_time",
	"delay",
	"delay_until",
	"end",
] as const;

export type WorkflowNodeType = (typeof NODE_TYPES)[number];

export const nodeTypeValidator = v.union(
	v.literal("condition"),
	v.literal("action"),
	v.literal("fetch_records"),
	v.literal("loop"),
	v.literal("aggregate"),
	v.literal("adjust_time"),
	v.literal("delay"),
	v.literal("delay_until"),
	v.literal("end")
);

// ---------------------------------------------------------------------------
// Engine limits
// ---------------------------------------------------------------------------

export const MAX_FETCH_LIMIT = 200;
export const DEFAULT_FETCH_LIMIT = 50;
export const MAX_LOOP_ITERATIONS = 200;
export const MAX_CONDITION_GROUPS = 10;
export const MAX_RULES_PER_GROUP = 10;

/** Delay steps are capped so a run can't park forever. */
export const MAX_DELAY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export const DELAY_UNIT_MS: Record<"minutes" | "hours" | "days", number> = {
	minutes: 60_000,
	hours: 3_600_000,
	days: 86_400_000,
};

/** Fixed-ms offsets for adjust_time (a "day" is always 86.4M ms, DST-agnostic). */
export const ADJUST_TIME_UNIT_MS: Record<AdjustTimeUnit, number> = {
	minutes: 60_000,
	hours: 3_600_000,
	days: 86_400_000,
	weeks: 604_800_000,
};

/** Upper bound for create_task dueInDays. */
export const MAX_DUE_IN_DAYS = 365;

// ---------------------------------------------------------------------------
// Trigger model (v2)
// ---------------------------------------------------------------------------

export const scheduleValidator = v.object({
	frequency: v.union(
		v.literal("daily"),
		v.literal("weekly"),
		v.literal("monthly")
	),
	/** IANA timezone, e.g. "America/New_York". */
	timezone: v.string(),
	/** "HH:MM" 24h local time; defaults to "09:00". */
	time: v.optional(v.string()),
	/** 0 (Sunday) – 6 (Saturday); required for weekly. */
	dayOfWeek: v.optional(v.number()),
	/** 1–31, clamped to month length; required for monthly. */
	dayOfMonth: v.optional(v.number()),
});

export type AutomationSchedule = Infer<typeof scheduleValidator>;

export const statusChangedTriggerValidator = v.object({
	type: v.literal("status_changed"),
	objectType: objectTypeValidator,
	fromStatus: v.optional(v.string()),
	toStatus: v.string(),
});

export const recordCreatedTriggerValidator = v.object({
	type: v.literal("record_created"),
	objectType: objectTypeValidator,
});

export const recordUpdatedTriggerValidator = v.object({
	type: v.literal("record_updated"),
	objectType: objectTypeValidator,
	/** @deprecated v1.2 single-field filter; migrated into `fields`. */
	field: v.optional(v.string()),
	/** Fire only when one of these fields changed; any field if omitted/empty. */
	fields: v.optional(v.array(v.string())),
});

export const scheduledTriggerValidator = v.object({
	type: v.literal("scheduled"),
	schedule: scheduleValidator,
	/**
	 * When set, the automation runs once per record matching the first
	 * fetch_records node (or once with no record scope if none).
	 */
	objectType: v.optional(objectTypeValidator),
});

/** Retained for stored rows only; not offered in the UI and never fires. */
export const emailReceivedTriggerValidator = v.object({
	type: v.literal("email_received"),
	objectType: v.literal("client"),
});

/** Legacy pre-v1.2 trigger (no `type` field). Migrated to status_changed. */
export const legacyTriggerValidator = v.object({
	objectType: objectTypeValidator,
	fromStatus: v.optional(v.string()),
	toStatus: v.string(),
});

export const triggerValidator = v.union(
	legacyTriggerValidator,
	statusChangedTriggerValidator,
	recordCreatedTriggerValidator,
	recordUpdatedTriggerValidator,
	emailReceivedTriggerValidator,
	scheduledTriggerValidator
);

export type AutomationTrigger = Infer<typeof triggerValidator>;
// Built explicitly rather than via Exclude<AutomationTrigger, legacy>: the
// status_changed shape is width-assignable to the legacy (untyped) shape,
// so Exclude would silently drop it from the union.
export type AutomationTriggerV2 =
	| Infer<typeof statusChangedTriggerValidator>
	| Infer<typeof recordCreatedTriggerValidator>
	| Infer<typeof recordUpdatedTriggerValidator>
	| Infer<typeof scheduledTriggerValidator>;

// ---------------------------------------------------------------------------
// Automation lifecycle
// ---------------------------------------------------------------------------

export const AUTOMATION_STATUSES = ["draft", "active", "paused"] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

export const automationStatusValidator = v.union(
	v.literal("draft"),
	v.literal("active"),
	v.literal("paused")
);

// ---------------------------------------------------------------------------
// Execution log entry — one per node the engine visits. Shared by
// workflowExecutions.nodesExecuted and the test-run cursor's precomputed plan
// (see automationExecutor.ts test-run step machine).
// ---------------------------------------------------------------------------

export const executedNodeResultValidator = v.union(
	v.literal("success"),
	v.literal("skipped"),
	v.literal("failed"),
	v.literal("running")
);

export type ExecutedNodeResult = Infer<typeof executedNodeResultValidator>;

export const executedNodeValidator = v.object({
	nodeId: v.string(),
	result: executedNodeResultValidator,
	error: v.optional(v.string()),
	startedAt: v.optional(v.number()),
	completedAt: v.optional(v.number()),
	recordsProcessed: v.optional(v.number()),
	// Bounded (~4KB) input/output snapshots for the runs viewer.
	input: v.optional(v.any()),
	output: v.optional(v.any()),
});

export type ExecutedNode = Infer<typeof executedNodeValidator>;
