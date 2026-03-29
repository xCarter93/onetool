import type { WorkflowNode } from "../components/workflow-node";

/**
 * Collect all node IDs in the subtree rooted at startNodeId.
 * Follows both nextNodeId and elseNodeId pointers via BFS.
 * Always includes startNodeId itself, even if not found in the nodes array.
 */
export function collectSubtree(
	startNodeId: string,
	nodes: WorkflowNode[]
): Set<string> {
	const nodeMap = new Map<string, WorkflowNode>();
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
 * Only follows nextNodeId (the body path), NOT elseNodeId (the "After Last" path).
 * Always includes the loop node itself.
 */
export function collectLoopBody(
	loopNodeId: string,
	nodes: WorkflowNode[]
): Set<string> {
	const nodeMap = new Map<string, WorkflowNode>();
	for (const node of nodes) {
		nodeMap.set(node.id, node);
	}

	const visited = new Set<string>();
	const loopNode = nodeMap.get(loopNodeId);

	// Always include the loop node itself
	visited.add(loopNodeId);

	if (!loopNode || !loopNode.nextNodeId) {
		return visited;
	}

	// BFS only following nextNodeId and elseNodeId from body nodes
	// (but NOT the loop node's elseNodeId which is the "After Last" path)
	const queue: string[] = [loopNode.nextNodeId];

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
 * Returns the parent's ID and which branch ("next" or "else") points to nodeId.
 * Returns null/null if no parent found (root node case).
 */
export function findParent(
	nodeId: string,
	nodes: WorkflowNode[]
): { parentId: string | null; branch: "next" | "else" | null } {
	for (const node of nodes) {
		if (node.nextNodeId === nodeId) {
			return { parentId: node.id, branch: "next" };
		}
		if (node.elseNodeId === nodeId) {
			return { parentId: node.id, branch: "else" };
		}
	}

	return { parentId: null, branch: null };
}
