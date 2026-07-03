import type { WorkflowNode } from "./node-types";

/**
 * Save-time bridge: converts the editor's legacy node shapes into the v2
 * `config` model the backend now requires. Mirrors the server-side
 * migrateAutomationsV2 mapping. Removed when the builder is rebuilt on the
 * v2 model directly.
 */

type StaticValue = string | number | boolean | null;

function toStaticValue(value: unknown): StaticValue {
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		value === null
	) {
		return value;
	}
	if (value === undefined) return null;
	return JSON.stringify(value);
}

const OPERATOR_MAP: Record<string, string> = {
	equals: "equals",
	not_equals: "not_equals",
	contains: "contains",
	exists: "is_not_empty",
	greater_than: "greater_than",
	less_than: "less_than",
	is_true: "is_true",
	is_false: "is_false",
	before: "before",
	after: "after",
};

const VALUELESS = new Set(["is_not_empty", "is_empty", "is_true", "is_false"]);

function mapOperator(op: string): string {
	return OPERATOR_MAP[op] ?? "equals";
}

function conditionRule(field: string, operator: string, value: unknown) {
	const mapped = mapOperator(operator);
	return {
		field,
		operator: mapped,
		...(VALUELESS.has(mapped)
			? {}
			: { value: { kind: "static", value: toStaticValue(value) } }),
	};
}

function nodeConfig(node: WorkflowNode): Record<string, unknown> {
	switch (node.type) {
		case "condition": {
			const legacy = node.condition;
			return {
				kind: "condition",
				logic: "and",
				groups: legacy
					? [
							{
								logic: "and",
								rules: [
									conditionRule(
										legacy.field,
										legacy.operator,
										legacy.value
									),
								],
							},
						]
					: [],
			};
		}
		case "action": {
			const legacy = node.action;
			if (!legacy) {
				throw new Error(`Action step "${node.id}" is not configured yet`);
			}
			const target =
				legacy.targetType === "self"
					? "self"
					: { related: legacy.targetType };
			switch (legacy.actionType) {
				case "update_status":
					return {
						kind: "action",
						action: {
							type: "update_field",
							target,
							field: "status",
							value: { kind: "static", value: legacy.newStatus },
						},
					};
				case "update_field":
					return {
						kind: "action",
						action: {
							type: "update_field",
							target,
							field: legacy.field ?? "status",
							value: {
								kind: "static",
								value: toStaticValue(legacy.value ?? legacy.newStatus),
							},
						},
					};
				case "send_notification":
					return {
						kind: "action",
						action: {
							type: "send_notification",
							recipient: "org_admins",
							message: legacy.notificationMessage ?? "",
						},
					};
				case "create_record":
					return {
						kind: "action",
						action: {
							type: "create_task",
							title: {
								kind: "static",
								value:
									typeof (
										legacy.createRecordFields as
											| { title?: unknown }
											| undefined
									)?.title === "string"
										? ((
												legacy.createRecordFields as {
													title: string;
												}
											).title as string)
										: "Task from automation",
							},
							linkToRecord: true,
						},
					};
				default:
					throw new Error(
						`Action step "${node.id}" has an unsupported action type`
					);
			}
		}
		case "fetch_records": {
			const legacy = node.fetchConfig;
			if (!legacy) {
				throw new Error(`Find-records step "${node.id}" is not configured yet`);
			}
			const filters = legacy.filters?.length
				? [
						{
							logic: "and",
							rules: legacy.filters.map((f) =>
								conditionRule(f.field, f.operator, f.value)
							),
						},
					]
				: [];
			return {
				kind: "fetch_records",
				objectType: legacy.entityType,
				filters,
				...(legacy.limit !== undefined ? { limit: legacy.limit } : {}),
			};
		}
		case "loop": {
			const legacy = node.loopConfig;
			if (!legacy) {
				throw new Error(`Loop step "${node.id}" is not configured yet`);
			}
			return {
				kind: "loop",
				sourceNodeId: legacy.sourceNodeId,
				...(legacy.batchSize !== undefined
					? { maxIterations: legacy.batchSize }
					: {}),
			};
		}
		case "end":
			return { kind: "end" };
		default:
			throw new Error(`Step "${node.id}" has an unsupported type`);
	}
}

/**
 * Convert serialized legacy nodes to the v2 node shape (config required).
 * Throws with a user-readable message when a node cannot be converted.
 */
export function legacyNodesToV2(
	nodes: WorkflowNode[]
): Record<string, unknown>[] {
	return nodes.map((node) => ({
		id: node.id,
		type: node.type,
		config: nodeConfig(node),
		...(node.nextNodeId !== undefined ? { nextNodeId: node.nextNodeId } : {}),
		...(node.elseNodeId !== undefined ? { elseNodeId: node.elseNodeId } : {}),
		...(node.position !== undefined ? { position: node.position } : {}),
	}));
}
