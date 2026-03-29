import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNode } from "../components/workflow-node";
import type { TriggerConfig } from "../components/trigger-node";

export const TRIGGER_NODE_ID = "__trigger__";

/** React Flow node type names (must match nodeTypes object keys) */
export const RF_NODE_TYPES = {
	trigger: "triggerNode",
	condition: "conditionNode",
	action: "actionNode",
	fetch_records: "fetchNode",
	loop: "loopNode",
} as const;

/** React Flow edge type names (must match edgeTypes object keys) */
export const RF_EDGE_TYPES = {
	plusButton: "plusButtonEdge",
	branchLabel: "branchLabelEdge",
} as const;

/**
 * Convert database automation (trigger + flat nodes array) to React Flow nodes and edges.
 * Positions are all {x:0, y:0} -- call computeDagreLayout() after this to position them.
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

	// 3. Connect trigger to root
	if (trigger && rootNode) {
		rfEdges.push({
			id: `e-trigger-${rootNode.id}`,
			source: TRIGGER_NODE_ID,
			target: rootNode.id,
			type: RF_EDGE_TYPES.plusButton,
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
			data: {
				nodeType: node.type,
				condition: node.condition,
				action: node.action,
				// Preserve full node for round-trip (fetchConfig, loopConfig, etc.)
				_dbNode: { ...node },
			},
			position: { x: 0, y: 0 },
		});

		// Create edges from pointers
		if (node.nextNodeId) {
			const isCondition = node.type === "condition";
			rfEdges.push({
				id: `e-${node.id}-${node.nextNodeId}`,
				source: node.id,
				target: node.nextNodeId,
				sourceHandle: isCondition ? "yes" : undefined,
				type: isCondition
					? RF_EDGE_TYPES.branchLabel
					: RF_EDGE_TYPES.plusButton,
				data: isCondition ? { label: "Yes", variant: "yes" } : undefined,
			});
		}

		if (node.elseNodeId) {
			rfEdges.push({
				id: `e-${node.id}-else-${node.elseNodeId}`,
				source: node.id,
				target: node.elseNodeId,
				sourceHandle: "no",
				type: RF_EDGE_TYPES.branchLabel,
				data: { label: "No", variant: "no" },
			});
		}
	}

	return { nodes: rfNodes, edges: rfEdges };
}

/**
 * Convert React Flow nodes and edges back to database format (trigger + flat nodes array).
 * This is the inverse of automationToReactFlow -- must be round-trip faithful.
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

		const dbNode = rfNode.data?._dbNode as WorkflowNode | undefined;
		if (!dbNode) {
			// Fallback: skip nodes without _dbNode (shouldn't happen in normal flow)
			continue;
		}

		// Reconstruct pointers from edges (edges are source of truth for connections)
		const outEdges = rfEdges.filter((e) => e.source === rfNode.id);
		let nextNodeId: string | undefined;
		let elseNodeId: string | undefined;

		for (const edge of outEdges) {
			if (edge.data?.variant === "no" || edge.sourceHandle === "no") {
				elseNodeId = edge.target;
			} else {
				// Default edge or "yes" variant
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
