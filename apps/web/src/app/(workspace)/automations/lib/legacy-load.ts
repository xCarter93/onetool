/**
 * Load-time adapter from stored DB automation rows to the v2 editor model.
 * Since the post-migration schema tightening, stored rows are v2-only, so this
 * just bridges the backend Doc shapes to the editor's WorkflowNode /
 * TriggerConfig types — it never writes anything back.
 */

import {
	type AutomationTrigger,
	type TriggerConfig,
	type WorkflowNode,
	type WorkflowNodeConfig,
	type WorkflowNodeType,
} from "./node-types";

// Adapter input: either a stored DB node (config always present since the
// schema tightening) or an in-editor node still being configured (config may
// be undefined) — so `config` is optional here and passed through as-is.
export type DbWorkflowNode = {
	id: string;
	type: WorkflowNodeType;
	config?: WorkflowNodeConfig;
	nextNodeId?: string;
	elseNodeId?: string;
	bodyStartNodeId?: string;
	position?: { x: number; y: number };
};

/** Adapt a stored DB / in-editor node to the editor's WorkflowNode. */
export function legacyNodeToV2(node: DbWorkflowNode): WorkflowNode {
	return {
		id: node.id,
		type: node.type,
		config: node.config,
		nextNodeId: node.nextNodeId,
		elseNodeId: node.elseNodeId,
		bodyStartNodeId: node.bodyStartNodeId,
		position: node.position,
	};
}

/** Adapt a stored DB trigger to the editor's in-progress TriggerConfig draft. */
export function legacyTriggerToDraft(trigger: AutomationTrigger): TriggerConfig {
	switch (trigger.type) {
		case "status_changed":
			return {
				type: "status_changed",
				objectType: trigger.objectType,
				fromStatus: trigger.fromStatus,
				toStatus: trigger.toStatus,
				entryCriteria: trigger.entryCriteria,
			};
		case "record_created":
			return {
				type: "record_created",
				objectType: trigger.objectType,
				entryCriteria: trigger.entryCriteria,
			};
		case "record_updated":
			return {
				type: "record_updated",
				objectType: trigger.objectType,
				fields: trigger.fields,
				entryCriteria: trigger.entryCriteria,
			};
		case "scheduled":
			// objectType is deliberately dropped: a scheduled run has no record.
			// Rehydrating it would keep offering dead trigger.record.* tokens, and
			// would make every stored scheduled automation read as unpublished.
			return {
				type: "scheduled",
				schedule: trigger.schedule,
			};
	}
}
