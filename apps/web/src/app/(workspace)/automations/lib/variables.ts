import { collectLoopBody } from "./graph-utils";
import {
	OBJECT_TYPE_LABELS,
	getFilterableFields,
	type AutomationObjectType,
	type AutomationTrigger,
	type FetchNodeConfig,
	type FieldType,
	type LoopNodeConfig,
	type TriggerConfig,
	type WorkflowNode,
} from "./node-types";

/**
 * Resolves which `{{path}}` variables are available at a given point in the
 * workflow graph, for the "Use a variable" popover (value-input.tsx) and the
 * loop "records to loop over" picker.
 *
 * Mirrors the variable paths the engine resolves at run time (see
 * workflowTypes.ts header comment): trigger.record.<field>,
 * trigger.event.oldValue/newValue, node.<fetchNodeId>.count, and
 * loop.<loopNodeId>.item.<field>/.index.
 */

export type VariableOption = {
	path: string;
	label: string;
	group: string;
	fieldType?: FieldType;
};

function childrenOf(node: WorkflowNode): string[] {
	const out: string[] = [];
	if (node.nextNodeId) out.push(node.nextNodeId);
	if (node.elseNodeId) out.push(node.elseNodeId);
	if (node.bodyStartNodeId) out.push(node.bodyStartNodeId);
	return out;
}

/**
 * True if targetId is reachable from startId by walking nextNodeId /
 * elseNodeId / bodyStartNodeId chains (i.e. targetId runs "after" startId).
 */
function isReachableFrom(
	startId: string,
	targetId: string,
	byId: Map<string, WorkflowNode>
): boolean {
	if (startId === targetId) return false;
	const visited = new Set<string>([startId]);
	const queue: string[] = [startId];

	while (queue.length > 0) {
		const current = queue.shift()!;
		const node = byId.get(current);
		if (!node) continue;
		for (const child of childrenOf(node)) {
			if (child === targetId) return true;
			if (!visited.has(child)) {
				visited.add(child);
				queue.push(child);
			}
		}
	}
	return false;
}

/** Fetch nodes reachable to targetNodeId — used by the loop config's source picker. */
export function getUpstreamFetchNodes(
	nodes: WorkflowNode[],
	targetNodeId: string
): { id: string; objectType: AutomationObjectType | undefined }[] {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	return nodes
		.filter(
			(node) =>
				node.type === "fetch_records" &&
				isReachableFrom(node.id, targetNodeId, byId)
		)
		.map((node) => ({
			id: node.id,
			objectType: (node.config as FetchNodeConfig | undefined)?.objectType,
		}));
}

/** Normalizes the `type` discriminant across the editor draft and backend trigger shapes. */
function effectiveTriggerType(
	trigger: TriggerConfig | AutomationTrigger
): string {
	const explicit = "type" in trigger ? trigger.type : undefined;
	return explicit ?? "status_changed";
}

export function getAvailableVariables(
	nodes: WorkflowNode[],
	trigger: TriggerConfig | AutomationTrigger,
	targetNodeId: string
): VariableOption[] {
	const options: VariableOption[] = [];
	const triggerObjectType = trigger.objectType as
		| AutomationObjectType
		| undefined;

	// 1. trigger.record.<field>
	if (triggerObjectType) {
		for (const field of getFilterableFields(triggerObjectType)) {
			options.push({
				path: `trigger.record.${field.key}`,
				label: `Trigger → ${field.label}`,
				group: "Trigger",
				fieldType: field.type,
			});
		}
	}

	// 2. trigger.event.oldValue / newValue — status_changed only.
	if (effectiveTriggerType(trigger) === "status_changed") {
		options.push(
			{
				path: "trigger.event.oldValue",
				label: "Trigger → Previous status",
				group: "Trigger",
				fieldType: "select",
			},
			{
				path: "trigger.event.newValue",
				label: "Trigger → New status",
				group: "Trigger",
				fieldType: "select",
			}
		);
	}

	const byId = new Map(nodes.map((n) => [n.id, n]));

	// 3. node.<fetchNodeId>.count — for every fetch_records node upstream of target.
	for (const node of nodes) {
		if (node.type !== "fetch_records") continue;
		if (!isReachableFrom(node.id, targetNodeId, byId)) continue;
		const config = node.config as FetchNodeConfig | undefined;
		const objectLabel = config?.objectType
			? OBJECT_TYPE_LABELS[config.objectType]
			: "records";
		options.push({
			path: `node.${node.id}.count`,
			label: `Found records (${objectLabel}) → Count`,
			group: "Found records",
			fieldType: "number",
		});
	}

	// 4. loop.<loopNodeId>.item.<field> / .index — only inside that loop's body.
	for (const node of nodes) {
		if (node.type !== "loop") continue;
		if (node.id === targetNodeId) continue;
		const config = node.config as LoopNodeConfig | undefined;
		if (!config?.sourceNodeId) continue;

		const body = collectLoopBody(node.id, nodes);
		if (!body.has(targetNodeId)) continue;

		const sourceNode = byId.get(config.sourceNodeId);
		const sourceObjectType = (sourceNode?.config as FetchNodeConfig | undefined)
			?.objectType;
		if (!sourceObjectType) continue;

		for (const field of getFilterableFields(sourceObjectType)) {
			options.push({
				path: `loop.${node.id}.item.${field.key}`,
				label: `Loop item → ${field.label}`,
				group: "Loop item",
				fieldType: field.type,
			});
		}
		options.push({
			path: `loop.${node.id}.index`,
			label: "Loop item → Index",
			group: "Loop item",
			fieldType: "number",
		});
	}

	return options;
}
