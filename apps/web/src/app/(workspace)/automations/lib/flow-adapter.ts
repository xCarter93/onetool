import { MarkerType, type Node, type Edge } from "@xyflow/react";
import type { WorkflowNode } from "../lib/node-types";
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
 *
 * Condition nodes emit edges from a single center handle (both Yes and No).
 * No merge points are generated -- branches stay independent.
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

		// Build node data -- support both old flat format and new config format
		// NodeBase has legacy .condition and .action fields for backward compat
		const conditionConfig = node.type === "condition"
			? (node.config || node.condition)
			: undefined;
		const actionConfig = node.type === "action"
			? (node.config || node.action)
			: undefined;
		const fetchConfig = (node.type === "fetch_records" || node.type === "loop")
			? node.config
			: undefined;

		rfNodes.push({
			id: node.id,
			type: rfNodeType,
			data: {
				nodeType: node.type,
				config: conditionConfig || actionConfig || fetchConfig || undefined,
				// Backward compat: keep legacy fields for components that still read them
				condition: node.condition,
				action: node.action,
				_dbNode: { ...node },
				triggerObjectType: trigger?.objectType || null,
			},
			position: { x: 0, y: 0 },
		});

		if (node.type === "end") {
			// End nodes produce no outgoing edges — flow stops here
		} else if (node.type === "condition") {
			// Condition: Yes branch (nextNodeId) -- from center handle
			if (node.nextNodeId) {
				rfEdges.push({
					id: `e-${node.id}-yes-${node.nextNodeId}`,
					source: node.id,
					target: node.nextNodeId,
					sourceHandle: "center",
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

			// Condition: No branch (elseNodeId) -- from center handle
			if (node.elseNodeId) {
				rfEdges.push({
					id: `e-${node.id}-no-${node.elseNodeId}`,
					source: node.id,
					target: node.elseNodeId,
					sourceHandle: "center",
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
					type: RF_EDGE_TYPES.afterLast,
					data: { label: "After Last", variant: "no", branchType: "after" as const },
				});
			} else {
				addTerminalStub(rfNodes, rfEdges, node.id, "after", RF_EDGE_TYPES.afterLast, {
					label: "After Last",
					variant: "no",
					branchType: "after" as const,
				});
			}

			// Loop-back edge: from last body node (or empty terminal) back to loop header
			{
				let loopBackSourceId: string;
				if (node.nextNodeId) {
					loopBackSourceId = node.nextNodeId;
					const visited = new Set<string>();
					while (true) {
						visited.add(loopBackSourceId);
						const bodyNode = nodes.find((n) => n.id === loopBackSourceId);
						if (!bodyNode?.nextNodeId || visited.has(bodyNode.nextNodeId)) break;
						loopBackSourceId = bodyNode.nextNodeId;
					}
				} else {
					loopBackSourceId = `${TERMINAL_PREFIX}${node.id}-each`;
				}

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
 * Terminal stub nodes, placeholder nodes, and trigger nodes are filtered out.
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
		// Filter out placeholder nodes -- they are frontend-only transient state
		if (rfNode.data?.nodeType === "placeholder") continue;

		const dbNode = rfNode.data?._dbNode as WorkflowNode | undefined;
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

		// Build the output node -- support both old flat format and new config format
		const nodeData = rfNode.data as Record<string, unknown> | undefined;
		const config = nodeData?.config || dbNode.condition || dbNode.action;

		const outputNode: WorkflowNode = {
			...dbNode,
			nextNodeId,
			elseNodeId,
		};

		// If config exists, write it to the output node for new format
		if (config && (dbNode.type === "condition" || dbNode.type === "action" || dbNode.type === "fetch_records" || dbNode.type === "loop")) {
			// Use type assertion to write config on the discriminated union member
			(outputNode as unknown as { config: unknown }).config = config;
		}

		workflowNodes.push(outputNode);
	}

	return { trigger, nodes: workflowNodes };
}
