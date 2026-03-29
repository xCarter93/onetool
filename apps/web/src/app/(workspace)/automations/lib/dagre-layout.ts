import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 72;
const LOOP_NODE_HEIGHT = 100; // Loop nodes are taller (header + branch labels row)
const NODE_SEP = 50;
const RANK_SEP = 80;
const MARGIN_X = 20;
const MARGIN_Y = 20;

/** Distance below the source node for terminal "+" stubs */
const TERMINAL_OFFSET_Y = 60;

/**
 * Handle offset percentages for branching nodes.
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
		const h = node.type === "loopNode" ? LOOP_NODE_HEIGHT : NODE_HEIGHT;
		g.setNode(node.id, { width: NODE_WIDTH, height: h });
	});

	realEdges.forEach((edge) => {
		g.setEdge(edge.source, edge.target);
	});

	dagre.layout(g);

	const nodePositions = new Map<string, { x: number; y: number; height: number }>();

	const layoutedReal = realNodes.map((node): Node => {
		const pos = g.node(node.id);
		const h = node.type === "loopNode" ? LOOP_NODE_HEIGHT : NODE_HEIGHT;
		const position = {
			x: pos.x - NODE_WIDTH / 2,
			y: pos.y - h / 2,
		};
		nodePositions.set(node.id, { x: pos.x, y: pos.y, height: h });
		return { ...node, position };
	});

	// Position terminal stubs below their parent source handles
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

		let x = parentPos.x;
		if (handleId && handleId in HANDLE_OFFSETS) {
			x = parentPos.x + NODE_WIDTH * HANDLE_OFFSETS[handleId];
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
