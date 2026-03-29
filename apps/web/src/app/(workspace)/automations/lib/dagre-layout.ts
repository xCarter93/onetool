import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNode } from "../components/workflow-node";

export const NODE_WIDTH = 280;
export const LOOP_NODE_WIDTH = 300; // Loop nodes are wider (min-w-[300px] in loop-node-rf.tsx)
export const NODE_HEIGHT = 72;
const LOOP_NODE_HEIGHT = 100; // Loop nodes are taller (header + branch labels row)
const NODE_SEP = 50;
const RANK_SEP = 80;
const MARGIN_X = 20;
const MARGIN_Y = 20;

/** Distance below the source node for terminal "+" stubs */
const TERMINAL_OFFSET_Y = 60;

/**
 * Handle offset percentages for branching nodes (relative to center).
 * Condition: yes at 35%, no at 65%
 * Loop: each at 25%, after at 75%
 */
const HANDLE_OFFSETS: Record<string, number> = {
	yes: -0.15,   // 35% = center - 15%
	no: 0.15,     // 65% = center + 15%
	each: -0.25,  // 25% = center - 25%
	after: 0.25,  // 75% = center + 25%
};

/**
 * Minimum horizontal spread for terminal stubs (when both branches are empty).
 * This ensures Yes/No or ForEach/AfterLast stubs spread out visually.
 */
const TERMINAL_SPREAD_MIN = 100;

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
		(e) => realNodeIds.has(e.source) && realNodeIds.has(e.target)
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

		// For branch terminals, spread out at least TERMINAL_SPREAD_MIN from center
		let x = parentPos.x;
		if (handleId && handleId in HANDLE_OFFSETS) {
			const offset = HANDLE_OFFSETS[handleId];
			const parentWidth = parentPos.width || NODE_WIDTH;
			const handleX = parentPos.x + parentWidth * offset;
			// Ensure minimum spread from parent center
			const spread = Math.max(Math.abs(handleX - parentPos.x), TERMINAL_SPREAD_MIN);
			x = parentPos.x + (offset < 0 ? -spread : spread);
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

		// The "each" handle is at 25% of the loop node width.
		// Center body nodes under this handle.
		const eachHandleX = loopLayouted.position.x + LOOP_NODE_WIDTH * 0.25;
		const bodyCenterX = eachHandleX - NODE_WIDTH / 2;

		// Walk the body chain and align each node
		let current: string | undefined = wfNode.nextNodeId;
		const visited = new Set<string>();
		while (current && !visited.has(current)) {
			visited.add(current);
			const node = nodeMap.get(current);
			if (node) {
				node.position = { ...node.position, x: bodyCenterX };
			}
			const wf = workflowNodes.find((n) => n.id === current);
			current = wf?.nextNodeId;
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

		// Collect body node IDs (follow nextNodeId chain only)
		const bodyIds = new Set<string>();
		bodyIds.add(wfNode.id); // Include loop node itself
		let current: string | undefined = wfNode.nextNodeId;
		const visited = new Set<string>();
		while (current && !visited.has(current)) {
			visited.add(current);
			bodyIds.add(current);
			const next = workflowNodes.find((n) => n.id === current);
			current = next?.nextNodeId;
		}

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

export function adjustAfterLastPositions(
	layoutedNodes: Node[],
	loopBodies: LoopBodyBounds[],
	workflowNodes: WorkflowNode[]
): Node[] {
	if (loopBodies.length === 0) return layoutedNodes;

	const adjusted = [...layoutedNodes];
	for (const lb of loopBodies) {
		const loopWf = workflowNodes.find((n) => n.id === lb.loopNodeId);
		if (!loopWf?.elseNodeId) continue;

		// Find all nodes in the "After Last" subtree
		const afterIds = new Set<string>();
		const stack = [loopWf.elseNodeId];
		while (stack.length > 0) {
			const id = stack.pop()!;
			if (afterIds.has(id)) continue;
			afterIds.add(id);
			const n = workflowNodes.find((w) => w.id === id);
			if (n?.nextNodeId) stack.push(n.nextNodeId);
			if (n?.elseNodeId) stack.push(n.elseNodeId);
		}

		const bodyRight = lb.bounds.x + lb.bounds.width + 16;
		const bodyBottom = lb.bounds.y + lb.bounds.height + 16;

		for (let i = 0; i < adjusted.length; i++) {
			if (!afterIds.has(adjusted[i].id)) continue;
			const node = adjusted[i];
			if (node.position.x < bodyRight + NODE_WIDTH / 2) {
				adjusted[i] = {
					...node,
					position: {
						x: bodyRight + 20,
						y: Math.max(node.position.y, bodyBottom),
					},
				};
			}
		}
	}

	return adjusted;
}
