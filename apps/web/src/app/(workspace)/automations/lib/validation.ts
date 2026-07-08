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
	getFieldDefinition,
	getWritableFields,
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
	type LoopNodeConfig,
	type TriggerConfig,
	type WorkflowNode,
} from "./node-types";
import { getScopeObjectType } from "./variables";

export type ValidationResult = {
	valid: boolean;
	errors: Array<{
		type:
			| "placeholder_present"
			| "missing_required_config"
			| "no_trigger"
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

function isRuleComplete(
	objectType: AutomationObjectType | null,
	rule: ConditionRule
): boolean {
	if (!rule.field.trim()) return false;
	if (objectType) {
		const operators = operatorsForField(objectType, rule.field);
		if (operators.length > 0 && !operators.includes(rule.operator)) {
			return false;
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

	switch (trigger.type ?? "status_changed") {
		case "status_changed":
			if (!trigger.objectType || !trigger.toStatus?.trim()) {
				errors.push({
					type: "missing_required_config",
					message: "Trigger status is required",
				});
			}
			break;
		case "record_created":
		case "record_updated":
			if (!trigger.objectType) {
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
		const objectType = trigger.objectType ?? null;
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
				errors.push({
					type: "missing_required_config",
					message: "Set a trigger before configuring actions",
					nodeId,
				});
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

export function validateWorkflowForSave(
	trigger: TriggerConfig | null,
	nodes: EditorNode[]
): ValidationResult {
	const errors: ValidationResult["errors"] = [];
	const warnings: ValidationResult["warnings"] = [];

	validateTrigger(trigger, errors);
	const objectType = trigger?.objectType ?? null;

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
			case "action":
				validateActionNode(
					node.id,
					config as ActionNodeConfig | undefined,
					getScopeObjectType(workflowNodes, node.id, objectType).objectType,
					errors
				);
				break;
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
