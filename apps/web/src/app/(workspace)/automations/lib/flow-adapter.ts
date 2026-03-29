import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNode } from "../components/workflow-node";
import type { TriggerConfig } from "../components/trigger-node";

export const TRIGGER_NODE_ID = "__trigger__";
export const TERMINAL_PREFIX = "__terminal__";

/** React Flow node type names (must match nodeTypes object keys) */
export const RF_NODE_TYPES = {
	trigger: "triggerNode",
	condition: "conditionNode",
	action: "actionNode",
	fetch_records: "fetchNode",
	loop: "loopNode",
	terminal: "terminalNode",
} as const;

/** React Flow edge type names (must match edgeTypes object keys) */
export const RF_EDGE_TYPES = {
	plusButton: "plusButtonEdge",
	branchLabel: "branchLabelEdge",
} as const;

/** Check if a node ID is a terminal stub (not a real workflow node) */
export function isTerminalId(id: string): boolean {
	return id.startsWith(TERMINAL_PREFIX);
}

/** Create a terminal stub node + edge for a leaf output */
function addTerminalStub(
	rfNodes: Node[],
	rfEdges: Edge[],
	sourceId: string,
	sourceHandle?: string,
	edgeData?: Record<string, unknown>
) {
	const handleSuffix = sourceHandle ? `-${sourceHandle}` : "";
	const terminalId = `${TERMINAL_PREFIX}${sourceId}${handleSuffix}`;

	rfNodes.push({
		id: terminalId,
		type: RF_NODE_TYPES.terminal,
		data: {},
		position: { x: 0, y: 0 },
	});

	rfEdges.push({
		id: `e-${sourceId}${handleSuffix}-${terminalId}`,
		source: sourceId,
		target: terminalId,
		sourceHandle: sourceHandle || undefined,
		type: RF_EDGE_TYPES.plusButton,
		data: { isTerminal: true, ...edgeData },
	});
}

/**
 * Convert database automation (trigger + flat nodes array) to React Flow nodes and edges.
 * Positions are all {x:0, y:0} -- call computeDagreLayout() after this to position them.
 *
 * Every leaf output (no child) gets a terminal stub: an invisible node connected by a
 * straight edge with an always-visible "+" button. This ensures the user can always add
 * new nodes at any open end of the workflow.
 */
export function automationToReactFlow(
	trigger: TriggerConfig | null,
	nodes: WorkflowNode[]
): { nodes: Node[]; edges: Edge[] } {
	const rfNodes: Node[] = [];
	const rfEdges: Edge[] = [];

	// 1. Create trigger node
	if (trigger) {
		rfNodes.push({
			id: TRIGGER_NODE_ID,
			type: RF_NODE_TYPES.trigger,
			data: { trigger, nodeType: "trigger" },
			position: { x: 0, y: 0 },
		});
	}

	// 2. Find root node (not referenced by any other node's nextNodeId or elseNodeId)
	const referencedIds = new Set<string>();
	for (const node of nodes) {
		if (node.nextNodeId) referencedIds.add(node.nextNodeId);
		if (node.elseNodeId) referencedIds.add(node.elseNodeId);
	}
	const rootNode = nodes.find((n) => !referencedIds.has(n.id));

	// 3. Connect trigger to root, or add terminal stub if no nodes
	if (trigger && rootNode) {
		rfEdges.push({
			id: `e-trigger-${rootNode.id}`,
			source: TRIGGER_NODE_ID,
			target: rootNode.id,
			type: RF_EDGE_TYPES.plusButton,
		});
	} else if (trigger && nodes.length === 0) {
		addTerminalStub(rfNodes, rfEdges, TRIGGER_NODE_ID);
	}

	// 4. Convert each workflow node to React Flow node + edges
	for (const node of nodes) {
		const rfNodeType =
			RF_NODE_TYPES[node.type as keyof typeof RF_NODE_TYPES] ||
			RF_NODE_TYPES.action;

		rfNodes.push({
			id: node.id,
			type: rfNodeType,
			data: {
				nodeType: node.type,
				condition: node.condition,
				action: node.action,
				// Preserve full node for round-trip (fetchConfig, loopConfig, etc.)
				_dbNode: { ...node },
			},
			position: { x: 0, y: 0 },
		});

		if (node.type === "condition") {
			// Condition: yes branch
			if (node.nextNodeId) {
				rfEdges.push({
					id: `e-${node.id}-${node.nextNodeId}`,
					source: node.id,
					target: node.nextNodeId,
					sourceHandle: "yes",
					type: RF_EDGE_TYPES.branchLabel,
					data: { label: "Yes", variant: "yes" },
				});
			} else {
				// Empty yes branch — terminal stub
				addTerminalStub(rfNodes, rfEdges, node.id, "yes", {
					label: "Yes",
					variant: "yes",
				});
			}

			// Condition: no branch
			if (node.elseNodeId) {
				rfEdges.push({
					id: `e-${node.id}-else-${node.elseNodeId}`,
					source: node.id,
					target: node.elseNodeId,
					sourceHandle: "no",
					type: RF_EDGE_TYPES.branchLabel,
					data: { label: "No", variant: "no" },
				});
			} else {
				// Empty no branch — terminal stub
				addTerminalStub(rfNodes, rfEdges, node.id, "no", {
					label: "No",
					variant: "no",
				});
			}
		} else {
			// Non-condition nodes: single output
			if (node.nextNodeId) {
				rfEdges.push({
					id: `e-${node.id}-${node.nextNodeId}`,
					source: node.id,
					target: node.nextNodeId,
					type: RF_EDGE_TYPES.plusButton,
				});
			} else {
				// Leaf node — terminal stub
				addTerminalStub(rfNodes, rfEdges, node.id);
			}
		}
	}

	return { nodes: rfNodes, edges: rfEdges };
}

/**
 * Convert React Flow nodes and edges back to database format (trigger + flat nodes array).
 * This is the inverse of automationToReactFlow -- must be round-trip faithful.
 * Terminal stub nodes are filtered out.
 */
export function reactFlowToFlatArray(
	rfNodes: Node[],
	rfEdges: Edge[]
): { trigger: TriggerConfig | null; nodes: WorkflowNode[] } {
	// Extract trigger
	const triggerRfNode = rfNodes.find((n) => n.id === TRIGGER_NODE_ID);
	const trigger = (triggerRfNode?.data?.trigger as TriggerConfig) ?? null;

	const workflowNodes: WorkflowNode[] = [];

	for (const rfNode of rfNodes) {
		if (rfNode.id === TRIGGER_NODE_ID) continue;
		if (isTerminalId(rfNode.id)) continue;

		const dbNode = rfNode.data?._dbNode as WorkflowNode | undefined;
		if (!dbNode) continue;

		// Reconstruct pointers from edges (edges are source of truth for connections)
		const outEdges = rfEdges.filter((e) => e.source === rfNode.id);
		let nextNodeId: string | undefined;
		let elseNodeId: string | undefined;

		for (const edge of outEdges) {
			// Skip edges pointing to terminal stubs
			if (isTerminalId(edge.target)) continue;

			if (edge.data?.variant === "no" || edge.sourceHandle === "no") {
				elseNodeId = edge.target;
			} else {
				nextNodeId = edge.target;
			}
		}

		workflowNodes.push({
			...dbNode,
			nextNodeId,
			elseNodeId,
		});
	}

	return { trigger, nodes: workflowNodes };
}
