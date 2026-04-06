"use client";

import React from "react";
import { Trash2, Repeat } from "lucide-react";
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

export function LoopConfigPanel({
	nodeId,
	trigger,
	nodes,
	onNodeChange,
	onDeleteNode,
}: ConfigPanelProps) {
	const node = nodeId ? nodes.find((item) => item.id === nodeId) : undefined;

	if (!nodeId || !node || node.type !== "loop") {
		return (
			<div className="text-sm text-muted-foreground">
				This loop step could not be found.
			</div>
		);
	}

	const currentConfig = (node.config as FetchConfig | undefined) || {
		entityType: trigger?.objectType || "client",
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
				<div className="border-b border-border py-4">
					<Label className="text-sm font-medium">Loop source</Label>
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
						Loop configuration coming in a future update.
					</div>
				</div>
			</div>

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
