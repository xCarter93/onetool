import { Migrations } from "@convex-dev/migrations";
import { components } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { DataModel, Doc } from "../_generated/dataModel";
import {
	CONDITION_OPERATORS,
	VALUELESS_OPERATORS,
	type AutomationAction,
	type ConditionOperator,
	type ConditionRule,
	type WorkflowNodeConfig,
} from "../lib/workflowTypes";

/**
 * Migration: One-shot idempotent conversion of workflowAutomations rows to
 * the v2 model (lib/workflowTypes.ts):
 *
 * - Legacy trigger (no `type`) => status_changed; record_updated `field`
 *   string => `fields: [field]` (legacy `field` kept in place).
 * - Nodes lacking `config` get one synthesized from the legacy
 *   condition/action/fetchConfig/loopConfig fields (legacy fields kept).
 * - Lifecycle: rows without `status` become "active" + publishedSnapshot
 *   (version 1) when isActive === true, otherwise "draft".
 * - nextRunAt is NOT computed here (scheduling is a later slice).
 *
 * To run:
 *   npx convex run migrations:run '{"fn": "migrations/migrateAutomationsV2:migrateAutomationsV2"}'
 * Dry run:
 *   npx convex run migrations/migrateAutomationsV2:migrateAutomationsV2 '{"dryRun": true, "cursor": null}'
 */

const migrations = new Migrations<DataModel>(components.migrations, {
	internalMutation,
});

export const run = migrations.runner();

type AutomationDoc = Doc<"workflowAutomations">;
type WorkflowNode = AutomationDoc["nodes"][number];
type LegacyAction = NonNullable<WorkflowNode["action"]>;
type AutomationTriggerField = AutomationDoc["trigger"];

/** Coerce a legacy v.any() value into a static ValueRef payload. */
function coerceStatic(value: unknown): string | number | boolean | null {
	if (value === null || value === undefined) {
		return null;
	}
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

/** Map a legacy operator string to a v2 ConditionOperator. */
function mapOperator(operator: string): ConditionOperator {
	if (operator === "exists") {
		return "is_not_empty";
	}
	if ((CONDITION_OPERATORS as readonly string[]).includes(operator)) {
		return operator as ConditionOperator;
	}
	// Unknown legacy fetch-filter operator strings fall back to equals.
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
			// Best-effort: legacy create_record becomes create_task.
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

/**
 * Synthesize a v2 config for a node that lacks one, from its legacy fields.
 * Returns undefined when nothing can be synthesized (node is left untouched).
 */
function synthesizeNodeConfig(
	node: WorkflowNode
): WorkflowNodeConfig | undefined {
	switch (node.type) {
		case "condition": {
			if (!node.condition) {
				return { kind: "condition", logic: "and", groups: [] };
			}
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
			if (!node.action) {
				return undefined;
			}
			return { kind: "action", action: convertLegacyAction(node.action) };
		}
		case "fetch_records": {
			if (!node.fetchConfig) {
				return undefined;
			}
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
			if (!node.loopConfig) {
				return undefined;
			}
			// Legacy loop bodies were represented via edges only; leave
			// bodyStartNodeId unset so the editor surfaces unconfigured loops.
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

/** Migrate the trigger; returns the (possibly unchanged) trigger + flag. */
function migrateTrigger(trigger: AutomationTriggerField): {
	trigger: AutomationTriggerField;
	changed: boolean;
} {
	if (!("type" in trigger)) {
		return {
			changed: true,
			trigger: {
				type: "status_changed" as const,
				objectType: trigger.objectType,
				...(trigger.fromStatus !== undefined
					? { fromStatus: trigger.fromStatus }
					: {}),
				toStatus: trigger.toStatus,
			},
		};
	}
	if (
		trigger.type === "record_updated" &&
		trigger.field !== undefined &&
		trigger.fields === undefined
	) {
		// v1.2 single-field filter: write fields, keep legacy field in place.
		return { changed: true, trigger: { ...trigger, fields: [trigger.field] } };
	}
	return { changed: false, trigger };
}

export const migrateAutomationsV2 = migrations.define({
	table: "workflowAutomations",
	migrateOne: async (_ctx, doc) => {
		const patch: Partial<
			Pick<AutomationDoc, "trigger" | "nodes" | "status" | "publishedSnapshot">
		> = {};

		const { trigger, changed: triggerChanged } = migrateTrigger(doc.trigger);
		if (triggerChanged) {
			patch.trigger = trigger;
		}

		let nodesChanged = false;
		const nodes = doc.nodes.map((node) => {
			if (node.config !== undefined) {
				return node;
			}
			const config = synthesizeNodeConfig(node);
			if (config === undefined) {
				return node;
			}
			nodesChanged = true;
			return { ...node, config };
		});
		if (nodesChanged) {
			patch.nodes = nodes;
		}

		if (doc.status === undefined) {
			if (doc.isActive === true) {
				patch.status = "active";
				if (doc.publishedSnapshot === undefined) {
					patch.publishedSnapshot = {
						trigger,
						nodes,
						version: 1,
						publishedAt: Date.now(),
					};
				}
			} else {
				patch.status = "draft";
			}
		}

		// Idempotent: nothing to do => no patch.
		if (Object.keys(patch).length === 0) {
			return;
		}
		return patch;
	},
});
