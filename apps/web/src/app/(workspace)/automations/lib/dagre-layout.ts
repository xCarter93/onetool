import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 72;
const NODE_SEP = 50;
const RANK_SEP = 80;
const MARGIN_X = 20;
const MARGIN_Y = 20;

/** Distance below the source node for terminal "+" stubs */
const TERMINAL_OFFSET_Y = 60;

/**
 * Compute top-to-bottom dagre layout for React Flow nodes and edges.
 *
 * Terminal stub nodes are NOT included in the dagre graph. Instead, they are
 * manually positioned directly below their parent's source handle after layout.
 * This avoids dagre merging overlapping stubs and creating crossed edges.
 */
export function computeDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
	if (nodes.length === 0) return [];

	// Separate real nodes from terminal stubs
	const realNodes = nodes.filter((n) => n.type !== "terminalNode");
	const terminalNodes = nodes.filter((n) => n.type === "terminalNode");

	// Only include edges between real nodes in dagre
	const realNodeIds = new Set(realNodes.map((n) => n.id));
	const realEdges = edges.filter(
		(e) => realNodeIds.has(e.source) && realNodeIds.has(e.target)
	);

	if (realNodes.length === 0) {
		// No real nodes — just position terminals at origin
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
		g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
	});

	realEdges.forEach((edge) => {
		g.setEdge(edge.source, edge.target);
	});

	dagre.layout(g);

	// Build a map of source node positions for terminal placement
	const nodePositions = new Map<string, { x: number; y: number }>();

	const layoutedReal = realNodes.map((node): Node => {
		const pos = g.node(node.id);
		const position = {
			x: pos.x - NODE_WIDTH / 2,
			y: pos.y - NODE_HEIGHT / 2,
		};
		nodePositions.set(node.id, { x: pos.x, y: pos.y });
		return { ...node, position };
	});

	// Position terminal stubs below their parent source handles
	const layoutedTerminals = terminalNodes.map((terminal): Node => {
		// Terminal IDs: "__terminal__{sourceId}" or "__terminal__{sourceId}-{handle}"
		const suffix = terminal.id.replace("__terminal__", "");
		let sourceId: string;
		let handleId: string | null = null;

		// Check for handle suffixes (-yes, -no)
		if (suffix.endsWith("-yes")) {
			sourceId = suffix.slice(0, -4);
			handleId = "yes";
		} else if (suffix.endsWith("-no")) {
			sourceId = suffix.slice(0, -3);
			handleId = "no";
		} else {
			sourceId = suffix;
		}

		const parentPos = nodePositions.get(sourceId);
		if (!parentPos) {
			return { ...terminal, position: { x: 0, y: 0 } };
		}

		// Position directly below the source handle
		let x = parentPos.x;
		if (handleId === "yes") {
			// Yes handle is at 35% of node width
			x = parentPos.x - NODE_WIDTH * 0.15;
		} else if (handleId === "no") {
			// No handle is at 65% of node width
			x = parentPos.x + NODE_WIDTH * 0.15;
		}

		return {
			...terminal,
			position: {
				x: x - 2, // center the 4px terminal
				y: parentPos.y + NODE_HEIGHT / 2 + TERMINAL_OFFSET_Y,
			},
		};
	});

	return [...layoutedReal, ...layoutedTerminals];
}
