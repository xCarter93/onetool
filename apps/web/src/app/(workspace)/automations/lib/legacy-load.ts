/**
 * Load-time conversion of unmigrated DB automation rows to the v2 editor
 * model. Mirrors packages/backend/convex/migrations/migrateAutomationsV2.ts
 * exactly, but never writes anything back — the editor holds v2 state in
 * memory from the moment a row loads, and Save always serializes v2-only
 * shapes (see flow-adapter.ts / use-automation-editor.ts). Running the real
 * server migration later is a no-op for rows already converted here.
 */

import {
	CONDITION_OPERATORS,
	VALUELESS_OPERATORS,
	type AutomationAction,
	type AutomationObjectType,
	type AutomationTrigger,
	type ConditionOperator,
	type ConditionRule,
	type TriggerConfig,
	type TriggerType,
	type WorkflowNode,
	type WorkflowNodeConfig,
	type WorkflowNodeType,
} from "./node-types";

// ---------------------------------------------------------------------------
// Raw DB node shape: legacy v1 fields (condition/action/fetchConfig/
// loopConfig) alongside the optional v2 `config`. Matches
// packages/backend/convex/schema.ts's workflowNodeValidator.
// ---------------------------------------------------------------------------

type LegacyCondition = { field: string; operator: string; value?: unknown };

type LegacyAction = {
	targetType: "self" | "project" | "client" | "quote" | "invoice";
	actionType:
		| "update_status"
		| "update_field"
		| "send_notification"
		| "create_record";
	newStatus: string;
	field?: string;
	value?: unknown;
	notificationRecipient?: string;
	notificationMessage?: string;
	createRecordType?: "task" | "project";
	createRecordFields?: Record<string, unknown>;
};

type LegacyFetchConfig = {
	entityType: AutomationObjectType;
	filters?: { field: string; operator: string; value?: unknown }[];
	limit?: number;
};

type LegacyLoopConfig = { sourceNodeId: string; batchSize?: number };

export type DbWorkflowNode = {
	id: string;
	type: WorkflowNodeType;
	config?: WorkflowNodeConfig;
	condition?: LegacyCondition;
	action?: LegacyAction;
	fetchConfig?: LegacyFetchConfig;
	loopConfig?: LegacyLoopConfig;
	nextNodeId?: string;
	elseNodeId?: string;
	bodyStartNodeId?: string;
	position?: { x: number; y: number };
};

// ---------------------------------------------------------------------------
// Shared value/operator coercion (mirrors migrateAutomationsV2.ts)
// ---------------------------------------------------------------------------

function coerceStatic(value: unknown): string | number | boolean | null {
	if (value === null || value === undefined) return null;
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function mapOperator(operator: string): ConditionOperator {
	if (operator === "exists") return "is_not_empty";
	if ((CONDITION_OPERATORS as readonly string[]).includes(operator)) {
		return operator as ConditionOperator;
	}
	return "equals";
}

function toConditionRule(
	field: string,
	operator: string,
	value: unknown
): ConditionRule {
	const op = mapOperator(operator);
	if (value === undefined || VALUELESS_OPERATORS.includes(op)) {
		return { field, operator: op };
	}
	return {
		field,
		operator: op,
		value: { kind: "static", value: coerceStatic(value) },
	};
}

function convertLegacyAction(legacy: LegacyAction): AutomationAction {
	const target =
		legacy.targetType === "self"
			? ("self" as const)
			: { related: legacy.targetType };
	switch (legacy.actionType) {
		case "update_status":
			return {
				type: "update_field",
				target,
				field: "status",
				value: { kind: "static", value: legacy.newStatus },
			};
		case "update_field":
			return {
				type: "update_field",
				target,
				field: legacy.field ?? "status",
				value: {
					kind: "static",
					value: coerceStatic(legacy.value ?? legacy.newStatus),
				},
			};
		case "send_notification":
			return {
				type: "send_notification",
				recipient: "org_admins",
				message: legacy.notificationMessage ?? "",
			};
		case "create_record": {
			const fields = legacy.createRecordFields as
				| { title?: unknown }
				| undefined;
			const title =
				typeof fields?.title === "string"
					? fields.title
					: "Task from automation";
			return {
				type: "create_task",
				title: { kind: "static", value: title },
				linkToRecord: true,
			};
		}
	}
}

// ---------------------------------------------------------------------------
// Node-level conversion
// ---------------------------------------------------------------------------

/**
 * Synthesize a v2 config for a legacy node. Returns undefined when the node
 * was never configured -- the editor then shows it as unconfigured and save
 * validation blocks until the user finishes it (see validation.ts).
 */
function synthesizeNodeConfig(
	node: DbWorkflowNode
): WorkflowNodeConfig | undefined {
	switch (node.type) {
		case "condition": {
			if (!node.condition) return undefined;
			return {
				kind: "condition",
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [
							toConditionRule(
								node.condition.field,
								node.condition.operator,
								node.condition.value
							),
						],
					},
				],
			};
		}
		case "action": {
			if (!node.action) return undefined;
			return { kind: "action", action: convertLegacyAction(node.action) };
		}
		case "fetch_records": {
			if (!node.fetchConfig) return undefined;
			const filters = node.fetchConfig.filters;
			return {
				kind: "fetch_records",
				objectType: node.fetchConfig.entityType,
				filters: filters?.length
					? [
							{
								logic: "and" as const,
								rules: filters.map((f) =>
									toConditionRule(f.field, f.operator, f.value)
								),
							},
						]
					: [],
				...(node.fetchConfig.limit !== undefined
					? { limit: node.fetchConfig.limit }
					: {}),
			};
		}
		case "loop": {
			if (!node.loopConfig) return undefined;
			return {
				kind: "loop",
				sourceNodeId: node.loopConfig.sourceNodeId,
				...(node.loopConfig.batchSize !== undefined
					? { maxIterations: node.loopConfig.batchSize }
					: {}),
			};
		}
		case "end":
			return { kind: "end" };
		default:
			// delay / delay_until never existed pre-v2; nothing to synthesize.
			return undefined;
	}
}

/**
 * Load-time node conversion: v2 rows (already have `config`) pass through
 * unchanged; legacy rows get a config synthesized from their v1 fields.
 * Idempotent -- safe to call on already-converted WorkflowNode values too.
 */
export function legacyNodeToV2(node: DbWorkflowNode): WorkflowNode {
	const config = node.config ?? synthesizeNodeConfig(node);
	return {
		id: node.id,
		type: node.type,
		config,
		nextNodeId: node.nextNodeId,
		elseNodeId: node.elseNodeId,
		bodyStartNodeId: node.bodyStartNodeId,
		position: node.position,
	};
}

// ---------------------------------------------------------------------------
// Trigger-level conversion
// ---------------------------------------------------------------------------

/**
 * Sentinel trigger type for rows using the retired email_received trigger.
 * Not a member of TriggerType (never offered in the picker); validation.ts
 * recognizes this exact value and blocks save with a clear message.
 */
export const UNSUPPORTED_TRIGGER_TYPE = "email_received" as TriggerType;

export function legacyTriggerToDraft(trigger: AutomationTrigger): TriggerConfig {
	if (!("type" in trigger)) {
		// Pre-v1.2 legacy trigger (no `type` field) => status_changed.
		return {
			type: "status_changed",
			objectType: trigger.objectType,
			fromStatus: trigger.fromStatus,
			toStatus: trigger.toStatus,
		};
	}

	switch (trigger.type) {
		case "status_changed":
			return {
				type: "status_changed",
				objectType: trigger.objectType,
				fromStatus: trigger.fromStatus,
				toStatus: trigger.toStatus,
			};
		case "record_created":
			return { type: "record_created", objectType: trigger.objectType };
		case "record_updated":
			return {
				type: "record_updated",
				objectType: trigger.objectType,
				fields:
					trigger.fields ?? (trigger.field ? [trigger.field] : undefined),
			};
		case "scheduled":
			return {
				type: "scheduled",
				objectType: trigger.objectType,
				schedule: trigger.schedule,
			};
		case "email_received":
			return { type: UNSUPPORTED_TRIGGER_TYPE, objectType: "client" };
	}
}
