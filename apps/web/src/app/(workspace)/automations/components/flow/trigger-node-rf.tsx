"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";

function getSummary(data: Record<string, unknown>): {
	title: string;
	description: string;
} {
	const trigger = data.trigger as
		| {
				type?: string;
				objectType?: string;
				toStatus?: string;
				fromStatus?: string;
				field?: string;
				schedule?: { frequency?: string };
		  }
		| undefined;
	if (!trigger) return { title: "Configure trigger", description: "Select a trigger type..." };

	const objectLabel = trigger.objectType
		? trigger.objectType.charAt(0).toUpperCase() + trigger.objectType.slice(1)
		: "";
	const triggerType = trigger.type || "status_changed";

	switch (triggerType) {
		case "status_changed": {
			const title = "Status Changed";
			if (trigger.fromStatus && trigger.toStatus)
				return { title, description: `${objectLabel} ${trigger.fromStatus} \u2192 ${trigger.toStatus}` };
			if (trigger.toStatus)
				return { title, description: `${objectLabel} \u2192 ${trigger.toStatus}` };
			return { title, description: objectLabel || "Configure trigger..." };
		}
		case "record_created":
			return { title: "Record Created", description: `${objectLabel} created` };
		case "record_updated":
			return {
				title: "Record Updated",
				description: trigger.field
					? `${objectLabel}.${trigger.field} changes`
					: `${objectLabel} updated`,
			};
		case "email_received":
			return { title: "Email Received", description: "Incoming email triggers flow" };
		case "scheduled":
			return { title: "Scheduled", description: `Runs ${trigger.schedule?.frequency || "daily"}` };
		default:
			return { title: triggerType, description: objectLabel || "Configure trigger..." };
	}
}

export const TriggerNodeRF = memo(({ data, selected }: NodeProps) => {
	const { title, description } = getSummary(data);

	return (
		<div className="relative mt-4">
			<span className="absolute -top-2.5 left-3 bg-background px-2 text-[10px] font-semibold uppercase tracking-wider text-amber-600 z-10">
				Trigger
			</span>
			<BaseNode
				className={cn(
					"w-[280px] border-amber-200 shadow-sm",
					"hover:border-primary/30 transition-colors",
					selected && "ring-2 ring-primary/50",
				)}
				aria-label={`Trigger: ${title} - ${description}`}
			>
				<BaseNodeContent className="p-3">
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
							<Zap className="h-4 w-4" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="text-sm font-semibold truncate">{title}</div>
							<div className="text-xs text-muted-foreground truncate">{description}</div>
						</div>
						<span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
							Triggers
						</span>
					</div>
				</BaseNodeContent>
				<BaseHandle type="source" position={Position.Bottom} />
			</BaseNode>
		</div>
	);
});
TriggerNodeRF.displayName = "TriggerNodeRF";
