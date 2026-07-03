"use client";

import React from "react";
import { Repeat } from "lucide-react";
import { NextStepTree } from "../next-step-tree";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";
import { DeleteStepButton } from "./panel-primitives";

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
				<div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
					Loops are arriving in an upcoming update. Remove this step to save
					your workflow.
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

			{onDeleteNode && (
				<DeleteStepButton onDelete={() => onDeleteNode(nodeId)} />
			)}
		</div>
	);
}
