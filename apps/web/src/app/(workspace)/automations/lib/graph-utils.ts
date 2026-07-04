/**
 * Minimal shape the graph traversal helpers need. WorkflowNode and the
 * editor's PlaceholderEntry (lib/flow-adapter.ts) both satisfy this.
 */
export type GraphNode = {
	id: string;
	type: string;
	nextNodeId?: string;
	elseNodeId?: string;
	/** Loop body entry point. */
	bodyStartNodeId?: string;
};

/**
 * Collect all node IDs in the subtree rooted at startNodeId.
 * Follows both nextNodeId and elseNodeId pointers via BFS.
 * Always includes startNodeId itself, even if not found in the nodes array.
 */
export function collectSubtree(
	startNodeId: string,
	nodes: GraphNode[]
): Set<string> {
	const nodeMap = new Map<string, GraphNode>();
	for (const node of nodes) {
		nodeMap.set(node.id, node);
	}

	const visited = new Set<string>();
	const queue: string[] = [startNodeId];

	while (queue.length > 0) {
		const current = queue.shift()!;
		if (visited.has(current)) continue;
		visited.add(current);

		const node = nodeMap.get(current);
		if (!node) continue;

		if (node.nextNodeId && !visited.has(node.nextNodeId)) {
			queue.push(node.nextNodeId);
		}
		if (node.elseNodeId && !visited.has(node.elseNodeId)) {
			queue.push(node.elseNodeId);
		}
	}

	return visited;
}

/**
 * Collect the loop node and its "For Each" body subtree.
 * Walks from bodyStartNodeId (the body path), NOT nextNodeId (the "After Last" path).
 * Always includes the loop node itself.
 */
export function collectLoopBody(
	loopNodeId: string,
	nodes: GraphNode[]
): Set<string> {
	const nodeMap = new Map<string, GraphNode>();
	for (const node of nodes) {
		nodeMap.set(node.id, node);
	}

	const visited = new Set<string>();
	const loopNode = nodeMap.get(loopNodeId);

	// Always include the loop node itself
	visited.add(loopNodeId);

	if (!loopNode || !loopNode.bodyStartNodeId) {
		return visited;
	}

	// BFS following nextNodeId and elseNodeId from body nodes (the loop
	// node's own nextNodeId -- the "After Last" path -- is never queued).
	const queue: string[] = [loopNode.bodyStartNodeId];

	while (queue.length > 0) {
		const current = queue.shift()!;
		if (visited.has(current)) continue;
		visited.add(current);

		const node = nodeMap.get(current);
		if (!node) continue;

		if (node.nextNodeId && !visited.has(node.nextNodeId)) {
			queue.push(node.nextNodeId);
		}
		if (node.elseNodeId && !visited.has(node.elseNodeId)) {
			queue.push(node.elseNodeId);
		}
	}

	return visited;
}

/**
 * Find the parent node that points to the given nodeId.
 * Returns the parent's ID and which pointer ("next", "else", or "body" --
 * a loop's bodyStartNodeId) points to nodeId.
 * Returns null/null if no parent found (root node case).
 */
export function findParent(
	nodeId: string,
	nodes: GraphNode[]
): { parentId: string | null; branch: "next" | "else" | "body" | null } {
	for (const node of nodes) {
		if (node.nextNodeId === nodeId) {
			return { parentId: node.id, branch: "next" };
		}
		if (node.elseNodeId === nodeId) {
			return { parentId: node.id, branch: "else" };
		}
		if (node.bodyStartNodeId === nodeId) {
			return { parentId: node.id, branch: "body" };
		}
	}

	return { parentId: null, branch: null };
}
