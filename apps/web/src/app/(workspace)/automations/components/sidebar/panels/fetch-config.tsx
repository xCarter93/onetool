"use client";

import React from "react";
import { Trash2, Database } from "lucide-react";
import { NextStepTree } from "../next-step-tree";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DEFAULT_FETCH_LIMIT,
	MAX_FETCH_LIMIT,
	OBJECT_TYPE_OPTIONS,
	type AutomationObjectType,
	type FetchNodeConfig,
	type WorkflowNode,
} from "../../../lib/node-types";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";

export function FetchConfigPanel({
	nodeId,
	trigger,
	nodes,
	onNodeChange,
	onDeleteNode,
	onNavigateToNode,
	rfNodes,
	rfEdges,
}: ConfigPanelProps) {
	const node = nodeId ? nodes.find((item) => item.id === nodeId) : undefined;

	if (!nodeId || !node || node.type !== "fetch_records") {
		return (
			<div className="text-sm text-muted-foreground">
				This fetch step could not be found.
			</div>
		);
	}

	const currentConfig: FetchNodeConfig = (node.config as FetchNodeConfig | undefined) ?? {
		kind: "fetch_records",
		objectType: trigger?.objectType || "client",
		filters: [],
	};

	const commit = (next: FetchNodeConfig) => {
		onNodeChange(nodeId, { config: next } as Partial<WorkflowNode>);
	};

	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={Database}
				iconBgColor="bg-blue-50 dark:bg-blue-950/40"
				iconFgColor="text-blue-600 dark:text-blue-400"
				categoryBadge="Records"
				nodeTypeName="Fetch Records"
			/>

			<div className="flex-1">
				<div className="border-b border-border py-4">
					<Label className="text-sm font-medium">Object type</Label>
					<Select
						value={currentConfig.objectType}
						onValueChange={(value) =>
							commit({ ...currentConfig, objectType: value as AutomationObjectType })
						}
					>
						<SelectTrigger className="mt-2">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{OBJECT_TYPE_OPTIONS.map((entity) => (
								<SelectItem key={entity.value} value={entity.value}>
									{entity.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="border-b border-border py-4">
					<Label className="text-sm font-medium">Limit</Label>
					<input
						type="number"
						min={1}
						max={MAX_FETCH_LIMIT}
						className="mt-2 w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
						value={currentConfig.limit ?? DEFAULT_FETCH_LIMIT}
						onChange={(e) =>
							commit({
								...currentConfig,
								limit: e.target.value === "" ? undefined : Number(e.target.value),
							})
						}
					/>
				</div>

				<div className="py-4">
					<div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
						Filters coming soon.
					</div>
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
