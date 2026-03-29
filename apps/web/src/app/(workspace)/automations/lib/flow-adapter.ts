import { MarkerType, type Node, type Edge } from "@xyflow/react";
import type { WorkflowNode } from "../components/workflow-node";
import type { TriggerConfig } from "../components/trigger-node";

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
	terminal: "terminalNode",
} as const;

/** React Flow edge type names (must match edgeTypes object keys) */
export const RF_EDGE_TYPES = {
	straight: "straightEdge",
	branchLabel: "branchLabelEdge",
	loopBack: "loopBackEdge",
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
	edgeType?: string,
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
		type: edgeType || RF_EDGE_TYPES.straight,
		data: { isTerminal: true, ...edgeData },
	});
}

/**
 * Convert database automation (trigger + flat nodes array) to React Flow nodes and edges.
 *
 * Every leaf output gets a terminal stub with an always-visible "+" button.
 * When no trigger is set, shows a dashed placeholder trigger node instead.
 */
export function automationToReactFlow(
	trigger: TriggerConfig | null,
	nodes: WorkflowNode[]
): { nodes: Node[]; edges: Edge[] } {
	const rfNodes: Node[] = [];
	const rfEdges: Edge[] = [];

	// 1. Create trigger node or placeholder
	if (trigger) {
		rfNodes.push({
			id: TRIGGER_NODE_ID,
			type: RF_NODE_TYPES.trigger,
			data: { trigger, nodeType: "trigger" },
			position: { x: 0, y: 0 },
		});
	} else {
		// No trigger — show dashed placeholder
		rfNodes.push({
			id: TRIGGER_PLACEHOLDER_ID,
			type: RF_NODE_TYPES.triggerPlaceholder,
			data: {},
			position: { x: 0, y: 0 },
		});
		// Placeholder gets a terminal stub below it
		addTerminalStub(rfNodes, rfEdges, TRIGGER_PLACEHOLDER_ID);
		return { nodes: rfNodes, edges: rfEdges };
	}

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
			data: {
				nodeType: node.type,
				condition: node.condition,
				action: node.action,
				_dbNode: { ...node },
				triggerObjectType: trigger?.objectType || null,
			},
			position: { x: 0, y: 0 },
		});

		if (node.type === "condition") {
			// Condition: yes branch (nextNodeId)
			if (node.nextNodeId) {
				rfEdges.push({
					id: `e-${node.id}-yes-${node.nextNodeId}`,
					source: node.id,
					target: node.nextNodeId,
					sourceHandle: "yes",
					type: RF_EDGE_TYPES.branchLabel,
					data: { label: "Yes", variant: "yes", branchType: "yes" as const },
				});
			} else {
				addTerminalStub(rfNodes, rfEdges, node.id, "yes", RF_EDGE_TYPES.branchLabel, {
					label: "Yes",
					variant: "yes",
					branchType: "yes" as const,
				});
			}

			// Condition: no branch (elseNodeId)
			if (node.elseNodeId) {
				rfEdges.push({
					id: `e-${node.id}-no-${node.elseNodeId}`,
					source: node.id,
					target: node.elseNodeId,
					sourceHandle: "no",
					type: RF_EDGE_TYPES.branchLabel,
					data: { label: "No", variant: "no", branchType: "no" as const },
				});
			} else {
				addTerminalStub(rfNodes, rfEdges, node.id, "no", RF_EDGE_TYPES.branchLabel, {
					label: "No",
					variant: "no",
					branchType: "no" as const,
				});
			}
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
				});
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
					type: RF_EDGE_TYPES.branchLabel,
					data: { label: "After Last", variant: "no", branchType: "after" as const },
				});
			} else {
				addTerminalStub(rfNodes, rfEdges, node.id, "after", RF_EDGE_TYPES.branchLabel, {
					label: "After Last",
					variant: "no",
					branchType: "after" as const,
				});
			}

			// Loop-back edge: from last body node back to loop header
			if (node.nextNodeId) {
				let lastBodyId = node.nextNodeId;
				const visited = new Set<string>();
				while (true) {
					visited.add(lastBodyId);
					const bodyNode = nodes.find((n) => n.id === lastBodyId);
					if (!bodyNode?.nextNodeId || visited.has(bodyNode.nextNodeId)) break;
					lastBodyId = bodyNode.nextNodeId;
				}

				rfEdges.push({
					id: `e-loopback-${node.id}`,
					source: lastBodyId,
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
				});
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

	return { nodes: rfNodes, edges: rfEdges };
}

/**
 * Convert React Flow nodes and edges back to database format.
 * Terminal stub nodes and placeholder nodes are filtered out.
 */
export function reactFlowToFlatArray(
	rfNodes: Node[],
	rfEdges: Edge[]
): { trigger: TriggerConfig | null; nodes: WorkflowNode[] } {
	const triggerRfNode = rfNodes.find((n) => n.id === TRIGGER_NODE_ID);
	const trigger = (triggerRfNode?.data?.trigger as TriggerConfig) ?? null;

	const workflowNodes: WorkflowNode[] = [];

	for (const rfNode of rfNodes) {
		if (rfNode.id === TRIGGER_NODE_ID) continue;
		if (rfNode.id === TRIGGER_PLACEHOLDER_ID) continue;
		if (isTerminalId(rfNode.id)) continue;

		const dbNode = rfNode.data?._dbNode as WorkflowNode | undefined;
		if (!dbNode) continue;

		const outEdges = rfEdges.filter((e) => e.source === rfNode.id);
		let nextNodeId: string | undefined;
		let elseNodeId: string | undefined;

		for (const edge of outEdges) {
			if (isTerminalId(edge.target)) continue;

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

		workflowNodes.push({ ...dbNode, nextNodeId, elseNodeId });
	}

	return { trigger, nodes: workflowNodes };
}
