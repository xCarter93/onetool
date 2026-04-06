"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";

function getSummary(data: Record<string, unknown>): {
	title: string;
	description: string;
	isConfigured: boolean;
} {
	const config =
		(data as Record<string, unknown>).config ||
		(data as Record<string, unknown>).action;
	const action = config as
		| {
				targetType?: string;
				actionType?: string;
				newStatus?: string;
				field?: string;
				value?: unknown;
				notificationRecipient?: string;
				createRecordType?: string;
		  }
		| undefined;
	if (!action || !action.actionType)
		return { title: "Configure action", description: "Select an action type...", isConfigured: false };

	const target = action.targetType ?? "self";
	const actionLabels: Record<string, string> = {
		update_status: "Update Status",
		update_field: "Update Field",
		send_notification: "Send Notification",
		create_record: "Create Record",
	};
	const title = actionLabels[action.actionType] ?? action.actionType;

	let description: string;
	if (
		(action.actionType === "update_field" ||
			action.actionType === "update_status") &&
		action.newStatus
	) {
		description = `${target} \u2192 ${action.newStatus}`;
	} else if (action.actionType === "send_notification") {
		description = action.notificationRecipient
			? `Notify ${action.notificationRecipient}`
			: "Configure recipient...";
	} else if (action.actionType === "create_record") {
		description = action.createRecordType
			? `Create ${action.createRecordType}`
			: "Configure record type...";
	} else {
		description = `Target: ${target}`;
	}

	return { title, description, isConfigured: true };
}

export const ActionNodeRF = memo(({ data, selected }: NodeProps) => {
	const { title, description, isConfigured } = getSummary(data);

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
