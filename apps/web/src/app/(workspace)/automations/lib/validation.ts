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

import type { Node } from "@xyflow/react";
import { collectLoopBody } from "./graph-utils";
import {
	ADJUST_TIME_UNITS,
	AGGREGATE_OPERATIONS,
	DELAY_UNIT_MS,
	MAX_DELAY_MS,
	MAX_DUE_IN_DAYS,
	MAX_FETCH_LIMIT,
	MAX_LOOP_ITERATIONS,
	VALUELESS_OPERATORS,
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
import { UNSUPPORTED_TRIGGER_TYPE } from "./legacy-load";
import { getScopeObjectType } from "./variables";

export type ValidationResult = {
	valid: boolean;
	errors: Array<{
		type:
			| "placeholder_present"
			| "missing_required_config"
			| "no_trigger"
			| "unsupported_trigger";
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

	if (trigger.type === UNSUPPORTED_TRIGGER_TYPE) {
		errors.push({
			type: "unsupported_trigger",
			message:
				"This trigger is no longer supported — choose a different trigger",
		});
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
}

function validateConditionNode(
	nodeId: string,
	config: ConditionNodeConfig | undefined,
	objectType: AutomationObjectType | null,
	errors: ValidationResult["errors"]
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
	rfNodes: Node[],
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
	const source = rfNodes.find((n) => n.id === config.sourceNodeId);
	const sourceType = (source?.data as Record<string, unknown> | undefined)?.nodeType;
	if (!source || sourceType !== "fetch_records") {
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
	rfNodes: Node[],
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
	const source = rfNodes.find((n) => n.id === config.sourceNodeId);
	const sourceType = (source?.data as Record<string, unknown> | undefined)?.nodeType;
	if (!source || sourceType !== "fetch_records") {
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
	rfNodes: Node[]
): ValidationResult {
	const errors: ValidationResult["errors"] = [];

	validateTrigger(trigger, errors);
	const fallbackObjectType = trigger?.objectType ?? null;

	// Check for empty workflow (no real steps)
	const hasWorkflowNodes = rfNodes.some((node) => {
		const nt = (node.data as Record<string, unknown>)?.nodeType;
		return (
			nt !== undefined &&
			nt !== "trigger" &&
			nt !== "triggerPlaceholder" &&
			nt !== "terminal"
		);
	});
	if (!hasWorkflowNodes) {
		errors.push({
			type: "missing_required_config",
			message: "Add at least one step before saving",
		});
	}

	// Real workflow nodes (with their persisted next/else/bodyStart pointers)
	// for graph walks — loop-body membership needs these, not the RF nodes.
	const workflowNodes: WorkflowNode[] = rfNodes
		.map((n) => (n.data as { _dbNode?: WorkflowNode } | undefined)?._dbNode)
		.filter((n): n is WorkflowNode => n !== undefined);

	for (const node of rfNodes) {
		const data = node.data as Record<string, unknown>;
		const nodeType = data?.nodeType as string | undefined;
		const objectType =
			(data?.triggerObjectType as AutomationObjectType | null | undefined) ??
			fallbackObjectType;

		switch (nodeType) {
			case "placeholder":
				errors.push({
					type: "placeholder_present",
					message: "Some steps are not configured",
					nodeId: node.id,
				});
				break;
			case "condition":
				validateConditionNode(
					node.id,
					data.config as ConditionNodeConfig | undefined,
					objectType,
					errors
				);
				break;
			case "action":
				validateActionNode(
					node.id,
					data.config as ActionNodeConfig | undefined,
					getScopeObjectType(workflowNodes, node.id, objectType).objectType,
					errors
				);
				break;
			case "fetch_records":
				validateFetchNode(
					node.id,
					data.config as FetchNodeConfig | undefined,
					errors
				);
				break;
			case "loop":
				validateLoopNode(
					node.id,
					data.config as LoopNodeConfig | undefined,
					rfNodes,
					workflowNodes,
					errors
				);
				break;
			case "aggregate":
				validateAggregateNode(
					node.id,
					data.config as AggregateNodeConfig | undefined,
					rfNodes,
					errors
				);
				break;
			case "adjust_time":
				validateAdjustTimeNode(
					node.id,
					data.config as AdjustTimeNodeConfig | undefined,
					errors
				);
				break;
			case "delay":
				validateDelayNode(
					node.id,
					data.config as DelayNodeConfig | undefined,
					errors
				);
				break;
			case "delay_until":
				validateDelayUntilNode(
					node.id,
					data.config as DelayUntilNodeConfig | undefined,
					errors
				);
				break;
			default:
				break;
		}
	}

	return { valid: errors.length === 0, errors };
}

export function getValidationToastMessage(
	result: ValidationResult
): string | null {
	if (result.valid) return null;

	// Priority: trigger issues, then structural issues, then field completeness.
	const priorities: ValidationResult["errors"][number]["type"][] = [
		"no_trigger",
		"unsupported_trigger",
		"placeholder_present",
		"missing_required_config",
	];

	for (const type of priorities) {
		const error = result.errors.find((e) => e.type === type);
		if (error) return error.message;
	}

	return result.errors[0]?.message ?? null;
}
