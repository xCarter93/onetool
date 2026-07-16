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
import { triggerScopeObjectType } from "./node-types";
import { legacyNodeToV2, normalizeNodeConfig } from "./legacy-load";
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
export const MERGE_PREFIX = "__merge__";
export const GHOST_PREFIX = "__ghost__";

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
	merge: "mergeNode",
	branchGhost: "branchGhostNode",
} as const;

/** React Flow edge type names (must match edgeTypes object keys) */
export const RF_EDGE_TYPES = {
	straight: "straightEdge",
	branchLabel: "branchLabelEdge",
	loopBack: "loopBackEdge",
	afterLast: "afterLastEdge",
	mergeIn: "mergeInEdge",
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
	/** Never set on placeholders (only conditions merge); present for GraphNode-shape compatibility. */
	mergeNodeId?: string;
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

/** Check if a node ID is a synthetic branch-merge dot (not a real workflow node) */
export function isMergeId(id: string): boolean {
	return id.startsWith(MERGE_PREFIX);
}

export function mergeIdForCondition(conditionId: string): string {
	return `${MERGE_PREFIX}${conditionId}`;
}

/** Check if a node ID is a ghost "Choose a step" card (not a real workflow node) */
export function isGhostId(id: string): boolean {
	return id.startsWith(GHOST_PREFIX);
}

export function ghostIdFor(sourceId: string, handle: string): string {
	return `${GHOST_PREFIX}${sourceId}-${handle}`;
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

/**
 * Ghost "Choose a step" card + branch edge for an EMPTY condition branch or
 * loop body — the lane shows the same card a transient placeholder would,
 * instead of a bare "+" stub.
 */
function addBranchGhost(
	rfNodes: AppNode[],
	rfEdges: AppEdge[],
	sourceId: string,
	sourceHandle: string,
	edgeData: Record<string, unknown>
) {
	const ghostId = ghostIdFor(sourceId, sourceHandle);
	const edgeId = `e-${sourceId}-${sourceHandle}-${ghostId}`;

	rfNodes.push({
		id: ghostId,
		type: RF_NODE_TYPES.branchGhost,
		data: { nodeType: "branchGhost", edgeId },
		position: { x: 0, y: 0 },
		draggable: false,
	} as AppNode);

	rfEdges.push({
		id: edgeId,
		source: sourceId,
		target: ghostId,
		sourceHandle,
		type: RF_EDGE_TYPES.branchLabel,
		data: { ...edgeData, ghostTarget: true },
	} as AppEdge);
}

function resolveLoopBackSourceId(
	startNodeId: string | undefined,
	nodes: EditorNode[],
	mergeConditionIds?: Set<string>
): string {
	if (!startNodeId) {
		return "";
	}

	let loopBackSourceId = startNodeId;
	const visited = new Set<string>();

	while (true) {
		visited.add(loopBackSourceId);
		const bodyNode = nodes.find((n) => n.id === loopBackSourceId);
		// A condition's nextNodeId is the YES BRANCH, not a continuation.
		// Branch lanes reconverge at its merge dot; if a merge chain exists
		// the walk continues along it, otherwise the dot is the tail.
		if (bodyNode?.type === "condition") {
			if (bodyNode.mergeNodeId && !visited.has(bodyNode.mergeNodeId)) {
				loopBackSourceId = bodyNode.mergeNodeId;
				continue;
			}
			if (mergeConditionIds?.has(bodyNode.id)) {
				return mergeIdForCondition(bodyNode.id);
			}
			// No merge: both branches stop (end/next_item), so nothing falls out
			// of the condition — there is no tail to return from.
			return "";
		}
		if (!bodyNode?.nextNodeId || visited.has(bodyNode.nextNodeId)) {
			return loopBackSourceId;
		}
		loopBackSourceId = bodyNode.nextNodeId;
	}
}

/** Where a branch-tail's outgoing merge connector starts. */
type MergeExit = { sourceId: string; fromTerminalStub: boolean };

/**
 * Plan a merge dot per condition (Salesforce-style): both branch lanes
 * reconverge below the condition, and flow continues at the condition's
 * mergeNodeId chain when one is configured. A branch exits via its dangling
 * tail's terminal "+" stub, a nested condition's merge SUBTREE exit (its
 * chain tail when a continuation exists, else its dot's "+" stub), a tail
 * loop's After-Last stub, or an empty branch's ghost card; explicit
 * end/next_item tails stop the flow and feed nothing. A condition whose
 * branches both stop gets no merge dot unless a continuation is configured.
 */
function planConditionMerges(nodes: EditorNode[]): Map<string, MergeExit[]> {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const merges = new Map<string, MergeExit[]>();
	const planned = new Set<string>();

	function chainExit(startId: string): MergeExit | null {
		let currentId = startId;
		const visited = new Set<string>();
		while (true) {
			visited.add(currentId);
			const node = byId.get(currentId);
			if (!node) return null;
			if (node.type === "end" || node.type === "next_item") return null;
			if (node.type === "condition") return conditionExit(node);
			if (!node.nextNodeId || visited.has(node.nextNodeId)) {
				const suffix = node.type === "loop" ? "-after" : "";
				return {
					sourceId: `${TERMINAL_PREFIX}${node.id}${suffix}`,
					fromTerminalStub: true,
				};
			}
			currentId = node.nextNodeId;
		}
	}

	function conditionExit(cond: EditorNode): MergeExit | null {
		if (cond.type !== "condition") return null;
		if (!planned.has(cond.id)) {
			planned.add(cond.id);
			const inputs: MergeExit[] = [];
			// An empty branch renders a ghost "Choose a step" card; the merge
			// connector departs from the ghost's bottom.
			const yes = cond.nextNodeId
				? chainExit(cond.nextNodeId)
				: { sourceId: ghostIdFor(cond.id, "yes"), fromTerminalStub: false };
			const no = cond.elseNodeId
				? chainExit(cond.elseNodeId)
				: { sourceId: ghostIdFor(cond.id, "no"), fromTerminalStub: false };
			if (yes) inputs.push(yes);
			if (no) inputs.push(no);
			// A configured continuation keeps the dot even with no live inputs
			// (both branches stop) — the chain must stay visible/editable.
			if (inputs.length > 0 || cond.mergeNodeId) merges.set(cond.id, inputs);
		}
		if (!merges.has(cond.id)) return null;
		// The condition subtree's exit: the merge chain's tail when a
		// continuation exists, else the dot's own "+" stub.
		const mergeNodeId = (cond as WorkflowNode).mergeNodeId;
		if (mergeNodeId) return chainExit(mergeNodeId);
		return {
			sourceId: `${TERMINAL_PREFIX}${mergeIdForCondition(cond.id)}`,
			fromTerminalStub: true,
		};
	}

	for (const node of nodes) {
		if (node.type === "condition") conditionExit(node);
	}
	return merges;
}

function buildNodeData(node: EditorNode, trigger: TriggerConfig) {
	const triggerObjectType = triggerScopeObjectType(trigger);

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
				triggerObjectType: triggerScopeObjectType(trigger),
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
	for (const node of nodes) {
		if (node.type === "loop" && node.bodyStartNodeId) {
			for (const id of collectLoopBody(node.id, nodes)) {
				// The loop header itself is not body — only nodes nested in SOME
				// outer loop's body count (a top-level loop's After-Last just ends).
				if (id !== node.id) bodyNodeIds.add(id);
			}
		}
	}

	// Every condition gets a merge dot where its branch lanes reconverge;
	// flow continues at the condition's mergeNodeId chain when configured.
	const merges = planConditionMerges(nodes);
	const mergeConditionIds = new Set(merges.keys());
	const mergeFedIds = new Set<string>();
	for (const inputs of merges.values()) {
		for (const input of inputs) mergeFedIds.add(input.sourceId);
	}

	const loopBackSourceIds = new Set<string>();
	for (const node of nodes) {
		if (node.type === "loop" && node.bodyStartNodeId) {
			loopBackSourceIds.add(
				resolveLoopBackSourceId(node.bodyStartNodeId, nodes, mergeConditionIds)
			);
		}
	}
	const impliedNextItemData = (sourceId: string, terminalId: string) =>
		bodyNodeIds.has(sourceId) &&
		!loopBackSourceIds.has(sourceId) &&
		!loopBackSourceIds.has(terminalId) &&
		// A stub that flows onward into a merge dot already shows its return path.
		!mergeFedIds.has(terminalId)
			? { impliedNextItem: true }
			: {};

	// 2. Find root node (not referenced by any other node's pointers)
	const referencedIds = new Set<string>();
	for (const node of nodes) {
		if (node.nextNodeId) referencedIds.add(node.nextNodeId);
		if (node.elseNodeId) referencedIds.add(node.elseNodeId);
		if (node.bodyStartNodeId) referencedIds.add(node.bodyStartNodeId);
		if (node.mergeNodeId) referencedIds.add(node.mergeNodeId);
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
				addBranchGhost(rfNodes, rfEdges, node.id, "yes", {
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
				addBranchGhost(rfNodes, rfEdges, node.id, "no", {
					label: "No",
					variant: "no",
					branchType: "no" as const,
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
				addBranchGhost(rfNodes, rfEdges, node.id, "each", {
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

			// Loop-back edge: from last body node (or empty terminal) back to loop
			// header. Omitted when the body has no live tail (every path ends in
			// end/next_item) — an edge from a node that doesn't exist would be
			// silently dropped by React Flow anyway.
			const loopBackSourceId = node.bodyStartNodeId
				? resolveLoopBackSourceId(node.bodyStartNodeId, nodes, mergeConditionIds)
				: ghostIdFor(node.id, "each");
			if (loopBackSourceId) {
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

	// Merge dots + their incoming connectors. The dot itself is display-only
	// (never serialized), but its OUTGOING edge is real: the condition's
	// mergeNodeId continuation chain, or an insertable "+" stub to start one.
	for (const [conditionId, inputs] of merges) {
		const mergeId = mergeIdForCondition(conditionId);
		rfNodes.push({
			id: mergeId,
			type: RF_NODE_TYPES.merge,
			data: { nodeType: "merge", conditionId },
			position: { x: 0, y: 0 },
			draggable: false,
			selectable: false,
			focusable: false,
		} as AppNode);
		for (const input of inputs) {
			rfEdges.push({
				id: `e-mergein-${input.sourceId}-${mergeId}`,
				source: input.sourceId,
				target: mergeId,
				type: RF_EDGE_TYPES.mergeIn,
				data: {
					branchType: "merge_in" as const,
					fromTerminalStub: input.fromTerminalStub,
				},
			} as AppEdge);
		}

		const condition = nodes.find((n) => n.id === conditionId);
		const mergeTargetId =
			condition && !isPlaceholderEntry(condition)
				? condition.mergeNodeId
				: undefined;
		if (mergeTargetId) {
			rfEdges.push({
				id: `e-${mergeId}-merge-${mergeTargetId}`,
				source: mergeId,
				target: mergeTargetId,
				type: RF_EDGE_TYPES.straight,
				data: { branchType: "merge" as const },
			} as AppEdge);
		} else {
			addTerminalStub(rfNodes, rfEdges, mergeId, undefined, RF_EDGE_TYPES.straight, {
				branchType: "merge" as const,
			});
		}
	}

	// Edges sourced inside a loop body render in the loop's accent color.
	// Synthetic sources (terminal stubs, ghosts, merge points — possibly
	// stacked, e.g. a merge point's terminal stub) resolve to the real node
	// that owns them.
	const syntheticOwnerId = (sourceId: string): string => {
		let id = sourceId;
		if (id.startsWith(TERMINAL_PREFIX)) {
			id = id.slice(TERMINAL_PREFIX.length).replace(/-(after|yes|no)$/, "");
		}
		if (id.startsWith(GHOST_PREFIX)) {
			id = id.slice(GHOST_PREFIX.length).replace(/-(each|yes|no)$/, "");
		}
		if (id.startsWith(MERGE_PREFIX)) id = id.slice(MERGE_PREFIX.length);
		return id;
	};
	for (const e of rfEdges) {
		if (bodyNodeIds.has(syntheticOwnerId(e.source))) {
			e.data = { ...e.data, inLoop: true };
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
				// Same canonicalization as load (legacyNodeToV2) — the saved and
				// working signatures must hash identical configs.
				config: normalizeNodeConfig(node.config),
				nextNodeId: node.nextNodeId,
				elseNodeId: node.elseNodeId,
				bodyStartNodeId: node.bodyStartNodeId,
				mergeNodeId: node.mergeNodeId,
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
		if (isMergeId(rfNode.id)) continue;
		if (isGhostId(rfNode.id)) continue;
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
		let mergeNodeId: string | undefined;

		// The condition's continuation edge hangs off its synthetic merge dot,
		// not the condition node itself.
		if (dbType === "condition") {
			const mergeOut = rfEdges.find(
				(e) =>
					e.source === mergeIdForCondition(rfNode.id) &&
					e.data?.branchType === "merge" &&
					!isTerminalId(e.target)
			);
			if (mergeOut) mergeNodeId = mergeOut.target;
		}

		for (const edge of outEdges) {
			if (isTerminalId(edge.target)) continue;
			if (isMergeId(edge.target)) continue;
			if (isGhostId(edge.target)) continue;
			if (edge.data?.branchType === "loop_back") continue;
			if (edge.data?.branchType === "merge_in") continue;

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
			mergeNodeId,
		});
	}

	return { trigger, nodes: workflowNodes };
}
