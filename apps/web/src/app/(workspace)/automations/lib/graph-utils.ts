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
	/** Condition continuation ("after the branches converge"). */
	mergeNodeId?: string;
};

/**
 * Collect all node IDs in the subtree rooted at startNodeId.
 * Follows nextNodeId, elseNodeId, and mergeNodeId pointers via BFS.
 * Always includes startNodeId itself, even if not found in the nodes array.
 *
 * `excludeRootMerge` stops at the ROOT's merge continuation — the steps after
 * its branches converge are downstream of the condition, not part of it (the
 * same reason collectLoopBody never walks a loop's own After-Last path).
 * Descendants' merge chains still belong to the subtree and are collected.
 */
export function collectSubtree(
	startNodeId: string,
	nodes: GraphNode[],
	options?: { excludeRootMerge?: boolean }
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
		if (
			node.mergeNodeId &&
			!visited.has(node.mergeNodeId) &&
			!(options?.excludeRootMerge && current === startNodeId)
		) {
			queue.push(node.mergeNodeId);
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

	// BFS following nextNodeId, elseNodeId, and mergeNodeId from body nodes
	// (the loop node's own nextNodeId -- the "After Last" path -- is never
	// queued).
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
		if (node.mergeNodeId && !visited.has(node.mergeNodeId)) {
			queue.push(node.mergeNodeId);
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
): {
	parentId: string | null;
	branch: "next" | "else" | "body" | "merge" | null;
} {
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
		if (node.mergeNodeId === nodeId) {
			return { parentId: node.id, branch: "merge" };
		}
	}

	return { parentId: null, branch: null };
}
