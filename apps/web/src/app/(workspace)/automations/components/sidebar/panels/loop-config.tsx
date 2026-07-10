"use client";

import React from "react";
import { Repeat } from "lucide-react";
import { NextStepTree } from "../next-step-tree";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	MAX_LOOP_ITERATIONS,
	OBJECT_TYPE_LABELS,
	type LoopNodeConfig,
	type WorkflowNode,
} from "../../../lib/node-types";
import { getUpstreamFetchNodes } from "../../../lib/variables";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";
import {
	DeleteStepButton,
	PanelField,
	PanelSection,
} from "./panel-primitives";

export function LoopConfigPanel({
	nodeId,
	nodes,
	onNodeChange,
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

	const workflowNodes = nodes.filter((n): n is WorkflowNode => n.type !== "placeholder");
	const upstreamFetchNodes = getUpstreamFetchNodes(workflowNodes, nodeId);
	const config: LoopNodeConfig = (node.config as LoopNodeConfig | undefined) ?? {
		kind: "loop",
		sourceNodeId: "",
	};

	const commit = (next: LoopNodeConfig) => {
		onNodeChange(nodeId, { config: next } as Partial<WorkflowNode>);
	};

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
				<PanelSection title="Inputs">
					{upstreamFetchNodes.length === 0 ? (
						<div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
							Add a Find records step before this loop.
						</div>
					) : (
						<>
							<PanelField label="Records to loop over">
								<Select
									value={config.sourceNodeId}
									onValueChange={(sourceNodeId) =>
										sourceNodeId && commit({ ...config, sourceNodeId })
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Choose a Find records step" />
									</SelectTrigger>
									<SelectContent>
										{upstreamFetchNodes.map((fetchNode) => (
											<SelectItem key={fetchNode.id} value={fetchNode.id}>
												Find records
												{fetchNode.objectType
													? ` — ${OBJECT_TYPE_LABELS[fetchNode.objectType]}`
													: ""}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</PanelField>

							<PanelField
								label="Max iterations"
								helper={`Optional cap on the number of records processed (up to ${MAX_LOOP_ITERATIONS}).`}
							>
								<Input
									type="number"
									min={1}
									max={MAX_LOOP_ITERATIONS}
									value={config.maxIterations ?? ""}
									placeholder="No cap"
									onChange={(e) =>
										commit({
											...config,
											maxIterations:
												e.target.value === ""
													? undefined
													: Math.min(
															MAX_LOOP_ITERATIONS,
															Math.max(
																1,
																Math.round(Number(e.target.value)) || 1
															)
														),
										})
									}
								/>
							</PanelField>
						</>
					)}
				</PanelSection>
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
