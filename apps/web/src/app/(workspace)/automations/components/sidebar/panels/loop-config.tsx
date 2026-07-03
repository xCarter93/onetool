"use client";

import React from "react";
import { Trash2, Repeat } from "lucide-react";
import { NextStepTree } from "../next-step-tree";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";

export function LoopConfigPanel({
	nodeId,
	nodes,
	onDeleteNode,
	onNavigateToNode,
	rfNodes,
	rfEdges,
}: ConfigPanelProps) {
	const node = nodeId ? nodes.find((item) => item.id === nodeId) : undefined;

	if (!nodeId || !node || node.type !== "loop") {
		return (
			<div className="text-sm text-muted-foreground">
				This loop step could not be found.
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={Repeat}
				iconBgColor="bg-orange-50 dark:bg-orange-950/40"
				iconFgColor="text-orange-600 dark:text-orange-400"
				categoryBadge="Utilities"
				nodeTypeName="Loop"
			/>

			<div className="flex-1">
				<div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
					Loops are arriving in an upcoming update. This step won&apos;t be
					saveable until then.
				</div>
			</div>

			{/* Next steps tree */}
			{nodeId && rfNodes && rfEdges && onNavigateToNode && (
				<div className="border-t border-border pt-4 mt-2">
					<NextStepTree
						currentNodeId={nodeId}
						nodes={rfNodes}
						edges={rfEdges}
						onNavigateToNode={onNavigateToNode}
					/>
				</div>
			)}

			{/* Delete button */}
			{onDeleteNode && (
				<div className="pt-4 border-t border-border mt-2">
					<button
						type="button"
						className="text-destructive hover:bg-destructive/10 flex items-center gap-2 px-3 py-2 rounded-md transition-colors w-full"
						onClick={() => onDeleteNode(nodeId)}
						aria-label="Delete step"
					>
						<Trash2 className="h-4 w-4" />
						<span className="text-sm font-medium">Delete Node</span>
					</button>
				</div>
			)}
		</div>
	);
}
