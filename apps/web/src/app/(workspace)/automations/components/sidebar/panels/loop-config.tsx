"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
			<div className="flex-1 space-y-6">
				<div className="space-y-2">
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
						<SelectTrigger>
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

				<div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
					Loop configuration coming in a future update.
				</div>
			</div>

			{onDeleteNode && (
				<div className="pt-6 border-t border-border mt-6">
					<Button
						intent="destructive"
						className="w-full"
						onPress={() => onDeleteNode(nodeId)}
					>
						<Trash2 className="h-4 w-4 mr-2" />
						Delete Node
					</Button>
				</div>
			)}
		</div>
	);
}
