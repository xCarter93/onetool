/**
 * Save validation for workflow automations.
 *
 * Catches placeholder nodes, missing triggers, and incomplete required config
 * before the user can save. Used by the editor page (Plan 05).
 */

import type { Node } from "@xyflow/react";
import type { TriggerConfig } from "../components/trigger-node";

export type ValidationResult = {
	valid: boolean;
	errors: Array<{
		type: "placeholder_present" | "missing_required_config" | "no_trigger";
		message: string;
		nodeId?: string;
	}>;
};

export function validateWorkflowForSave(
	trigger: TriggerConfig | null,
	rfNodes: Node[]
): ValidationResult {
	const errors: ValidationResult["errors"] = [];

	// Check for missing trigger
	if (!trigger) {
		errors.push({
			type: "no_trigger",
			message: "No trigger configured",
		});
	}

	// Check for placeholder nodes
	const hasPlaceholders = rfNodes.some(
		(node) => (node.data as Record<string, unknown>)?.nodeType === "placeholder"
	);
	if (hasPlaceholders) {
		errors.push({
			type: "placeholder_present",
			message: "Some steps are not configured",
		});
	}

	// Check condition nodes for required config
	for (const node of rfNodes) {
		const data = node.data as Record<string, unknown>;
		if (data?.nodeType === "condition") {
			const config = data.config as Record<string, unknown> | undefined;
			if (!config?.field) {
				errors.push({
					type: "missing_required_config",
					message: "Some steps have missing required fields",
					nodeId: node.id,
				});
			}
		}

		// Check action nodes for required config
		if (data?.nodeType === "action") {
			const config = data.config as Record<string, unknown> | undefined;
			if (!config?.actionType) {
				errors.push({
					type: "missing_required_config",
					message: "Some steps have missing required fields",
					nodeId: node.id,
				});
			}
		}
	}

	return { valid: errors.length === 0, errors };
}

export function getValidationToastMessage(
	result: ValidationResult
): string | null {
	if (result.valid) return null;

	// Priority: no_trigger > placeholder_present > missing_required_config
	const priorities: ValidationResult["errors"][number]["type"][] = [
		"no_trigger",
		"placeholder_present",
		"missing_required_config",
	];

	for (const type of priorities) {
		const error = result.errors.find((e) => e.type === type);
		if (error) return error.message;
	}

	return result.errors[0]?.message ?? null;
}
