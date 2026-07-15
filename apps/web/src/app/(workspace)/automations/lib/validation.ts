/**
 * Save validation for workflow automations.
 *
 * Catches placeholder nodes, missing/unsupported triggers, and incomplete
 * required config before the user can save. Operates on the React Flow node
 * array (post automationToReactFlow), reading each node's v2 `config`.
 *
 * Mirrors the structural rules the backend enforces at save time
 * (packages/backend/convex/automations.ts validateLoopBodies) so the builder
 * surfaces the same errors before the user hits Save.
 */

import { collectLoopBody } from "./graph-utils";
import type { EditorNode } from "./flow-adapter";
import {
	ADJUST_TIME_UNITS,
	AGGREGATE_OPERATIONS,
	DELAY_UNIT_MS,
	MAX_DELAY_MS,
	MAX_DUE_IN_DAYS,
	MAX_FETCH_LIMIT,
	MAX_LOOP_ITERATIONS,
	VALUELESS_OPERATORS,
	RELATION_FIELD,
	getCreatableFields,
	getFieldDefinition,
	getRequiredCreateFields,
	getWritableFields,
	isCreatableObjectType,
	operatorsForField,
	validateSchedule,
	type ActionNodeConfig,
	type AdjustTimeNodeConfig,
	type AggregateNodeConfig,
	type AutomationObjectType,
	type ConditionNodeConfig,
	type ConditionRule,
	type DelayNodeConfig,
	type DelayUntilNodeConfig,
	type FetchNodeConfig,
	type FieldType,
	type LoopNodeConfig,
	type FormulaResource,
	type TriggerConfig,
	type ValueRef,
	type WorkflowNode,
	triggerScopeObjectType,
} from "./node-types";
import { getScopeObjectType } from "./variables";

export type ValidationResult = {
	valid: boolean;
	errors: Array<{
		type:
			| "placeholder_present"
			| "missing_required_config"
			| "no_trigger"
			| "no_trigger_record"
			| "end_inside_loop"
			| "next_item_outside_loop";
		message: string;
		nodeId?: string;
	}>;
	/** Non-blocking — doesn't affect `valid` or gate save/publish. */
	warnings: Array<{
		type: "loop_condition_dangling_false_branch";
		message: string;
		nodeId?: string;
	}>;
};

/**
 * A `var` value whose fallback's stored type can't satisfy the field it feeds
 * (e.g. a boolean field with a "yes" fallback). Returns a message or null. The
 * typed fallback control prevents new mismatches; this catches legacy configs.
 */
function varFallbackTypeError(
	fieldType: FieldType,
	value: ValueRef | undefined
): string | null {
	if (!value || value.kind !== "var" || value.fallback === undefined) return null;
	const fb = value.fallback;
	switch (fieldType) {
		case "boolean":
			return typeof fb === "boolean" ? null : "fallback must be true or false";
		case "number":
		case "currency":
			return typeof fb === "number" ? null : "fallback must be a number";
		case "date":
			return typeof fb === "number" ? null : "fallback must be a date";
		default:
			return null; // text / select / id accept a string fallback
	}
}

function isRuleComplete(
	objectType: AutomationObjectType | null,
	rule: ConditionRule
): boolean {
	if (rule.left) {
		// Tests a scope value, not a record field — there is no field to check
		// and no registry entry to validate the operator against.
		if (rule.left.kind !== "var" || !rule.left.path.trim()) return false;
	} else {
		if (!rule.field.trim()) return false;
		if (objectType) {
			const operators = operatorsForField(objectType, rule.field);
			if (operators.length > 0 && !operators.includes(rule.operator)) {
				return false;
			}
		}
	}
	const valueless = (VALUELESS_OPERATORS as readonly string[]).includes(
		rule.operator
	);
	if (!valueless) {
		if (rule.value === undefined) return false;
		if (
			rule.value.kind === "static" &&
			(rule.value.value === "" || rule.value.value === null)
		) {
			return false;
		}
	}
	return true;
}

function validateTrigger(
	trigger: TriggerConfig | null,
	errors: ValidationResult["errors"]
): void {
	if (!trigger) {
		errors.push({ type: "no_trigger", message: "No trigger configured" });
		return;
	}

	const triggerObjectType = triggerScopeObjectType(trigger);

	switch (trigger.type ?? "status_changed") {
		case "status_changed":
			if (!triggerObjectType || !trigger.toStatus?.trim()) {
				errors.push({
					type: "missing_required_config",
					message: "Trigger status is required",
				});
			}
			break;
		case "record_created":
		case "record_updated":
			if (!triggerObjectType) {
				errors.push({
					type: "missing_required_config",
					message: "Trigger object type is required",
				});
			}
			break;
		case "scheduled": {
			if (!trigger.schedule) {
				errors.push({
					type: "missing_required_config",
					message: "Configure the schedule",
				});
				break;
			}
			// Same rules the backend enforces (timezone/time/day bounds).
			const scheduleError = validateSchedule(trigger.schedule);
			if (scheduleError) {
				errors.push({
					type: "missing_required_config",
					message: scheduleError,
				});
			}
			break;
		}
	}

	// Entry criteria (A5-2): absent/empty is fine; started-but-incomplete
	// rules block save, mirroring condition-node completeness.
	if (trigger.entryCriteria) {
		const objectType = triggerObjectType;
		// Entry criteria run against records being matched, so a rule must name a
		// real field — the backend rejects a variable left side here too.
		const hasVariableLeft = trigger.entryCriteria.groups.some((group) =>
			group.rules.some((rule) => rule.left !== undefined)
		);
		if (hasVariableLeft) {
			errors.push({
				type: "missing_required_config",
				message: "Entry criteria must compare a field on the record",
			});
		}
		const incomplete = trigger.entryCriteria.groups.some((group) =>
			group.rules.some((rule) => !isRuleComplete(objectType, rule))
		);
		if (incomplete) {
			errors.push({
				type: "missing_required_config",
				message:
					"Finish the trigger's entry criteria or remove the empty condition",
			});
		}
	}
}

function validateConditionNode(
	nodeId: string,
	config: ConditionNodeConfig | undefined,
	// The object type the condition's fields read from — the loop item inside
	// a loop body, else the trigger record (see getScopeObjectType).
	objectType: AutomationObjectType | null,
	// Node sits inside a loop body and has no configured false (No) branch.
	inLoopWithDanglingFalseBranch: boolean,
	errors: ValidationResult["errors"],
	warnings: ValidationResult["warnings"]
): void {
	if (!config || config.groups.length === 0) {
		errors.push({
			type: "missing_required_config",
			message: "Add at least one condition",
			nodeId,
		});
		return;
	}
	const hasCompleteRule = config.groups.some((group) =>
		group.rules.some((rule) => isRuleComplete(objectType, rule))
	);
	if (!hasCompleteRule) {
		errors.push({
			type: "missing_required_config",
			message: "Finish configuring the condition",
			nodeId,
		});
	}

	// The walk engine (automationExecutor.ts) treats a missing elseNodeId as
	// "end this iteration" inside a loop body — not an error, but easy to miss.
	if (inLoopWithDanglingFalseBranch) {
		warnings.push({
			type: "loop_condition_dangling_false_branch",
			message:
				"The No branch ends this loop iteration for the current item. Add a step to the No branch if that's not intended.",
			nodeId,
		});
	}
}

function validateActionNode(
	nodeId: string,
	config: ActionNodeConfig | undefined,
	// The object type `target: "self"` resolves to at this node — the loop item
	// inside a loop body, else the trigger record (see getScopeObjectType).
	scopeObjectType: AutomationObjectType | null,
	// True for a scheduled trigger outside a loop — the one null-scope case that
	// deserves the "runs on a schedule" guidance. The others (no trigger, record
	// trigger without an object type, unconfigured fetch feeding a loop) are
	// already flagged at their own source.
	scheduledTopLevel: boolean,
	errors: ValidationResult["errors"]
): void {
	if (!config) {
		errors.push({
			type: "missing_required_config",
			message: "Configure this action",
			nodeId,
		});
		return;
	}

	const action = config.action;

	switch (action.type) {
		case "update_field": {
			if (!scopeObjectType) {
				if (scheduledTopLevel) {
					// The trigger is fine — there is simply no record for the action
					// to touch.
					errors.push({
						type: "no_trigger_record",
						message:
							"This automation runs on a schedule, so there is no record to update. Add a Find records step and move this action inside a Loop.",
						nodeId,
					});
				}
				return;
			}

			const targetObjectType: AutomationObjectType =
				action.target === "self" ? scopeObjectType : action.target.related;
			const writable = getWritableFields(targetObjectType);
			const field = writable.find((f) => f.key === action.field);
			if (!field) {
				errors.push({
					type: "missing_required_config",
					message: "Choose a field to update",
					nodeId,
				});
				return;
			}

			const value = action.value;
			const isEmpty =
				value.kind === "static" && (value.value === null || value.value === "");
			if (field.type !== "boolean" && isEmpty) {
				errors.push({
					type: "missing_required_config",
					message: "Set a value to update the field to",
					nodeId,
				});
			}
			break;
		}
		case "update_fields": {
			if (!scopeObjectType) {
				if (scheduledTopLevel) {
					errors.push({
						type: "no_trigger_record",
						message:
							"This automation runs on a schedule, so there is no record to update. Add a Find records step and move this action inside a Loop.",
						nodeId,
					});
				}
				return;
			}

			if (action.fields.length === 0) {
				errors.push({
					type: "missing_required_config",
					message: "Add at least one field to update",
					nodeId,
				});
				return;
			}

			const targetObjectType: AutomationObjectType =
				action.target === "self" ? scopeObjectType : action.target.related;
			const writable = getWritableFields(targetObjectType);
			const seen = new Set<string>();
			for (const row of action.fields) {
				if (row.field && seen.has(row.field)) {
					errors.push({
						type: "missing_required_config",
						message: `Field "${row.field}" appears more than once — remove one of the rows`,
						nodeId,
					});
					return;
				}
				if (row.field) seen.add(row.field);

				const field = writable.find((f) => f.key === row.field);
				if (!field) {
					errors.push({
						type: "missing_required_config",
						message: "Choose a field to update",
						nodeId,
					});
					return;
				}

				const isEmpty =
					row.value.kind === "static" &&
					(row.value.value === null || row.value.value === "");
				if (isEmpty) {
					errors.push({
						type: "missing_required_config",
						message: `Set a value for ${field.label}`,
						nodeId,
					});
					return;
				}

				const fbErr = varFallbackTypeError(field.type, row.value);
				if (fbErr) {
					errors.push({
						type: "missing_required_config",
						message: `${field.label}: ${fbErr}`,
						nodeId,
					});
					return;
				}
			}
			break;
		}
		case "create_record": {
			const objectType = action.objectType;
			if (!isCreatableObjectType(objectType)) {
				errors.push({
					type: "missing_required_config",
					message: `Creating ${objectType} records from automations isn't supported yet`,
					nodeId,
				});
				return;
			}

			// linkToScope needs a record in scope; on a scheduled top-level step
			// there is none.
			if (action.linkToScope && !scopeObjectType) {
				if (scheduledTopLevel) {
					errors.push({
						type: "no_trigger_record",
						message: `This automation runs on a schedule, so there is no record to link this new ${objectType} to. Turn off "Link to record", or move this inside a Loop.`,
						nodeId,
					});
					return;
				}
			}

			const creatable = getCreatableFields(objectType);
			const requiredKeys = new Set(
				getRequiredCreateFields(objectType).map((f) => f.key)
			);
			const linkFk =
				action.linkToScope && scopeObjectType
					? RELATION_FIELD[objectType]?.[scopeObjectType]
					: undefined;
			if (action.linkToScope && scopeObjectType && !linkFk) {
				errors.push({
					type: "missing_required_config",
					message: `A new ${objectType} can't be linked to a ${scopeObjectType}`,
					nodeId,
				});
				return;
			}

			const seen = new Set<string>();
			for (const row of action.fields) {
				if (row.field && seen.has(row.field)) {
					errors.push({
						type: "missing_required_config",
						message: `Field "${row.field}" appears more than once — remove one of the rows`,
						nodeId,
					});
					return;
				}
				if (row.field) seen.add(row.field);

				const field = creatable.find((f) => f.key === row.field);
				if (!field) {
					errors.push({
						type: "missing_required_config",
						message: "Choose a field to set",
						nodeId,
					});
					return;
				}

				const isEmpty =
					row.value.kind === "static" &&
					(row.value.value === null || row.value.value === "");
				if (isEmpty) {
					errors.push({
						type: "missing_required_config",
						message: `Set a value for ${field.label}`,
						nodeId,
					});
					return;
				}

				const fbErr = varFallbackTypeError(field.type, row.value);
				if (fbErr) {
					errors.push({
						type: "missing_required_config",
						message: `${field.label}: ${fbErr}`,
						nodeId,
					});
					return;
				}
			}

			// Required fields must be supplied as a row or via the scope link.
			for (const key of requiredKeys) {
				if (action.fields.some((r) => r.field === key)) continue;
				if (linkFk === key) continue;
				// An unresolved link (scope type unknown) may still fill it — defer.
				if (action.linkToScope && !scopeObjectType) continue;
				const def = creatable.find((f) => f.key === key);
				errors.push({
					type: "missing_required_config",
					message: `${def?.label ?? key} is required to create a ${objectType}`,
					nodeId,
				});
				return;
			}
			break;
		}
		case "create_task": {
			const title = action.title;
			const titleEmpty =
				title.kind === "static" &&
				(title.value === null || String(title.value).trim() === "");
			if (titleEmpty) {
				errors.push({
					type: "missing_required_config",
					message: "Set a task title",
					nodeId,
				});
			}
			if (action.dueInDays !== undefined) {
				if (
					!Number.isInteger(action.dueInDays) ||
					action.dueInDays < 0 ||
					action.dueInDays > MAX_DUE_IN_DAYS
				) {
					errors.push({
						type: "missing_required_config",
						message: `Due in must be between 0 and ${MAX_DUE_IN_DAYS} days`,
						nodeId,
					});
				}
			}
			break;
		}
		case "send_notification": {
			if (!action.message.trim()) {
				errors.push({
					type: "missing_required_config",
					message: "Write a notification message",
					nodeId,
				});
			}
			if (typeof action.recipient !== "string" && !action.recipient.userId) {
				errors.push({
					type: "missing_required_config",
					message: "Choose who to notify",
					nodeId,
				});
			}
			break;
		}
		case "send_team_message": {
			if (!action.message.trim()) {
				errors.push({
					type: "missing_required_config",
					message: "Write a team message",
					nodeId,
				});
			}
			if (
				typeof action.recipients !== "string" &&
				action.recipients.userIds.length === 0
			) {
				errors.push({
					type: "missing_required_config",
					message: "Choose who to message",
					nodeId,
				});
			}
			break;
		}
	}
}

function validateFetchNode(
	nodeId: string,
	config: FetchNodeConfig | undefined,
	errors: ValidationResult["errors"]
): void {
	if (!config || !config.objectType) {
		errors.push({
			type: "missing_required_config",
			message: "Choose what to fetch",
			nodeId,
		});
		return;
	}

	for (const group of config.filters) {
		for (const rule of group.rules) {
			if (!isRuleComplete(config.objectType, rule)) {
				errors.push({
					type: "missing_required_config",
					message: "Finish configuring the fetch filters",
					nodeId,
				});
				return;
			}
		}
	}

	if (config.limit !== undefined) {
		if (
			!Number.isInteger(config.limit) ||
			config.limit < 1 ||
			config.limit > MAX_FETCH_LIMIT
		) {
			errors.push({
				type: "missing_required_config",
				message: `Limit must be between 1 and ${MAX_FETCH_LIMIT}`,
				nodeId,
			});
		}
	}
}

function validateLoopNode(
	nodeId: string,
	config: LoopNodeConfig | undefined,
	nodes: EditorNode[],
	workflowNodes: WorkflowNode[],
	errors: ValidationResult["errors"]
): void {
	if (!config?.sourceNodeId) {
		errors.push({
			type: "missing_required_config",
			message: 'Loops need a "Find records" step to run earlier in the workflow',
			nodeId,
		});
		return;
	}
	const source = nodes.find((n) => n.id === config.sourceNodeId);
	if (!source || source.type !== "fetch_records") {
		errors.push({
			type: "missing_required_config",
			message: 'Loops need a "Find records" step to run earlier in the workflow',
			nodeId,
		});
		return;
	}

	if (config.maxIterations !== undefined) {
		if (
			!Number.isInteger(config.maxIterations) ||
			config.maxIterations < 1 ||
			config.maxIterations > MAX_LOOP_ITERATIONS
		) {
			errors.push({
				type: "missing_required_config",
				message: `Max iterations must be between 1 and ${MAX_LOOP_ITERATIONS}`,
				nodeId,
			});
		}
	}

	// Mirrors validateLoopBodies in automations.ts: no nested loops, no delay
	// steps inside a loop body (the walk engine can't checkpoint mid-loop).
	const body = collectLoopBody(nodeId, workflowNodes);
	const byId = new Map(workflowNodes.map((n) => [n.id, n]));
	for (const memberId of body) {
		if (memberId === nodeId) continue;
		const member = byId.get(memberId);
		if (!member) continue;
		if (member.type === "loop") {
			errors.push({
				type: "missing_required_config",
				message: "Loops can't contain other loops",
				nodeId,
			});
			break;
		}
		if (member.type === "delay" || member.type === "delay_until") {
			errors.push({
				type: "missing_required_config",
				message: "Delay steps aren't supported inside loops",
				nodeId,
			});
			break;
		}
	}
}

function validateAggregateNode(
	nodeId: string,
	config: AggregateNodeConfig | undefined,
	nodes: EditorNode[],
	errors: ValidationResult["errors"]
): void {
	if (!config?.sourceNodeId) {
		errors.push({
			type: "missing_required_config",
			message: 'Aggregates need a "Find records" step to run earlier in the workflow',
			nodeId,
		});
		return;
	}
	const source = nodes.find((n) => n.id === config.sourceNodeId);
	if (!source || source.type !== "fetch_records") {
		errors.push({
			type: "missing_required_config",
			message: 'Aggregates need a "Find records" step to run earlier in the workflow',
			nodeId,
		});
		return;
	}

	if (!config.field.trim()) {
		errors.push({
			type: "missing_required_config",
			message: "Choose a field to aggregate",
			nodeId,
		});
		return;
	}

	if (!(AGGREGATE_OPERATIONS as readonly string[]).includes(config.op)) {
		errors.push({
			type: "missing_required_config",
			message: "Choose an aggregate operation",
			nodeId,
		});
		return;
	}

	// Mirror the backend (automations.ts): aggregates only run over numeric
	// fields. Resolve the field on the SOURCE fetch node's object type and
	// reject anything else inline, else the backend fails with a generic toast.
	// Skip when the source has no object type yet — validateFetchNode flags that.
	const sourceObjectType = (
		(source as WorkflowNode).config as FetchNodeConfig | undefined
	)?.objectType;
	if (sourceObjectType) {
		const def = getFieldDefinition(sourceObjectType, config.field);
		if (!def || (def.type !== "number" && def.type !== "currency")) {
			errors.push({
				type: "missing_required_config",
				message: "Aggregate needs a number or currency field",
				nodeId,
			});
		}
	}
}

function validateAdjustTimeNode(
	nodeId: string,
	config: AdjustTimeNodeConfig | undefined,
	errors: ValidationResult["errors"]
): void {
	if (!config?.base) {
		errors.push({
			type: "missing_required_config",
			message: "Set a base time to adjust",
			nodeId,
		});
		return;
	}

	if (config.base.kind === "static") {
		const raw = config.base.value;
		if (raw === null || raw === undefined || raw === "") {
			errors.push({
				type: "missing_required_config",
				message: "Choose a base date",
				nodeId,
			});
			return;
		}
		const date = typeof raw === "number" ? new Date(raw) : new Date(String(raw));
		if (Number.isNaN(date.getTime())) {
			errors.push({
				type: "missing_required_config",
				message: "Choose a valid base date",
				nodeId,
			});
			return;
		}
	}

	if (!Number.isInteger(config.amount) || config.amount < 0) {
		errors.push({
			type: "missing_required_config",
			message: "Adjust amount must be a whole number of at least 0",
			nodeId,
		});
		return;
	}

	if (!(ADJUST_TIME_UNITS as readonly string[]).includes(config.unit)) {
		errors.push({
			type: "missing_required_config",
			message: "Choose a time unit",
			nodeId,
		});
		return;
	}

	if (config.direction !== "add" && config.direction !== "subtract") {
		errors.push({
			type: "missing_required_config",
			message: "Choose whether to add or subtract",
			nodeId,
		});
	}
}

function validateDelayNode(
	nodeId: string,
	config: DelayNodeConfig | undefined,
	errors: ValidationResult["errors"]
): void {
	if (!config) {
		errors.push({
			type: "missing_required_config",
			message: "Set how long to wait",
			nodeId,
		});
		return;
	}
	if (!Number.isInteger(config.amount) || config.amount < 1) {
		errors.push({
			type: "missing_required_config",
			message: "Delay amount must be a whole number of at least 1",
			nodeId,
		});
		return;
	}
	if (config.amount * DELAY_UNIT_MS[config.unit] > MAX_DELAY_MS) {
		errors.push({
			type: "missing_required_config",
			message: `Delay can't exceed ${Math.floor(MAX_DELAY_MS / DELAY_UNIT_MS.days)} days`,
			nodeId,
		});
	}
}

function validateDelayUntilNode(
	nodeId: string,
	config: DelayUntilNodeConfig | undefined,
	errors: ValidationResult["errors"]
): void {
	if (!config?.until) {
		errors.push({
			type: "missing_required_config",
			message: "Set when this step should run",
			nodeId,
		});
		return;
	}

	if (config.until.kind === "static") {
		const raw = config.until.value;
		if (raw === null || raw === undefined || raw === "") {
			errors.push({
				type: "missing_required_config",
				message: "Choose a date",
				nodeId,
			});
			return;
		}
		const date = typeof raw === "number" ? new Date(raw) : new Date(String(raw));
		if (Number.isNaN(date.getTime())) {
			errors.push({
				type: "missing_required_config",
				message: "Choose a valid date",
				nodeId,
			});
		}
	}
	// var kind: resolved at run time — nothing further to check here.
}

const TEMPLATE_TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Scope paths a config reads: var refs plus {{tokens}} inside static strings. */
function collectConfigPaths(value: unknown, out: string[] = []): string[] {
	if (typeof value === "string") {
		for (const match of value.matchAll(TEMPLATE_TOKEN)) out.push(match[1].trim());
		return out;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectConfigPaths(item, out);
		return out;
	}
	if (value !== null && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		if (obj.kind === "var" && typeof obj.path === "string") out.push(obj.path);
		for (const key of Object.keys(obj)) collectConfigPaths(obj[key], out);
	}
	return out;
}

function readsTriggerRecord(path: string): boolean {
	return /^trigger\.(record|event)\b/.test(path);
}

/**
 * Mirrors the backend (automations.ts validateScheduledRecordScope) so a broken
 * scheduled automation fails inline at save rather than throwing from the
 * server. A scheduled run walks with trigger.record = {}, so anything reading or
 * acting on the trigger record is dead.
 *
 * Keyed on loop-body membership, never on the stored condition `source`: inside
 * a loop the record in scope IS the loop item, and legacy in-loop conditions
 * carry source "trigger" but run correctly.
 */
function validateScheduledRecordScope(
	nodes: EditorNode[],
	workflowNodes: WorkflowNode[],
	errors: ValidationResult["errors"]
): void {
	for (const node of nodes) {
		const config = (node as WorkflowNode).config;
		if (!config) continue;

		const deadPath = collectConfigPaths(config).find(readsTriggerRecord);
		if (deadPath) {
			errors.push({
				type: "no_trigger_record",
				message: `"${deadPath}" is always empty — a scheduled automation has no triggering record. Add a Find records step and read the loop item instead.`,
				nodeId: node.id,
			});
			continue;
		}

		const inLoop = getScopeObjectType(workflowNodes, node.id, null).inLoop;
		if (inLoop) continue;

		if (
			config.kind === "condition" &&
			config.groups.some((group) => group.rules.some((rule) => !rule.left))
		) {
			errors.push({
				type: "no_trigger_record",
				message:
					"This condition has nothing to test — a scheduled automation has no triggering record. Compare a step result instead, or move it inside a Loop.",
				nodeId: node.id,
			});
		}
		if (config.kind === "action" && config.action.type === "create_task") {
			if (config.action.linkToRecord) {
				errors.push({
					type: "no_trigger_record",
					message:
						"There is no record to link this task to — a scheduled automation has no triggering record. Put it inside a Loop, or turn off \"Link to record\".",
					nodeId: node.id,
				});
			}
		}
		// A top-level update_field is caught by validateActionNode, which already
		// sees a null scope object type.
	}
}

export function validateWorkflowForSave(
	trigger: TriggerConfig | null,
	nodes: EditorNode[],
	formulas?: FormulaResource[]
): ValidationResult {
	const errors: ValidationResult["errors"] = [];
	const warnings: ValidationResult["warnings"] = [];

	validateTrigger(trigger, errors);
	const objectType = triggerScopeObjectType(trigger);

	// Check for empty workflow (no real steps)
	if (nodes.length === 0) {
		errors.push({
			type: "missing_required_config",
			message: "Add at least one step before saving",
		});
	}

	// Real workflow nodes (with their next/else/bodyStart pointers) for graph
	// walks — loop-body membership excludes placeholders, matching the
	// scope logic in the panels/sidebar.
	const workflowNodes: WorkflowNode[] = nodes.filter(
		(n): n is WorkflowNode => n.type !== "placeholder"
	);

	if (trigger?.type === "scheduled") {
		validateScheduledRecordScope(nodes, workflowNodes, errors);
		// Formulas are automation-level: a node-only scan never sees them, so one
		// reading the trigger record is dead at every use site.
		for (const formula of formulas ?? []) {
			const tokens = formula.expression.match(/\{([^}]+)\}/g) ?? [];
			const dead = tokens
				.map((t) => t.slice(1, -1).trim())
				.find(readsTriggerRecord);
			if (dead) {
				errors.push({
					type: "no_trigger_record",
					message: `Formula "${formula.name}" reads "${dead}", which is always empty — a scheduled automation has no triggering record.`,
				});
			}
		}
	}

	for (const node of nodes) {
		const config = (node as WorkflowNode).config;

		switch (node.type) {
			case "placeholder":
				errors.push({
					type: "placeholder_present",
					message: "Some steps are not configured",
					nodeId: node.id,
				});
				break;
			case "condition": {
				const scope = getScopeObjectType(workflowNodes, node.id, objectType);
				validateConditionNode(
					node.id,
					config as ConditionNodeConfig | undefined,
					scope.objectType,
					scope.inLoop && !node.elseNodeId,
					errors,
					warnings
				);
				break;
			}
			case "action": {
				const scope = getScopeObjectType(workflowNodes, node.id, objectType);
				validateActionNode(
					node.id,
					config as ActionNodeConfig | undefined,
					scope.objectType,
					trigger?.type === "scheduled" && !scope.inLoop,
					errors
				);
				break;
			}
			case "fetch_records":
				validateFetchNode(
					node.id,
					config as FetchNodeConfig | undefined,
					errors
				);
				break;
			case "loop":
				validateLoopNode(
					node.id,
					config as LoopNodeConfig | undefined,
					nodes,
					workflowNodes,
					errors
				);
				break;
			case "aggregate":
				validateAggregateNode(
					node.id,
					config as AggregateNodeConfig | undefined,
					nodes,
					errors
				);
				break;
			case "adjust_time":
				validateAdjustTimeNode(
					node.id,
					config as AdjustTimeNodeConfig | undefined,
					errors
				);
				break;
			case "delay":
				validateDelayNode(
					node.id,
					config as DelayNodeConfig | undefined,
					errors
				);
				break;
			case "delay_until":
				validateDelayUntilNode(
					node.id,
					config as DelayUntilNodeConfig | undefined,
					errors
				);
				break;
			case "end": {
				const inLoop = getScopeObjectType(workflowNodes, node.id, objectType).inLoop;
				if (inLoop) {
					errors.push({
						type: "end_inside_loop",
						message:
							'An End step inside a loop stops the entire run — use "Next item" to skip to the next record',
						nodeId: node.id,
					});
				}
				break;
			}
			case "next_item": {
				const inLoop = getScopeObjectType(workflowNodes, node.id, objectType).inLoop;
				if (!inLoop) {
					errors.push({
						type: "next_item_outside_loop",
						message: '"Next item" only works inside a loop',
						nodeId: node.id,
					});
				}
				break;
			}
			default:
				break;
		}
	}

	return { valid: errors.length === 0, errors, warnings };
}

/** First warning message, if any — for a non-blocking toast after save/publish. */
export function getValidationWarningMessage(
	result: ValidationResult
): string | null {
	return result.warnings[0]?.message ?? null;
}

export function getValidationToastMessage(
	result: ValidationResult
): string | null {
	if (result.valid) return null;

	// Priority: trigger issues, then structural issues, then field completeness.
	const priorities: ValidationResult["errors"][number]["type"][] = [
		"no_trigger",
		"placeholder_present",
		"missing_required_config",
		"end_inside_loop",
		"next_item_outside_loop",
	];

	for (const type of priorities) {
		const error = result.errors.find((e) => e.type === type);
		if (error) return error.message;
	}

	return result.errors[0]?.message ?? null;
}
