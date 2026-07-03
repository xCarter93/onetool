/**
 * Save validation for workflow automations.
 *
 * Catches placeholder nodes, missing/unsupported triggers, and incomplete
 * required config before the user can save. Operates on the React Flow node
 * array (post automationToReactFlow), reading each node's v2 `config`.
 */

import type { Node } from "@xyflow/react";
import {
	VALUELESS_OPERATORS,
	getWritableFields,
	operatorsForField,
	validateSchedule,
	type ActionNodeConfig,
	type AutomationObjectType,
	type ConditionNodeConfig,
	type ConditionRule,
	type FetchNodeConfig,
	type TriggerConfig,
} from "./node-types";
import { UNSUPPORTED_TRIGGER_TYPE } from "./legacy-load";

export type ValidationResult = {
	valid: boolean;
	errors: Array<{
		type:
			| "placeholder_present"
			| "missing_required_config"
			| "no_trigger"
			| "unsupported_trigger"
			| "loop_unavailable";
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
	triggerObjectType: AutomationObjectType | null,
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
	if (action.type !== "update_field") {
		// Only update_field is offered in the Slice 1 UI.
		return;
	}

	if (!triggerObjectType) {
		errors.push({
			type: "missing_required_config",
			message: "Set a trigger before configuring actions",
			nodeId,
		});
		return;
	}

	const targetObjectType: AutomationObjectType =
		action.target === "self" ? triggerObjectType : action.target.related;
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
	}
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
					objectType,
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
				errors.push({
					type: "loop_unavailable",
					message: "Loop steps aren't available yet",
					nodeId: node.id,
				});
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
		"loop_unavailable",
		"placeholder_present",
		"missing_required_config",
	];

	for (const type of priorities) {
		const error = result.errors.find((e) => e.type === type);
		if (error) return error.message;
	}

	return result.errors[0]?.message ?? null;
}
