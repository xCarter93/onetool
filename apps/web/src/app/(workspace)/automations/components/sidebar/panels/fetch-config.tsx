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
import type { FetchConfig } from "../../../lib/node-types";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";

const ENTITY_TYPES = [
	{ value: "client", label: "Client" },
	{ value: "project", label: "Project" },
	{ value: "quote", label: "Quote" },
	{ value: "invoice", label: "Invoice" },
	{ value: "task", label: "Task" },
] as const;

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

	const currentConfig =
		(node.config as FetchConfig | undefined) ||
		(node as unknown as { fetchConfig?: FetchConfig }).fetchConfig || {
			entityType: trigger?.objectType || "client",
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
					<Label className="text-sm font-medium">Entity type</Label>
					<Select
						value={currentConfig.entityType}
						onValueChange={(value) =>
							onNodeChange(nodeId, {
								config: {
									...currentConfig,
									entityType: value as FetchConfig["entityType"],
								},
							})
						}
					>
						<SelectTrigger className="mt-2">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ENTITY_TYPES.map((entity) => (
								<SelectItem key={entity.value} value={entity.value}>
									{entity.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="py-4">
					<div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
						Filter configuration coming in a future update.
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
