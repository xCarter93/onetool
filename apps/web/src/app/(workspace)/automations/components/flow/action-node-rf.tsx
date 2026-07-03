"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import { OBJECT_TYPE_LABELS, type ActionNodeConfig } from "../../lib/node-types";

function getSummary(config: ActionNodeConfig | undefined): {
	title: string;
	description: string;
	isConfigured: boolean;
} {
	if (!config) {
		return { title: "Configure action", description: "Select an action type...", isConfigured: false };
	}

	const action = config.action;
	const targetLabel =
		action.type === "update_field"
			? action.target === "self"
				? "this record"
				: OBJECT_TYPE_LABELS[action.target.related]
			: undefined;

	switch (action.type) {
		case "update_field": {
			if (!action.field) {
				return { title: "Update Record", description: "Choose a field...", isConfigured: false };
			}
			const value = action.value.kind === "static" ? action.value.value : "...";
			return {
				title: `Update ${action.field}`,
				description: `on ${targetLabel} → ${value ?? "..."}`,
				isConfigured: true,
			};
		}
		case "send_notification":
			return {
				title: "Send Notification",
				description: "Available soon — this step won't run yet",
				isConfigured: false,
			};
		case "create_task":
			return {
				title: "Create Task",
				description: "Available soon — this step won't run yet",
				isConfigured: false,
			};
		case "send_team_message":
			return {
				title: "Send Team Message",
				description: "Available soon — this step won't run yet",
				isConfigured: false,
			};
		default:
			return { title: "Configure action", description: "Select an action type...", isConfigured: false };
	}
}

export const ActionNodeRF = memo(({ data, selected }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as ActionNodeConfig | undefined;
	const { title, description, isConfigured } = getSummary(config);

	return (
		<BaseNode
			className={cn(
				"w-[280px]",
				isConfigured
					? "border-border shadow-sm"
					: "border-dashed border-muted-foreground/30",
				"hover:border-primary/30 transition-colors",
				selected && "ring-2 ring-primary/50",
			)}
			aria-label={`Action: ${title} - ${description}`}
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
						<Play className="h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-semibold truncate">{title}</div>
						<div className="text-xs text-muted-foreground truncate">
							{description}
						</div>
					</div>
					<span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
						Actions
					</span>
				</div>
			</BaseNodeContent>
			<BaseHandle type="source" position={Position.Bottom} />
		</BaseNode>
	);
});
ActionNodeRF.displayName = "ActionNodeRF";
