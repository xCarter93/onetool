import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 72;
const NODE_SEP = 50;
const RANK_SEP = 80;
const MARGIN_X = 20;
const MARGIN_Y = 20;

/**
 * Compute top-to-bottom dagre layout for React Flow nodes and edges.
 * Returns a new array of nodes with updated positions. Edges are unchanged.
 */
export function computeDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
	if (nodes.length === 0) return [];

	const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
	g.setGraph({
		rankdir: "TB",
		nodesep: NODE_SEP,
		ranksep: RANK_SEP,
		marginx: MARGIN_X,
		marginy: MARGIN_Y,
	});

	nodes.forEach((node) => {
		g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
	});

	edges.forEach((edge) => {
		g.setEdge(edge.source, edge.target);
	});

	dagre.layout(g);

	return nodes.map((node) => {
		const pos = g.node(node.id);
		return {
			...node,
			position: {
				x: pos.x - NODE_WIDTH / 2,
				y: pos.y - NODE_HEIGHT / 2,
			},
			targetPosition: "top" as const,
			sourcePosition: "bottom" as const,
		};
	});
}
