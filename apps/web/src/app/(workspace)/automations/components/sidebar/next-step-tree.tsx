"use client";

import React from "react";
import {
	Zap,
	GitBranch,
	Play,
	Database,
	Repeat,
	CircleStop,
	Circle,
	type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Node, Edge } from "@xyflow/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NextStepTreeProps {
	currentNodeId: string;
	nodes: Node[];
	edges: Edge[];
	onNavigateToNode: (nodeId: string) => void;
}

interface TreeItem {
	id: string;
	nodeType: string;
	label: string;
	depth: number;
}

// ---------------------------------------------------------------------------
// Node type visual mapping
// ---------------------------------------------------------------------------

const NODE_TYPE_MAP: Record<
	string,
	{ icon: LucideIcon; color: string }
> = {
	trigger: {
		icon: Zap,
		color: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
	},
	condition: {
		icon: GitBranch,
		color: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
	},
	action: {
		icon: Play,
		color: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
	},
	fetch_records: {
		icon: Database,
		color: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
	},
	loop: {
		icon: Repeat,
		color: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400",
	},
	end: {
		icon: CircleStop,
		color: "bg-muted text-muted-foreground",
	},
};

const DEFAULT_NODE_VISUAL = {
	icon: Circle,
	color: "bg-muted text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Tree builder -- walks edges to collect downstream nodes
// ---------------------------------------------------------------------------

function buildDownstreamTree(
	currentNodeId: string,
	nodes: Node[],
	edges: Edge[],
	maxDepth: number = 10
): TreeItem[] {
	const items: TreeItem[] = [];
	const visited = new Set<string>();

	function walk(nodeId: string, depth: number) {
		if (depth > maxDepth || visited.has(nodeId)) return;
		visited.add(nodeId);

		// Find outgoing edges from this node
		const outgoing = edges.filter((e) => e.source === nodeId);

		for (const edge of outgoing) {
			const targetId = edge.target;
			// Skip terminal stub nodes
			if (targetId.startsWith("__terminal__")) continue;
			// Skip placeholder nodes
			if (targetId.startsWith("placeholder_")) continue;

			const targetNode = nodes.find((n) => n.id === targetId);
			if (!targetNode) continue;

			const nodeType =
				(targetNode.data as Record<string, unknown>)?.nodeType as
					| string
					| undefined;
			const label = getNodeLabel(targetNode, nodeType);

			items.push({
				id: targetId,
				nodeType: nodeType || "unknown",
				label,
				depth,
			});

			walk(targetId, depth + 1);
		}
	}

	walk(currentNodeId, 0);
	return items;
}

function getNodeLabel(node: Node, nodeType?: string): string {
	const data = node.data as Record<string, unknown>;

	switch (nodeType) {
		case "trigger":
			return "Trigger";
		case "condition":
			return "Condition";
		case "action":
			return "Update Record";
		case "fetch_records":
			return "Fetch Records";
		case "loop":
			return "Loop";
		case "end":
			return "End";
		default:
			return (data?.label as string) || "Step";
	}
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NextStepTree({
	currentNodeId,
	nodes,
	edges,
	onNavigateToNode,
}: NextStepTreeProps) {
	const treeItems = buildDownstreamTree(currentNodeId, nodes, edges);

	if (treeItems.length === 0) {
		return null;
	}

	return (
		<div>
			<div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
				Next steps
			</div>
			<div className="space-y-0.5">
				{treeItems.map((item, index) => {
					const visual =
						NODE_TYPE_MAP[item.nodeType] || DEFAULT_NODE_VISUAL;
					const NodeIcon = visual.icon;

					return (
						<button
							key={`${item.id}-${index}`}
							type="button"
							onClick={() => onNavigateToNode(item.id)}
							className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-left"
							style={{ paddingLeft: `${item.depth * 16 + 8}px` }}
						>
							<div
								className={cn(
									"w-5 h-5 rounded flex items-center justify-center shrink-0",
									visual.color
								)}
							>
								<NodeIcon className="h-3 w-3" />
							</div>
							<span className="text-sm truncate">
								{item.label}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
