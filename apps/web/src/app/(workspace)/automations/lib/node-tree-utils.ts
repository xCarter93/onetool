import type { WorkflowNode } from "../components/workflow-node";

/**
 * GraphNode represents a node in the tree structure used for rendering.
 * This is different from WorkflowNode which is the flat database format.
 */
export type GraphNode = {
	id: string;
	type: "condition" | "action";
	config: WorkflowNode["condition"] | WorkflowNode["action"];
	// For sequential flow and condition true branch
	next?: GraphNode;
	// For condition true branch (explicitly named)
	trueBranch?: GraphNode;
	// For condition false branch
	falseBranch?: GraphNode;
};

/**
 * Builds a tree structure from a flat array of workflow nodes.
 *
 * @param nodes - Flat array of WorkflowNode from database
 * @returns Root GraphNode of the tree, or null if no nodes or invalid structure
 */
export function buildNodeTree(nodes: WorkflowNode[]): GraphNode | null {
	if (nodes.length === 0) return null;

	// Create a map for quick lookup
	const nodeMap = new Map<string, WorkflowNode>();
	for (const node of nodes) {
		nodeMap.set(node.id, node);
	}

	// Find the root node (not referenced by any other node's nextNodeId or elseNodeId)
	const referencedIds = new Set<string>();
	for (const node of nodes) {
		if (node.nextNodeId) {
			referencedIds.add(node.nextNodeId);
		}
		if (node.elseNodeId) {
			referencedIds.add(node.elseNodeId);
		}
	}

	const rootNode = nodes.find((n) => !referencedIds.has(n.id));
	if (!rootNode) {
		console.warn("buildNodeTree: No root node found in workflow");
		return null;
	}

	// Recursively build the tree
	const visited = new Set<string>();

	function buildNode(nodeId: string): GraphNode | undefined {
		if (visited.has(nodeId)) {
			console.warn(`buildNodeTree: Circular reference detected at node ${nodeId}`);
			return undefined;
		}

		const node = nodeMap.get(nodeId);
		if (!node) {
			console.warn(`buildNodeTree: Node ${nodeId} not found in map`);
			return undefined;
		}

		visited.add(nodeId);

		const graphNode: GraphNode = {
			id: node.id,
			type: node.type,
			config: node.type === "condition" ? node.condition : node.action,
		};

		// For conditions: nextNodeId is true branch, elseNodeId is false branch
		if (node.type === "condition") {
			if (node.nextNodeId) {
				const trueBranch = buildNode(node.nextNodeId);
				if (trueBranch) {
					graphNode.trueBranch = trueBranch;
					graphNode.next = trueBranch; // Alias for consistency
				}
			}
			if (node.elseNodeId) {
				const falseBranch = buildNode(node.elseNodeId);
				if (falseBranch) {
					graphNode.falseBranch = falseBranch;
				}
			}
		} else {
			// For actions: nextNodeId is the next sequential node
			if (node.nextNodeId) {
				const nextNode = buildNode(node.nextNodeId);
				if (nextNode) {
					graphNode.next = nextNode;
				}
			}
		}

		return graphNode;
	}

	return buildNode(rootNode.id) || null;
}

/**
 * Flattens a tree structure into a flat array suitable for database storage.
 *
 * @param root - Root GraphNode of the tree
 * @returns Flat array of WorkflowNode with nextNodeId and elseNodeId references
 */
export function flattenNodeTree(root: GraphNode | null): WorkflowNode[] {
	if (!root) return [];

	const nodes: WorkflowNode[] = [];
	const visited = new Set<string>();

	function traverse(node: GraphNode) {
		if (visited.has(node.id)) {
			console.warn(`flattenNodeTree: Circular reference detected at node ${node.id}`);
			return;
		}

		visited.add(node.id);

		// Create the flat node
		const flatNode: WorkflowNode = {
			id: node.id,
			type: node.type,
			condition: node.type === "condition" ? (node.config as WorkflowNode["condition"]) : undefined,
			action: node.type === "action" ? (node.config as WorkflowNode["action"]) : undefined,
			nextNodeId: undefined,
			elseNodeId: undefined,
		};

		// Set nextNodeId and elseNodeId based on node type
		if (node.type === "condition") {
			// For conditions: nextNodeId = true branch, elseNodeId = false branch
			if (node.trueBranch) {
				flatNode.nextNodeId = node.trueBranch.id;
			} else if (node.next) {
				flatNode.nextNodeId = node.next.id;
			}
			if (node.falseBranch) {
				flatNode.elseNodeId = node.falseBranch.id;
			}
		} else {
			// For actions: nextNodeId = next sequential node
			if (node.next) {
				flatNode.nextNodeId = node.next.id;
			}
		}

		nodes.push(flatNode);

		// Traverse children
		if (node.next) {
			traverse(node.next);
		}
		if (node.trueBranch && node.trueBranch !== node.next) {
			traverse(node.trueBranch);
		}
		if (node.falseBranch) {
			traverse(node.falseBranch);
		}
	}

	traverse(root);
	return nodes;
}

/**
 * Validates that a tree structure has no cycles and all nodes are reachable.
 *
 * @param root - Root GraphNode to validate
 * @returns Object with isValid flag and optional error message
 */
export function validateTreeStructure(root: GraphNode | null): {
	isValid: boolean;
	error?: string;
} {
	if (!root) {
		return { isValid: true }; // Empty tree is valid
	}

	const visited = new Set<string>();
	const path = new Set<string>();

	function detectCycle(node: GraphNode): string | null {
		if (path.has(node.id)) {
			return `Circular reference detected at node ${node.id}`;
		}

		if (visited.has(node.id)) {
			return null; // Already validated this branch
		}

		visited.add(node.id);
		path.add(node.id);

		// Check all branches
		const branches = [node.next, node.trueBranch, node.falseBranch].filter(
			(n): n is GraphNode => n !== undefined
		);

		for (const branch of branches) {
			const error = detectCycle(branch);
			if (error) return error;
		}

		path.delete(node.id);
		return null;
	}

	const error = detectCycle(root);
	if (error) {
		return { isValid: false, error };
	}

	return { isValid: true };
}

/**
 * Validates that a flat array has proper linking and no orphaned nodes.
 *
 * @param nodes - Flat array of WorkflowNode to validate
 * @returns Object with isValid flag and optional error message
 */
export function validateFlatArray(nodes: WorkflowNode[]): {
	isValid: boolean;
	error?: string;
} {
	if (nodes.length === 0) {
		return { isValid: true }; // Empty array is valid
	}

	// Check all referenced IDs exist
	const nodeIds = new Set(nodes.map((n) => n.id));
	for (const node of nodes) {
		if (node.nextNodeId && !nodeIds.has(node.nextNodeId)) {
			return {
				isValid: false,
				error: `Node ${node.id} references non-existent nextNodeId: ${node.nextNodeId}`,
			};
		}
		if (node.elseNodeId && !nodeIds.has(node.elseNodeId)) {
			return {
				isValid: false,
				error: `Node ${node.id} references non-existent elseNodeId: ${node.elseNodeId}`,
			};
		}
	}

	// Find root node
	const referencedIds = new Set<string>();
	for (const node of nodes) {
		if (node.nextNodeId) {
			referencedIds.add(node.nextNodeId);
		}
		if (node.elseNodeId) {
			referencedIds.add(node.elseNodeId);
		}
	}

	const rootNodes = nodes.filter((n) => !referencedIds.has(n.id));
	if (rootNodes.length === 0) {
		return {
			isValid: false,
			error: "No root node found (all nodes are referenced by other nodes - circular reference)",
		};
	}
	if (rootNodes.length > 1) {
		return {
			isValid: false,
			error: `Multiple root nodes found: ${rootNodes.map((n) => n.id).join(", ")}`,
		};
	}

	// Check for reachability
	const reachable = new Set<string>();
	const visited = new Set<string>();

	function traverse(nodeId: string) {
		if (visited.has(nodeId)) return;
		visited.add(nodeId);
		reachable.add(nodeId);

		const node = nodes.find((n) => n.id === nodeId);
		if (!node) return;

		if (node.nextNodeId) {
			traverse(node.nextNodeId);
		}
		if (node.elseNodeId) {
			traverse(node.elseNodeId);
		}
	}

	traverse(rootNodes[0].id);

	const unreachable = nodes.filter((n) => !reachable.has(n.id));
	if (unreachable.length > 0) {
		return {
			isValid: false,
			error: `Orphaned nodes found (not reachable from root): ${unreachable.map((n) => n.id).join(", ")}`,
		};
	}

	return { isValid: true };
}
