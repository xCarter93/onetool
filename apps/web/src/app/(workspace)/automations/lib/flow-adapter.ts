import { MarkerType } from "@xyflow/react";
import type {
	ActionNodeConfig,
	AdjustTimeNodeConfig,
	AggregateNodeConfig,
	AppEdge,
	AppNode,
	ConditionNodeConfig,
	DelayNodeConfig,
	DelayUntilNodeConfig,
	FetchNodeConfig,
	LoopNodeConfig,
	TriggerConfig,
	WorkflowNode,
	WorkflowNodeConfig,
} from "./node-types";
import { legacyNodeToV2 } from "./legacy-load";
import { collectLoopBody } from "./graph-utils";
import {
	computeDerivedLayout,
	getDefaultNodeSize,
	type DerivedLayoutResult,
} from "./derived-layout";

export const TRIGGER_NODE_ID = "__trigger__";
export const TRIGGER_PLACEHOLDER_ID = "__trigger_placeholder__";
export const TERMINAL_PREFIX = "__terminal__";
export const CONTAINER_PREFIX = "__container__";

/** React Flow node type names (must match nodeTypes object keys) */
export const RF_NODE_TYPES = {
	trigger: "triggerNode",
	triggerPlaceholder: "triggerPlaceholderNode",
	condition: "conditionNode",
	action: "actionNode",
	fetch_records: "fetchNode",
	loop: "loopNode",
	aggregate: "aggregateNode",
	adjust_time: "adjustTimeNode",
	delay: "delayNode",
	delay_until: "delayUntilNode",
	end: "endNode",
	next_item: "nextItemNode",
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
	/** Never set on placeholders (only loop nodes have a body); present for GraphNode-shape compatibility. */
	bodyStartNodeId?: string;
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

/** Check if a node ID is a loop-container frame (not a real workflow node) */
export function isContainerId(id: string): boolean {
	return id.startsWith(CONTAINER_PREFIX);
}

export function containerIdForLoop(loopId: string): string {
	return `${CONTAINER_PREFIX}${loopId}`;
}

/**
 * Apply a computed layout to React Flow arrays: node positions, loop-container
 * geometry, and the route hints the loop edges need (After-Last hugs the
 * container's right edge, loop-back its left). Returns new arrays; inputs are
 * not mutated.
 */
export function applyDerivedLayout(
	rfNodes: AppNode[],
	rfEdges: AppEdge[],
	layout: DerivedLayoutResult
): { nodes: AppNode[]; edges: AppEdge[] } {
	const nodes = rfNodes.map((n) => {
		if (isContainerId(n.id)) {
			const rect = layout.containers.get(n.id.slice(CONTAINER_PREFIX.length));
			if (!rect) return n;
			return {
				...n,
				position: { x: rect.x, y: rect.y },
				data: { ...n.data, width: rect.width, height: rect.height },
			} as AppNode;
		}
		const pos = layout.positions.get(n.id);
		return pos ? ({ ...n, position: pos } as AppNode) : n;
	});

	const edges = rfEdges.map((e) => {
		const branchType = e.data?.branchType;
		if (branchType === "after") {
			const x = layout.afterLastRouteRightX.get(e.source);
			if (x !== undefined)
				return { ...e, data: { ...e.data, routeRightX: x } } as AppEdge;
		} else if (branchType === "loop_back") {
			const x = layout.loopBackRouteLeftX.get(e.target);
			if (x !== undefined)
				return { ...e, data: { ...e.data, routeLeftX: x } } as AppEdge;
		}
		return e;
	});

	return { nodes, edges };
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
			};
		case "action":
			return {
				nodeType: "action" as const,
				config: node.config as ActionNodeConfig | undefined,
				triggerObjectType,
			};
		case "fetch_records":
			return {
				nodeType: "fetch_records" as const,
				config: node.config as FetchNodeConfig | undefined,
				triggerObjectType,
			};
		case "loop":
			return {
				nodeType: "loop" as const,
				config: node.config as LoopNodeConfig | undefined,
				triggerObjectType,
			};
		case "aggregate":
			return {
				nodeType: "aggregate" as const,
				config: node.config as AggregateNodeConfig | undefined,
				triggerObjectType,
			};
		case "adjust_time":
			return {
				nodeType: "adjust_time" as const,
				config: node.config as AdjustTimeNodeConfig | undefined,
				triggerObjectType,
			};
		case "delay":
			return {
				nodeType: "delay" as const,
				config: node.config as DelayNodeConfig | undefined,
				triggerObjectType,
			};
		case "delay_until":
			return {
				nodeType: "delay_until" as const,
				config: node.config as DelayUntilNodeConfig | undefined,
				triggerObjectType,
			};
		case "end":
			return { nodeType: "end" as const };
		case "next_item":
			return { nodeType: "next_item" as const };
		default:
			return {
				nodeType: "action" as const,
				config: undefined,
				triggerObjectType,
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

	// Which nodes live inside a loop body, and which node/terminal carries the
	// loop-back edge. ANY dangling leaf inside a body (bare next, condition
	// branch, nested loop's After-Last) skips to the next item — mark it so
	// the canvas says so, except where the loop-back edge already makes the
	// return visible.
	const bodyNodeIds = new Set<string>();
	const loopBackSourceIds = new Set<string>();
	for (const node of nodes) {
		if (node.type === "loop" && node.bodyStartNodeId) {
			for (const id of collectLoopBody(node.id, nodes)) {
				// The loop header itself is not body — only nodes nested in SOME
				// outer loop's body count (a top-level loop's After-Last just ends).
				if (id !== node.id) bodyNodeIds.add(id);
			}
			loopBackSourceIds.add(resolveLoopBackSourceId(node.bodyStartNodeId, nodes));
		}
	}
	const impliedNextItemData = (sourceId: string, terminalId: string) =>
		bodyNodeIds.has(sourceId) &&
		!loopBackSourceIds.has(sourceId) &&
		!loopBackSourceIds.has(terminalId)
			? { impliedNextItem: true }
			: {};

	// 2. Find root node (not referenced by any other node's nextNodeId or elseNodeId)
	const referencedIds = new Set<string>();
	for (const node of nodes) {
		if (node.nextNodeId) referencedIds.add(node.nextNodeId);
		if (node.elseNodeId) referencedIds.add(node.elseNodeId);
		if (node.bodyStartNodeId) referencedIds.add(node.bodyStartNodeId);
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

		if (node.type === "end" || node.type === "next_item") {
			// Terminal nodes produce no outgoing edges — flow stops here
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
					...impliedNextItemData(node.id, `${TERMINAL_PREFIX}${node.id}-yes`),
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
					...impliedNextItemData(node.id, `${TERMINAL_PREFIX}${node.id}-no`),
				});
			}

			// No merge point -- branches stay independent
		} else if (node.type === "loop") {
			// Loop: "each" branch (bodyStartNodeId = loop body entry)
			if (node.bodyStartNodeId) {
				rfEdges.push({
					id: `e-${node.id}-each-${node.bodyStartNodeId}`,
					source: node.id,
					target: node.bodyStartNodeId,
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

			// Loop: "after" branch (nextNodeId = after the loop, like any linear node)
			if (node.nextNodeId) {
				rfEdges.push({
					id: `e-${node.id}-after-${node.nextNodeId}`,
					source: node.id,
					target: node.nextNodeId,
					sourceHandle: "after",
					type: RF_EDGE_TYPES.afterLast,
					data: { label: "After Last", variant: "no", branchType: "after" as const },
				} as AppEdge);
			} else {
				addTerminalStub(rfNodes, rfEdges, node.id, "after", RF_EDGE_TYPES.afterLast, {
					label: "After Last",
					variant: "no",
					branchType: "after" as const,
					// A nested loop's dangling After-Last falls through to the
					// OUTER loop's next item.
					...impliedNextItemData(node.id, `${TERMINAL_PREFIX}${node.id}-after`),
				});
			}

			// Loop-back edge: from last body node (or empty terminal) back to loop header
			{
				const loopBackSourceId = node.bodyStartNodeId
					? resolveLoopBackSourceId(node.bodyStartNodeId, nodes)
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
					...impliedNextItemData(node.id, `${TERMINAL_PREFIX}${node.id}`),
				});
			}
		}
	}

	// Derived layout, estimate pass: default per-type sizes position the first
	// paint; the flow component re-runs layout with real DOM measurements and
	// animates the delta. Persisted node positions are deliberately ignored.
	const layout = computeDerivedLayout(rfNodes, rfEdges, TRIGGER_NODE_ID, (_id, type) =>
		getDefaultNodeSize(type)
	);

	// Loop containers render behind everything (zIndex -1, prepended for paint order).
	const containerNodes: AppNode[] = [];
	for (const [loopId, rect] of layout.containers) {
		containerNodes.push({
			id: containerIdForLoop(loopId),
			type: "loopContainerNode",
			position: { x: rect.x, y: rect.y },
			data: {
				nodeType: "loopContainer",
				loopId,
				width: rect.width,
				height: rect.height,
			},
			draggable: false,
			selectable: false,
			focusable: false,
			zIndex: -1,
		} as AppNode);
	}

	return applyDerivedLayout([...containerNodes, ...rfNodes], rfEdges, layout);
}

/**
 * Serialize editor working state to the backend node shape: placeholders
 * dropped, stale persisted positions stripped. This is the PRODUCTION save
 * path — the editor's EditorNode[] is the single source of truth, and the
 * React Flow arrays are render-only derivations of it.
 */
export function serializeEditorNodes(nodes: EditorNode[]): WorkflowNode[] {
	return nodes
		.filter((n) => !isPlaceholderEntry(n))
		.map((n) => {
			const node = n as WorkflowNode;
			return {
				id: node.id,
				type: node.type,
				config: node.config,
				nextNodeId: node.nextNodeId,
				elseNodeId: node.elseNodeId,
				bodyStartNodeId: node.bodyStartNodeId,
			};
		});
}

/**
 * Convert React Flow nodes and edges back to database format.
 * Terminal stub nodes, container frames, placeholder nodes, and trigger
 * nodes are filtered out.
 *
 * Not used by the save path (see serializeEditorNodes) — retained as the
 * adapter's round-trip contract: it proves the emitted edges faithfully
 * encode the graph pointers, which insertion (handleInsertNode) relies on.
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
		if (isContainerId(rfNode.id)) continue;
		// Filter out placeholder nodes -- they are frontend-only transient state
		if ((rfNode.data as { nodeType?: string })?.nodeType === "placeholder")
			continue;

		const nodeData = rfNode.data as
			| { nodeType?: string; config?: WorkflowNodeConfig }
			| undefined;
		const dbType = nodeData?.nodeType as WorkflowNode["type"] | undefined;
		if (!dbType) continue;

		const outEdges = rfEdges.filter((e) => e.source === rfNode.id);
		let nextNodeId: string | undefined;
		let elseNodeId: string | undefined;
		let bodyStartNodeId: string | undefined;

		for (const edge of outEdges) {
			if (isTerminalId(edge.target)) continue;
			if (edge.data?.branchType === "loop_back") continue;

			const branchType = edge.data?.branchType as string | undefined;

			if (dbType === "loop") {
				// Loop: "each" -> bodyStartNodeId, "after" -> plain nextNodeId.
				if (branchType === "each" || edge.sourceHandle === "each") {
					bodyStartNodeId = edge.target;
				} else {
					nextNodeId = edge.target;
				}
				continue;
			}

			// Use branchType as primary check, fall back to variant/sourceHandle
			if (
				branchType === "no" ||
				edge.data?.variant === "no" ||
				edge.sourceHandle === "no"
			) {
				elseNodeId = edge.target;
			} else {
				nextNodeId = edge.target;
			}
		}

		// Positions are fully derived (Phase 2) — never persisted.
		workflowNodes.push({
			id: rfNode.id,
			type: dbType,
			config: nodeData?.config,
			nextNodeId,
			elseNodeId,
			bodyStartNodeId,
		});
	}

	return { trigger, nodes: workflowNodes };
}
