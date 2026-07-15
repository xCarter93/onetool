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
// Execution limits
// ---------------------------------------------------------------------------

/**
 * Per-fetch ceiling on rows scanned (newest first) in automationExecutor.
 * Exported so the web debug UI's truncation copy stays in sync.
 */
export const FETCH_SCAN_CEILING = 5000;

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
	/**
	 * Left-hand side. Absent => the rule reads `field` off the in-scope record.
	 * Set => the rule compares a scope value (an aggregate result, a fetch count)
	 * and `field` is ignored, which is the only way to branch without a record —
	 * e.g. a scheduled automation asking "is unpaid total over $10k?".
	 * Only legal on condition nodes: a fetch filter and trigger entry criteria
	 * must name a real field, so both reject it.
	 */
	left: v.optional(valueRefValidator),
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

/**
 * Multi-field successor to update_field: one target, one atomic patch. The
 * single-field variant stays valid forever — published snapshots keep running
 * unmodified, and the web editor upgrades legacy configs to a one-row
 * update_fields on load/save (symmetrically, so signatures stay stable).
 */
export const updateFieldsActionValidator = v.object({
	type: v.literal("update_fields"),
	target: actionTargetValidator,
	fields: v.array(
		v.object({
			field: v.string(),
			value: valueRefValidator,
		})
	),
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

/**
 * Generic record creation. Unlike update_fields there is no record in scope to
 * write to — a brand-new record of `objectType` is inserted. Only object types
 * the field registry marks creatable (client/project/task at launch) are
 * accepted; publish validation rejects the rest, so the validator stays wide
 * enough to grow into quote/invoice later without a schema migration.
 * `linkToScope` sets the new record's FK to the in-scope record (e.g. a project
 * created off a client automation gets that client) via the registry relation
 * map — and, like create_task's linkToRecord, needs a record in scope.
 */
export const createRecordActionValidator = v.object({
	type: v.literal("create_record"),
	objectType: objectTypeValidator,
	fields: v.array(
		v.object({
			field: v.string(),
			value: valueRefValidator,
		})
	),
	linkToScope: v.optional(v.boolean()),
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
	updateFieldsActionValidator,
	createTaskActionValidator,
	createRecordActionValidator,
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
	/**
	 * What a failing item does to the run. Absent = "abort", which is what every
	 * snapshot published before this field existed did — so old automations keep
	 * their exact semantics until someone changes this control by hand. The
	 * builder writes "continue" on new loops.
	 */
	onItemError: v.optional(v.union(v.literal("continue"), v.literal("abort"))),
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

/**
 * Terminal only valid inside a loop body: ends the current iteration and
 * continues with the loop's next record (an `end` node there would stop the
 * entire run, and is rejected at save time).
 */
export const nextItemNodeConfigValidator = v.object({
	kind: v.literal("next_item"),
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
	endNodeConfigValidator,
	nextItemNodeConfigValidator
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
	"next_item",
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
	v.literal("end"),
	v.literal("next_item")
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

/**
 * Optional declarative trigger filter (A5-2): the run is only scheduled when
 * the triggering record passes these condition groups, evaluated at event
 * dispatch against the actual record — a non-matching event produces no
 * execution row. Same shape the condition node uses.
 */
export const entryCriteriaValidator = v.object({
	logic: v.union(v.literal("and"), v.literal("or")),
	groups: v.array(conditionGroupValidator),
});

export const statusChangedTriggerValidator = v.object({
	type: v.literal("status_changed"),
	objectType: objectTypeValidator,
	fromStatus: v.optional(v.string()),
	toStatus: v.string(),
	entryCriteria: v.optional(entryCriteriaValidator),
});

export const recordCreatedTriggerValidator = v.object({
	type: v.literal("record_created"),
	objectType: objectTypeValidator,
	entryCriteria: v.optional(entryCriteriaValidator),
});

export const recordUpdatedTriggerValidator = v.object({
	type: v.literal("record_updated"),
	objectType: objectTypeValidator,
	/** Fire only when one of these fields changed; any field if omitted/empty. */
	fields: v.optional(v.array(v.string())),
	entryCriteria: v.optional(entryCriteriaValidator),
});

export const scheduledTriggerValidator = v.object({
	type: v.literal("scheduled"),
	schedule: scheduleValidator,
	/**
	 * @deprecated Ignored. A scheduled run has no triggering record — the
	 * dispatcher passes none, so `trigger.record` is `{}` for the whole walk.
	 * Record scope comes from a fetch_records + loop instead. Still accepted so
	 * stored rows parse; `triggerRecordObjectType()` returns undefined for
	 * scheduled, and writes strip it.
	 */
	objectType: v.optional(objectTypeValidator),
});

export const triggerValidator = v.union(
	statusChangedTriggerValidator,
	recordCreatedTriggerValidator,
	recordUpdatedTriggerValidator,
	scheduledTriggerValidator
);

export type AutomationTrigger = Infer<typeof triggerValidator>;
// v2-only trigger union (legacy/email_received dropped post-migration); kept as
// a distinct alias for call sites that document the narrowed intent.
export type AutomationTriggerV2 =
	| Infer<typeof statusChangedTriggerValidator>
	| Infer<typeof recordCreatedTriggerValidator>
	| Infer<typeof recordUpdatedTriggerValidator>
	| Infer<typeof scheduledTriggerValidator>;

/**
 * The object type of the record the trigger binds to `trigger.record`, or
 * undefined when there is none. Scheduled triggers always return undefined:
 * their stored `objectType` is a dead field (see scheduledTriggerValidator).
 *
 * Single chokepoint — read the trigger's object type through this, never off
 * the trigger directly, or scheduled automations start claiming a record scope
 * the runtime never gives them.
 */
export function triggerRecordObjectType(
	trigger: AutomationTrigger
): AutomationObjectType | undefined {
	if (!("type" in trigger) || trigger.type === "scheduled") return undefined;
	return "objectType" in trigger && trigger.objectType
		? trigger.objectType
		: undefined;
}

// ---------------------------------------------------------------------------
// Formula resources — reusable named expressions (Slice 4.6). Defined once on
// the automation, referenced anywhere as `formula.<id>` / `{{formula.<id>}}`,
// evaluated against the values in scope at each reference point. Snapshotted on
// publish alongside trigger/nodes.
// ---------------------------------------------------------------------------

export const FORMULA_RETURN_TYPES = [
	"number",
	"currency",
	"text",
	"date",
	"boolean",
] as const;

export type FormulaReturnType = (typeof FORMULA_RETURN_TYPES)[number];

export const formulaResourceValidator = v.object({
	/** Stable reference key; must not contain dots (resolvePath splits on them). */
	id: v.string(),
	/** Display name shown in tokens; rename-safe (references use id). */
	name: v.string(),
	returnType: v.union(
		v.literal("number"),
		v.literal("currency"),
		v.literal("text"),
		v.literal("date"),
		v.literal("boolean")
	),
	/** Source text of the expression (see lib/formula). */
	expression: v.string(),
});

export type FormulaResource = Infer<typeof formulaResourceValidator>;

/** Max formula resources per automation. */
export const MAX_FORMULAS = 30;

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
	// True when this node consumed a fetch_records scan that stopped at its
	// scan cap with rows still unscanned (fetch_records/loop/aggregate nodes).
	truncated: v.optional(v.boolean()),
	// Bounded (~4KB) input/output snapshots for the runs viewer.
	input: v.optional(v.any()),
	output: v.optional(v.any()),
	// Set on entries pushed from inside a loop body: which loop, which iteration,
	// and which record. Without these a mid-loop failure can't be traced back to
	// the record that caused it.
	loopNodeId: v.optional(v.string()),
	loopIndex: v.optional(v.number()),
	loopItemId: v.optional(v.string()),
	loopItemLabel: v.optional(v.string()),
});

export type ExecutedNode = Infer<typeof executedNodeValidator>;

// ---------------------------------------------------------------------------
// Per-loop outcome tallies (workflowExecutions.loopSummary)
// ---------------------------------------------------------------------------

/** Item errors kept per loop node; the rest are counted, not listed. */
export const MAX_LOOP_ITEM_ERRORS = 10;

/**
 * Authoritative per-item tallies for one loop node. The execution log is lossy
 * (it truncates at MAX_EXECUTED_ENTRIES and compacts long loops), so counts
 * live here instead of being re-derived from it at read time.
 */
export const loopSummaryValidator = v.object({
	nodeId: v.string(),
	/** Items the loop set out to process, frozen when the first chunk started. */
	total: v.number(),
	succeeded: v.number(),
	failed: v.number(),
	/** Items deleted between chunks — present in `total`, never processed. */
	skipped: v.number(),
	/** First MAX_LOOP_ITEM_ERRORS failures, in item order. */
	errors: v.array(
		v.object({
			index: v.number(),
			itemId: v.string(),
			label: v.optional(v.string()),
			error: v.string(),
			/** True when earlier steps for this item were already applied. */
			partial: v.optional(v.boolean()),
		})
	),
});

export type LoopSummary = Infer<typeof loopSummaryValidator>;
