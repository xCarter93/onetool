import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNode } from "../lib/node-types";
import { collectLoopBody, collectSubtree } from "./graph-utils";

export const NODE_WIDTH = 280;
export const LOOP_NODE_WIDTH = 300; // Loop nodes are wider (min-w-[300px] in loop-node-rf.tsx)
export const NODE_HEIGHT = 72;

const LOOP_NODE_HEIGHT = 72;
const NODE_SEP = 50;
const RANK_SEP = 80;
const MARGIN_X = 20;
const MARGIN_Y = 20;

/** Distance below the source node for terminal "+" stubs */
const TERMINAL_OFFSET_Y = 60;

/**
 * Handle offset percentages for branching terminal stubs (relative to center).
 * Conditions now use center output -- dagre places children naturally.
 * Loop: "each" at center bottom, "after" exits from the right side.
 */
const HANDLE_OFFSETS: Record<string, number> = {
	each: 0, // center bottom
	after: 0, // After Last -- positioned by Pass 3
};

/**
 * Minimum horizontal spread for terminal stubs of the same parent.
 */
const TERMINAL_SPREAD_MIN = 180;

// ---------------------------------------------------------------------------
// Pass 1: Dagre -- compute base positions for all real nodes
// ---------------------------------------------------------------------------

function runDagre(nodes: Node[], edges: Edge[]): {
	layoutedReal: Node[];
	layoutedTerminals: Node[];
	nodePositions: Map<string, { x: number; y: number; height: number; width: number }>;
} {
	const realNodes = nodes.filter((n) => n.type !== "terminalNode");
	const terminalNodes = nodes.filter((n) => n.type === "terminalNode");

	const realNodeIds = new Set(realNodes.map((n) => n.id));
	const realEdges = edges.filter(
		(e) =>
			realNodeIds.has(e.source) &&
			realNodeIds.has(e.target) &&
			e.data?.branchType !== "loop_back" &&
			e.data?.branchType !== "after"
	);

	const nodePositions = new Map<string, { x: number; y: number; height: number; width: number }>();

	if (realNodes.length === 0) {
		const layoutedTerminals = terminalNodes.map((node): Node => ({
			...node,
			position: { x: 0, y: TERMINAL_OFFSET_Y },
		}));
		return { layoutedReal: [], layoutedTerminals, nodePositions };
	}

	const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
	g.setGraph({
		rankdir: "TB",
		nodesep: NODE_SEP,
		ranksep: RANK_SEP,
		marginx: MARGIN_X,
		marginy: MARGIN_Y,
		acyclicer: "greedy",
	});

	realNodes.forEach((node) => {
		const w = node.type === "loopNode" ? LOOP_NODE_WIDTH : NODE_WIDTH;
		const h = node.type === "loopNode" ? LOOP_NODE_HEIGHT : NODE_HEIGHT;
		g.setNode(node.id, { width: w, height: h });
	});

	realEdges.forEach((edge) => {
		g.setEdge(edge.source, edge.target);
	});

	dagre.layout(g);

	const layoutedReal = realNodes.map((node): Node => {
		const pos = g.node(node.id);
		const w = node.type === "loopNode" ? LOOP_NODE_WIDTH : NODE_WIDTH;
		const h = node.type === "loopNode" ? LOOP_NODE_HEIGHT : NODE_HEIGHT;
		const position = {
			x: pos.x - w / 2,
			y: pos.y - h / 2,
		};
		nodePositions.set(node.id, { x: pos.x, y: pos.y, height: h, width: w });
		return { ...node, position };
	});

	// Position terminal stubs below their parent source handles.
	const layoutedTerminals = terminalNodes.map((terminal): Node => {
		const suffix = terminal.id.replace("__terminal__", "");

		let sourceId = suffix;
		let handleId: string | null = null;

		for (const handle of ["yes", "no", "each", "after"]) {
			if (suffix.endsWith(`-${handle}`)) {
				sourceId = suffix.slice(0, -(handle.length + 1));
				handleId = handle;
				break;
			}
		}

		const parentPos = nodePositions.get(sourceId);
		if (!parentPos) {
			return { ...terminal, position: { x: 0, y: 0 } };
		}

		let x = parentPos.x;
		if (handleId && handleId in HANDLE_OFFSETS) {
			const offset = HANDLE_OFFSETS[handleId];
			const parentWidth = parentPos.width || NODE_WIDTH;
			const handleX = parentPos.x + parentWidth * offset;
			// Loop terminals go straight down under their respective handles
			x = handleX;
		} else if (handleId === "yes" || handleId === "no") {
			// Condition branch terminals: spread left/right from parent center
			const spread = TERMINAL_SPREAD_MIN;
			x = parentPos.x + (handleId === "yes" ? -spread : spread);
		}

		return {
			...terminal,
			position: {
				x: x - 2,
				y: parentPos.y + parentPos.height / 2 + TERMINAL_OFFSET_Y,
			},
		};
	});

	return { layoutedReal, layoutedTerminals, nodePositions };
}

// ---------------------------------------------------------------------------
// Pass 2: alignLoopBody -- align loop body nodes in vertical column
// ---------------------------------------------------------------------------

function alignLoopBodies(
	layoutedNodes: Node[],
	workflowNodes: WorkflowNode[]
): Node[] {
	const nodeMap = new Map<string, Node>();
	for (const n of layoutedNodes) nodeMap.set(n.id, n);

	for (const wfNode of workflowNodes) {
		if (wfNode.type !== "loop" || !wfNode.nextNodeId) continue;

		const loopLayouted = nodeMap.get(wfNode.id);
		if (!loopLayouted) continue;

		// Center body nodes under the loop's center
		const loopCenterX = loopLayouted.position.x + LOOP_NODE_WIDTH / 2;
		const bodyCenterX = loopCenterX - NODE_WIDTH / 2;

		const bodyIds = getLoopBodyIdsForLayout(wfNode, workflowNodes);

		// Align loop node itself to its incoming flow (if it has a parent)
		// This is the merged alignLoopNodesToIncomingFlow logic

		for (const bodyId of bodyIds) {
			if (bodyId === wfNode.id) continue;
			const node = nodeMap.get(bodyId);
			if (!node) continue;

			const newCenterX = bodyCenterX + NODE_WIDTH / 2;
			node.position = { ...node.position, x: bodyCenterX };

			// Re-align terminal stubs for this node
			for (const ln of layoutedNodes) {
				if (ln.type !== "terminalNode") continue;
				if (!ln.id.startsWith(`__terminal__${bodyId}`)) continue;
				const suffix = ln.id.slice(`__terminal__${bodyId}`.length);
				let termX = newCenterX;
				if (suffix === "-yes") termX = newCenterX - TERMINAL_SPREAD_MIN;
				else if (suffix === "-no") termX = newCenterX + TERMINAL_SPREAD_MIN;
				ln.position = {
					...ln.position,
					x: termX - 2,
					y: node.position.y + NODE_HEIGHT + TERMINAL_OFFSET_Y,
				};
			}
		}
	}

	return layoutedNodes;
}

// ---------------------------------------------------------------------------
// Loop body bounds -- used by Pass 2 and Pass 3
// ---------------------------------------------------------------------------

interface LoopBodyBounds {
	loopNodeId: string;
	bounds: { x: number; y: number; width: number; height: number };
}

function computeLoopBodyBounds(
	layoutedNodes: Node[],
	workflowNodes: WorkflowNode[]
): LoopBodyBounds[] {
	const results: LoopBodyBounds[] = [];

	for (const wfNode of workflowNodes) {
		if (wfNode.type !== "loop" || !wfNode.nextNodeId) continue;

		const bodyIds = getLoopBodyIdsForLayout(wfNode, workflowNodes);
		const bodyLayouted = layoutedNodes.filter((n) => bodyIds.has(n.id));
		if (bodyLayouted.length === 0) continue;

		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const n of bodyLayouted) {
			const w = n.type === "loopNode" ? LOOP_NODE_WIDTH : NODE_WIDTH;
			const h = n.type === "loopNode" ? LOOP_NODE_HEIGHT : NODE_HEIGHT;
			minX = Math.min(minX, n.position.x);
			minY = Math.min(minY, n.position.y);
			maxX = Math.max(maxX, n.position.x + w);
			maxY = Math.max(maxY, n.position.y + h);
		}

		results.push({
			loopNodeId: wfNode.id,
			bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
		});
	}

	return results;
}

function getLoopBodyIdsForLayout(
	loopNode: WorkflowNode,
	workflowNodes: WorkflowNode[]
): Set<string> {
	const bodyIds = collectLoopBody(loopNode.id, workflowNodes);

	if (loopNode.elseNodeId) {
		const afterIds = collectSubtree(loopNode.elseNodeId, workflowNodes);
		for (const id of afterIds) {
			if (id !== loopNode.id) {
				bodyIds.delete(id);
			}
		}
	}

	bodyIds.add(loopNode.id);
	return bodyIds;
}

// ---------------------------------------------------------------------------
// Pass 3: adjustAfterLast -- position "After Last" subtrees below loop bodies
// ---------------------------------------------------------------------------

function adjustAfterLast(
	layoutedNodes: Node[],
	loopBodies: LoopBodyBounds[],
	workflowNodes: WorkflowNode[]
): Node[] {
	const adjusted = [...layoutedNodes];
	const indexById = new Map<string, number>();
	for (let i = 0; i < adjusted.length; i++) indexById.set(adjusted[i].id, i);

	for (const wfNode of workflowNodes) {
		if (wfNode.type !== "loop") continue;

		const loopIdx = indexById.get(wfNode.id);
		if (loopIdx === undefined) continue;
		const loopNode = adjusted[loopIdx];

		const lb = loopBodies.find((b) => b.loopNodeId === wfNode.id);
		let bodyBottom: number;
		if (lb) {
			bodyBottom = lb.bounds.y + lb.bounds.height + RANK_SEP;
		} else {
			bodyBottom = loopNode.position.y + LOOP_NODE_HEIGHT + TERMINAL_OFFSET_Y + RANK_SEP;
		}

		const afterCenterX = loopNode.position.x + LOOP_NODE_WIDTH / 2;

		if (wfNode.elseNodeId) {
			const afterIds = new Set<string>();
			const stack = [wfNode.elseNodeId];
			while (stack.length > 0) {
				const id = stack.pop()!;
				if (afterIds.has(id)) continue;
				afterIds.add(id);
				const n = workflowNodes.find((w) => w.id === id);
				if (n?.nextNodeId) stack.push(n.nextNodeId);
				if (n?.elseNodeId) stack.push(n.elseNodeId);
			}

			let nextY = bodyBottom;
			const sortedAfterIds = [...afterIds];
			sortedAfterIds.sort((a, b) => {
				const ai = indexById.get(a);
				const bi = indexById.get(b);
				if (ai === undefined || bi === undefined) return 0;
				return adjusted[ai].position.y - adjusted[bi].position.y;
			});

			for (const id of sortedAfterIds) {
				const idx = indexById.get(id);
				if (idx === undefined) continue;
				adjusted[idx] = {
					...adjusted[idx],
					position: {
						x: afterCenterX - NODE_WIDTH / 2,
						y: nextY,
					},
				};
				nextY += NODE_HEIGHT + RANK_SEP;
			}

			// Reposition terminal stubs belonging to "after" subtree nodes
			for (const id of afterIds) {
				const parentIdx = indexById.get(id);
				if (parentIdx === undefined) continue;
				const parentNode = adjusted[parentIdx];
				const parentCenterX = parentNode.position.x + NODE_WIDTH / 2;
				const parentBottomY = parentNode.position.y + NODE_HEIGHT;

				for (let i = 0; i < adjusted.length; i++) {
					const node = adjusted[i];
					if (node.type !== "terminalNode") continue;
					if (!node.id.startsWith(`__terminal__${id}`)) continue;

					let termX = parentCenterX;
					const suffix = node.id.slice(`__terminal__${id}`.length);
					if (suffix === "-yes") {
						termX = parentCenterX - TERMINAL_SPREAD_MIN;
					} else if (suffix === "-no") {
						termX = parentCenterX + TERMINAL_SPREAD_MIN;
					}

					adjusted[i] = {
						...node,
						position: {
							x: termX - 2,
							y: parentBottomY + TERMINAL_OFFSET_Y,
						},
					};
				}
			}
		}

		// Move "after" terminal stub
		const afterTerminalId = `__terminal__${wfNode.id}-after`;
		const termIdx = indexById.get(afterTerminalId);
		if (termIdx !== undefined) {
			adjusted[termIdx] = {
				...adjusted[termIdx],
				position: {
					x: afterCenterX - 2,
					y: bodyBottom,
				},
			};
		}
	}

	return adjusted;
}

// ---------------------------------------------------------------------------
// Public API: single entry point for the 3-pass layout pipeline
// ---------------------------------------------------------------------------

/**
 * Compute the full layout for automation workflow nodes and edges.
 *
 * Runs 3 passes internally:
 * 1. **Dagre** -- base TB layout (terminals positioned manually, loop-back/after edges excluded)
 * 2. **alignLoopBodies** -- vertically align loop body nodes under their loop header
 * 3. **adjustAfterLast** -- position "After Last" subtrees below loop body bounds
 *
 * @param nodes React Flow nodes (including terminal stubs)
 * @param edges React Flow edges (including loop-back and after-last edges)
 * @param workflowNodes Database-format workflow nodes (needed for loop body collection)
 * @returns Positioned nodes ready for React Flow rendering
 */
export function computeLayout(
	nodes: Node[],
	edges: Edge[],
	workflowNodes: WorkflowNode[] = []
): Node[] {
	if (nodes.length === 0) return [];

	// Pass 1: Dagre
	const { layoutedReal, layoutedTerminals } = runDagre(nodes, edges);
	let result = [...layoutedReal, ...layoutedTerminals];

	// Pass 2: Align loop bodies
	result = alignLoopBodies(result, workflowNodes);

	// Pass 3: Adjust "After Last" positions
	const loopBodies = computeLoopBodyBounds(result, workflowNodes);
	result = adjustAfterLast(result, loopBodies, workflowNodes);

	return result;
}
