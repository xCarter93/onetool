import { MarkerType } from "@xyflow/react";
import type {
	ActionNodeConfig,
	AppEdge,
	AppNode,
	ConditionNodeConfig,
	FetchNodeConfig,
	LoopNodeConfig,
	TriggerConfig,
	WorkflowNode,
	WorkflowNodeConfig,
} from "./node-types";
import { legacyNodeToV2 } from "./legacy-load";
import { computeAllPositions } from "./initial-placement";

export const TRIGGER_NODE_ID = "__trigger__";
export const TRIGGER_PLACEHOLDER_ID = "__trigger_placeholder__";
export const TERMINAL_PREFIX = "__terminal__";

/** React Flow node type names (must match nodeTypes object keys) */
export const RF_NODE_TYPES = {
	trigger: "triggerNode",
	triggerPlaceholder: "triggerPlaceholderNode",
	condition: "conditionNode",
	action: "actionNode",
	fetch_records: "fetchNode",
	loop: "loopNode",
	end: "endNode",
	placeholder: "placeholderNode",
	terminal: "terminalNode",
} as const;

/** React Flow edge type names (must match edgeTypes object keys) */
export const RF_EDGE_TYPES = {
	straight: "straightEdge",
	branchLabel: "branchLabelEdge",
	loopBack: "loopBackEdge",
	afterLast: "afterLastEdge",
} as const;

/**
 * Frontend-only transient node used while a step type hasn't been chosen
 * yet. Never persisted -- reactFlowToFlatArray filters these out before
 * save, and validation.ts blocks save while any remain.
 */
export type PlaceholderEntry = {
	id: string;
	type: "placeholder";
	nextNodeId?: string;
	elseNodeId?: string;
	position?: { x: number; y: number };
};

/** Editor working-state node: a real v2 workflow node, or an unconfigured placeholder. */
export type EditorNode = WorkflowNode | PlaceholderEntry;

function isPlaceholderEntry(node: EditorNode): node is PlaceholderEntry {
	return node.type === "placeholder";
}

/** Check if a node ID is a terminal stub (not a real workflow node) */
export function isTerminalId(id: string): boolean {
	return id.startsWith(TERMINAL_PREFIX);
}

/** Create a terminal stub node + edge for a leaf output */
function addTerminalStub(
	rfNodes: AppNode[],
	rfEdges: AppEdge[],
	sourceId: string,
	sourceHandle?: string,
	edgeType?: string,
	edgeData?: Record<string, unknown>
) {
	const handleSuffix = sourceHandle ? `-${sourceHandle}` : "";
	const terminalId = `${TERMINAL_PREFIX}${sourceId}${handleSuffix}`;

	rfNodes.push({
		id: terminalId,
		type: RF_NODE_TYPES.terminal,
		data: { nodeType: "terminal" },
		position: { x: 0, y: 0 },
		draggable: false,
	} as AppNode);

	rfEdges.push({
		id: `e-${sourceId}${handleSuffix}-${terminalId}`,
		source: sourceId,
		target: terminalId,
		sourceHandle: sourceHandle ?? undefined,
		type: edgeType || RF_EDGE_TYPES.straight,
		data: { isTerminal: true, ...edgeData },
	} as AppEdge);
}

function resolveLoopBackSourceId(
	startNodeId: string | undefined,
	nodes: EditorNode[]
): string {
	if (!startNodeId) {
		return "";
	}

	let loopBackSourceId = startNodeId;
	const visited = new Set<string>();

	while (true) {
		visited.add(loopBackSourceId);
		const bodyNode = nodes.find((n) => n.id === loopBackSourceId);
		if (!bodyNode?.nextNodeId || visited.has(bodyNode.nextNodeId)) {
			if (bodyNode?.type === "condition") {
				return `${TERMINAL_PREFIX}${bodyNode.id}-yes`;
			}
			return loopBackSourceId;
		}
		loopBackSourceId = bodyNode.nextNodeId;
	}
}

function buildNodeData(node: EditorNode, trigger: TriggerConfig) {
	const triggerObjectType = trigger.objectType ?? null;

	if (isPlaceholderEntry(node)) {
		return { nodeType: "placeholder" as const };
	}

	switch (node.type) {
		case "condition":
			return {
				nodeType: "condition" as const,
				config: node.config as ConditionNodeConfig | undefined,
				triggerObjectType,
				_dbNode: node,
			};
		case "action":
			return {
				nodeType: "action" as const,
				config: node.config as ActionNodeConfig | undefined,
				triggerObjectType,
				_dbNode: node,
			};
		case "fetch_records":
			return {
				nodeType: "fetch_records" as const,
				config: node.config as FetchNodeConfig | undefined,
				triggerObjectType,
				_dbNode: node,
			};
		case "loop":
			return {
				nodeType: "loop" as const,
				config: node.config as LoopNodeConfig | undefined,
				triggerObjectType,
				_dbNode: node,
			};
		case "end":
			return { nodeType: "end" as const, _dbNode: node };
		default:
			// delay / delay_until: not yet offered in the editor UI (Slice 2+).
			return {
				nodeType: "action" as const,
				config: undefined,
				triggerObjectType,
				_dbNode: node,
			};
	}
}

/**
 * Convert database automation (trigger + flat nodes array) to React Flow nodes and edges.
 *
 * Every leaf output gets a terminal stub with an always-visible "+" button.
 * When no trigger is set, shows a dashed placeholder trigger node instead.
 *
 * Condition nodes emit edges from separate yes/no handles.
 * No merge points are generated -- branches stay independent.
 */
export function automationToReactFlow(
	trigger: TriggerConfig | null,
	rawNodes: EditorNode[]
): { nodes: AppNode[]; edges: AppEdge[] } {
	const rfNodes: AppNode[] = [];
	const rfEdges: AppEdge[] = [];

	// 1. Create trigger node or placeholder
	if (trigger) {
		rfNodes.push({
			id: TRIGGER_NODE_ID,
			type: RF_NODE_TYPES.trigger,
			data: {
				nodeType: "trigger",
				trigger,
				triggerObjectType: trigger.objectType ?? null,
			},
			position: { x: 0, y: 0 },
		} as AppNode);
	} else {
		// No trigger — show dashed placeholder (no terminal stub, placeholder IS the interaction)
		rfNodes.push({
			id: TRIGGER_PLACEHOLDER_ID,
			type: RF_NODE_TYPES.triggerPlaceholder,
			data: { nodeType: "triggerPlaceholder" },
			position: { x: 0, y: 0 },
		} as AppNode);
		return { nodes: rfNodes, edges: rfEdges };
	}

	// Run every incoming node through legacy-load conversion (idempotent for
	// already-v2 rows); placeholders pass through untouched.
	const nodes: EditorNode[] = rawNodes.map((n) =>
		isPlaceholderEntry(n) ? n : legacyNodeToV2(n)
	);

	// 2. Find root node (not referenced by any other node's nextNodeId or elseNodeId)
	const referencedIds = new Set<string>();
	for (const node of nodes) {
		if (node.nextNodeId) referencedIds.add(node.nextNodeId);
		if (node.elseNodeId) referencedIds.add(node.elseNodeId);
	}
	const rootNode = nodes.find((n) => !referencedIds.has(n.id));

	// 3. Connect trigger to root, or add terminal stub if no nodes
	if (rootNode) {
		rfEdges.push({
			id: `e-trigger-default-${rootNode.id}`,
			source: TRIGGER_NODE_ID,
			target: rootNode.id,
			type: RF_EDGE_TYPES.straight,
			data: { branchType: "next" as const },
		});
	} else {
		addTerminalStub(rfNodes, rfEdges, TRIGGER_NODE_ID, undefined, RF_EDGE_TYPES.straight, {
			branchType: "next" as const,
		});
	}

	// 4. Convert each workflow node to React Flow node + edges
	for (const node of nodes) {
		const rfNodeType =
			RF_NODE_TYPES[node.type as keyof typeof RF_NODE_TYPES] ||
			RF_NODE_TYPES.action;

		rfNodes.push({
			id: node.id,
			type: rfNodeType,
			data: buildNodeData(node, trigger),
			position: { x: 0, y: 0 },
		} as AppNode);

		if (node.type === "end") {
			// End nodes produce no outgoing edges — flow stops here
		} else if (node.type === "condition") {
			// Condition: Yes branch (nextNodeId) -- from center handle
			if (node.nextNodeId) {
				rfEdges.push({
					id: `e-${node.id}-yes-${node.nextNodeId}`,
					source: node.id,
					target: node.nextNodeId,
					sourceHandle: "yes",
					type: RF_EDGE_TYPES.branchLabel,
					data: { label: "Yes", variant: "yes", branchType: "yes" as const },
				} as AppEdge);
			} else {
				addTerminalStub(rfNodes, rfEdges, node.id, "yes", RF_EDGE_TYPES.branchLabel, {
					label: "Yes",
					variant: "yes",
					branchType: "yes" as const,
				});
			}

			// Condition: No branch (elseNodeId) -- from center handle
			if (node.elseNodeId) {
				rfEdges.push({
					id: `e-${node.id}-no-${node.elseNodeId}`,
					source: node.id,
					target: node.elseNodeId,
					sourceHandle: "no",
					type: RF_EDGE_TYPES.branchLabel,
					data: { label: "No", variant: "no", branchType: "no" as const },
				} as AppEdge);
			} else {
				addTerminalStub(rfNodes, rfEdges, node.id, "no", RF_EDGE_TYPES.branchLabel, {
					label: "No",
					variant: "no",
					branchType: "no" as const,
				});
			}

			// No merge point -- branches stay independent
		} else if (node.type === "loop") {
			// Loop: "each" branch (nextNodeId = loop body)
			if (node.nextNodeId) {
				rfEdges.push({
					id: `e-${node.id}-each-${node.nextNodeId}`,
					source: node.id,
					target: node.nextNodeId,
					sourceHandle: "each",
					type: RF_EDGE_TYPES.branchLabel,
					data: { label: "For Each", variant: "yes", branchType: "each" as const },
				} as AppEdge);
			} else {
				addTerminalStub(rfNodes, rfEdges, node.id, "each", RF_EDGE_TYPES.branchLabel, {
					label: "For Each",
					variant: "yes",
					branchType: "each" as const,
				});
			}

			// Loop: "after" branch (elseNodeId = after last iteration)
			if (node.elseNodeId) {
				rfEdges.push({
					id: `e-${node.id}-after-${node.elseNodeId}`,
					source: node.id,
					target: node.elseNodeId,
					sourceHandle: "after",
					type: RF_EDGE_TYPES.afterLast,
					data: { label: "After Last", variant: "no", branchType: "after" as const },
				} as AppEdge);
			} else {
				addTerminalStub(rfNodes, rfEdges, node.id, "after", RF_EDGE_TYPES.afterLast, {
					label: "After Last",
					variant: "no",
					branchType: "after" as const,
				});
			}

			// Loop-back edge: from last body node (or empty terminal) back to loop header
			{
				const loopBackSourceId = node.nextNodeId
					? resolveLoopBackSourceId(node.nextNodeId, nodes)
					: `${TERMINAL_PREFIX}${node.id}-each`;

				rfEdges.push({
					id: `e-loopback-${node.id}`,
					source: loopBackSourceId,
					target: node.id,
					sourceHandle: undefined,
					targetHandle: "loopReturn",
					type: RF_EDGE_TYPES.loopBack,
					data: {
						branchType: "loop_back" as const,
						isTerminal: false,
					},
					markerEnd: {
						type: MarkerType.ArrowClosed,
						width: 16,
						height: 16,
						color: "var(--color-border)",
					},
				} as AppEdge);
			}
		} else {
			// Non-branching nodes: single output
			if (node.nextNodeId) {
				rfEdges.push({
					id: `e-${node.id}-default-${node.nextNodeId}`,
					source: node.id,
					target: node.nextNodeId,
					type: RF_EDGE_TYPES.straight,
					data: { branchType: "next" as const },
				});
			} else {
				addTerminalStub(rfNodes, rfEdges, node.id, undefined, RF_EDGE_TYPES.straight, {
					branchType: "next" as const,
				});
			}
		}
	}

	// Collect persisted positions (from drag or DB) so computeAllPositions
	// places children relative to actual parent positions, not computed ones
	const persistedPositions = new Map<string, { x: number; y: number }>();
	for (const rfNode of rfNodes) {
		const dbNode = (rfNode.data as { _dbNode?: WorkflowNode })?._dbNode;
		if (dbNode?.position) {
			persistedPositions.set(rfNode.id, dbNode.position);
		}
	}

	const triggerId = trigger ? TRIGGER_NODE_ID : TRIGGER_PLACEHOLDER_ID;
	const computedPositions = computeAllPositions(rfNodes, rfEdges, triggerId, persistedPositions);

	for (const rfNode of rfNodes) {
		const pos = computedPositions.get(rfNode.id);
		if (pos) {
			rfNode.position = pos;
		}
	}

	return { nodes: rfNodes, edges: rfEdges };
}

/**
 * Convert React Flow nodes and edges back to database format.
 * Terminal stub nodes, placeholder nodes, and trigger nodes are filtered out.
 */
export function reactFlowToFlatArray(
	rfNodes: AppNode[],
	rfEdges: AppEdge[]
): { trigger: TriggerConfig | null; nodes: WorkflowNode[] } {
	const triggerRfNode = rfNodes.find((n) => n.id === TRIGGER_NODE_ID);
	const trigger =
		((triggerRfNode?.data as { trigger?: TriggerConfig } | undefined)
			?.trigger as TriggerConfig | undefined) ?? null;

	const workflowNodes: WorkflowNode[] = [];

	for (const rfNode of rfNodes) {
		if (rfNode.id === TRIGGER_NODE_ID) continue;
		if (rfNode.id === TRIGGER_PLACEHOLDER_ID) continue;
		if (isTerminalId(rfNode.id)) continue;
		// Filter out placeholder nodes -- they are frontend-only transient state
		if ((rfNode.data as { nodeType?: string })?.nodeType === "placeholder")
			continue;

		const dbNode = (rfNode.data as { _dbNode?: WorkflowNode } | undefined)
			?._dbNode;
		if (!dbNode) continue;

		const outEdges = rfEdges.filter((e) => e.source === rfNode.id);
		let nextNodeId: string | undefined;
		let elseNodeId: string | undefined;

		for (const edge of outEdges) {
			if (isTerminalId(edge.target)) continue;
			if (edge.data?.branchType === "loop_back") continue;

			// Use branchType as primary check, fall back to variant/sourceHandle
			const branchType = edge.data?.branchType as string | undefined;
			if (
				branchType === "no" ||
				branchType === "after" ||
				edge.data?.variant === "no" ||
				edge.sourceHandle === "no" ||
				edge.sourceHandle === "after"
			) {
				elseNodeId = edge.target;
			} else {
				nextNodeId = edge.target;
			}
		}

		// v2-only: config always comes from the RF node's live edit state,
		// falling back to the last-known db config. Legacy field names are
		// never written.
		const nodeData = rfNode.data as { config?: WorkflowNodeConfig } | undefined;
		const config = nodeData?.config ?? dbNode.config;

		const pos = { x: rfNode.position.x, y: rfNode.position.y };

		workflowNodes.push({
			id: dbNode.id,
			type: dbNode.type,
			config,
			nextNodeId,
			elseNodeId,
			bodyStartNodeId: dbNode.bodyStartNodeId,
			position: pos,
		});
	}

	return { trigger, nodes: workflowNodes };
}
