import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNode } from "../components/workflow-node";
import { collectLoopBody, collectSubtree } from "./graph-utils";

export const NODE_WIDTH = 280;
export const LOOP_NODE_WIDTH = 300; // Loop nodes are wider (min-w-[300px] in loop-node-rf.tsx)
export const NODE_HEIGHT = 72;
export const CONDITION_BRANCH_SPREAD = 180;
export const LOOP_EACH_HANDLE_RATIO = 0.5;
export const LOOP_AFTER_HANDLE_RATIO = 0.8;
const LOOP_NODE_HEIGHT = 72; // Loop node card height (branch labels render on edges)
const NODE_SEP = 50;
const RANK_SEP = 80;
const MARGIN_X = 20;
const MARGIN_Y = 20;

/** Distance below the source node for terminal "+" stubs */
const TERMINAL_OFFSET_Y = 60;

/**
 * Handle offset percentages for branching nodes (relative to center).
 * Condition: yes at 35%, no at 65%
 * Loop: "each" at center bottom, "after" exits from the right side (no offset needed)
 */
const HANDLE_OFFSETS: Record<string, number> = {
	yes: -0.15,   // 35% = center - 15%
	no: 0.15,     // 65% = center + 15%
	each: LOOP_EACH_HANDLE_RATIO - 0.5,
	after: 0,     // "After Last" terminal centered below loop (edge routes from right side)
};

/**
 * Minimum horizontal spread for terminal stubs (when both branches are empty).
 * This ensures Yes/No or ForEach/AfterLast stubs spread out visually.
 */
const TERMINAL_SPREAD_MIN = CONDITION_BRANCH_SPREAD;

/**
 * Compute top-to-bottom dagre layout for React Flow nodes and edges.
 *
 * Terminal stub nodes are NOT included in dagre — they're positioned
 * manually below their parent's source handle to avoid crossing.
 */
export function computeDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
	if (nodes.length === 0) return [];

	const realNodes = nodes.filter((n) => n.type !== "terminalNode");
	const terminalNodes = nodes.filter((n) => n.type === "terminalNode");

	const realNodeIds = new Set(realNodes.map((n) => n.id));
	const realEdges = edges.filter(
		(e) =>
			realNodeIds.has(e.source) &&
			realNodeIds.has(e.target) &&
			e.data?.branchType !== "loop_back" && // Exclude loop-back edges — dagre is for DAGs only
			e.data?.branchType !== "after" // Exclude "After Last" — routed via AfterLastEdge from right side
	);

	if (realNodes.length === 0) {
		return terminalNodes.map((node): Node => ({
			...node,
			position: { x: 0, y: TERMINAL_OFFSET_Y },
		}));
	}

	const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
	g.setGraph({
		rankdir: "TB",
		nodesep: NODE_SEP,
		ranksep: RANK_SEP,
		marginx: MARGIN_X,
		marginy: MARGIN_Y,
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

	const nodePositions = new Map<string, { x: number; y: number; height: number; width: number }>();

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
	// For branching nodes where both children are terminals, spread them out
	// so the layout looks like it will with real nodes.
	const layoutedTerminals = terminalNodes.map((terminal): Node => {
		const suffix = terminal.id.replace("__terminal__", "");

		// Parse handle suffix from terminal ID
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

		// Condition terminals stay fanned out to match connected branch placement.
		// Loop terminals stay directly under their respective handles so both loop
		// paths read as vertical continuations.
		let x = parentPos.x;
		if (handleId && handleId in HANDLE_OFFSETS) {
			const offset = HANDLE_OFFSETS[handleId];
			const parentWidth = parentPos.width || NODE_WIDTH;
			const handleX = parentPos.x + parentWidth * offset;
			if (handleId === "each" || handleId === "after") {
				// Both loop terminals go straight down under their respective handles.
				x = handleX;
			} else {
				const spread = Math.max(Math.abs(handleX - parentPos.x), TERMINAL_SPREAD_MIN);
				x = parentPos.x + (offset < 0 ? -spread : spread);
			}
		}

		return {
			...terminal,
			position: {
				x: x - 2,
				y: parentPos.y + parentPos.height / 2 + TERMINAL_OFFSET_Y,
			},
		};
	});

	return [...layoutedReal, ...layoutedTerminals];
}

/**
 * Align loop "For Each" body nodes in a straight vertical line under the loop node.
 * Dagre treats these as regular nodes and may scatter them horizontally.
 * This post-processes to force a clean vertical chain.
 */
export function alignLoopBodyNodes(
	layoutedNodes: Node[],
	workflowNodes: WorkflowNode[]
): Node[] {
	const nodeMap = new Map<string, Node>();
	for (const n of layoutedNodes) nodeMap.set(n.id, n);

	for (const wfNode of workflowNodes) {
		if (wfNode.type !== "loop" || !wfNode.nextNodeId) continue;

		const loopLayouted = nodeMap.get(wfNode.id);
		if (!loopLayouted) continue;

		// The "each" handle is centered for a hierarchy-first loop body column.
		// Center body nodes under this handle.
		const eachHandleX =
			loopLayouted.position.x + LOOP_NODE_WIDTH * LOOP_EACH_HANDLE_RATIO;
		const bodyCenterX = eachHandleX - NODE_WIDTH / 2;

		const bodyIds = getLoopBodyIdsForLayout(wfNode, workflowNodes);
		for (const bodyId of bodyIds) {
			if (bodyId === wfNode.id) continue;
			const node = nodeMap.get(bodyId);
			if (!node) continue;

			const newCenterX = bodyCenterX + NODE_WIDTH / 2;
			node.position = { ...node.position, x: bodyCenterX };

			// Re-align terminal stubs for this node (condition yes/no, etc.)
			for (const ln of layoutedNodes) {
				if (ln.type !== "terminalNode") continue;
				if (!ln.id.startsWith(`__terminal__${bodyId}`)) continue;
				const suffix = ln.id.slice(`__terminal__${bodyId}`.length);
				let termX = newCenterX;
				if (suffix === "-yes") termX = newCenterX - CONDITION_BRANCH_SPREAD;
				else if (suffix === "-no") termX = newCenterX + CONDITION_BRANCH_SPREAD;
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

export interface LoopBodyBounds {
	loopNodeId: string;
	bounds: { x: number; y: number; width: number; height: number };
}

export function computeLoopBodyBounds(
	layoutedNodes: Node[],
	workflowNodes: WorkflowNode[]
): LoopBodyBounds[] {
	const results: LoopBodyBounds[] = [];

	for (const wfNode of workflowNodes) {
		if (wfNode.type !== "loop" || !wfNode.nextNodeId) continue;

		// Collect loop node + all body descendants (excluding After Last subtree)
		const bodyIds = getLoopBodyIdsForLayout(wfNode, workflowNodes);

		// Compute bounding box from layouted node positions
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

	// Protect layout/overlay bounds from absorbing the loop's After Last subtree.
	// This can happen when body branches reconnect to nodes also reachable from elseNodeId.
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

/**
 * Position all "After Last" nodes and terminal stubs below the loop body.
 * The AfterLastEdge routes from the loop's right side, curves down past the
 * body, and connects to these centered targets. This function handles:
 * - Loops WITH bodies: position after nodes below the body bounds
 * - Loops WITHOUT bodies: position after nodes below the each-terminal area
 * - After terminal stubs: also repositioned (they aren't in workflowNodes)
 */
export function adjustAfterLastPositions(
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

		// Compute bottom of the "For Each" area
		const lb = loopBodies.find((b) => b.loopNodeId === wfNode.id);
		let bodyBottom: number;
		if (lb) {
			// Body exists: place after nodes below the body + gap
			bodyBottom = lb.bounds.y + lb.bounds.height + RANK_SEP;
		} else {
			// No body: place below loop + each terminal area
			bodyBottom = loopNode.position.y + LOOP_NODE_HEIGHT + TERMINAL_OFFSET_Y + RANK_SEP;
		}

		// Center "After Last" under the loop
		const afterCenterX = loopNode.position.x + LOOP_NODE_WIDTH / 2;

		// Move connected "after" nodes and their terminal stubs
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

			// Stack "after" subtree nodes vertically below bodyBottom
			let nextY = bodyBottom;
			const sortedAfterIds = [...afterIds];
			// Sort by current Y so the ordering is preserved
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

			// Reposition terminal stubs belonging to "after" subtree nodes.
			// Respects condition branch spreading so Yes/No stubs fan out correctly.
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

					// Determine handle suffix to apply correct X offset
					let termX = parentCenterX;
					const suffix = node.id.slice(`__terminal__${id}`.length);
					if (suffix === "-yes") {
						termX = parentCenterX - CONDITION_BRANCH_SPREAD;
					} else if (suffix === "-no") {
						termX = parentCenterX + CONDITION_BRANCH_SPREAD;
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

		// Move "after" terminal stub (not in workflowNodes — match by ID convention)
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
