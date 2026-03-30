"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

function getSummary(data: Record<string, unknown>): string {
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
	if (!trigger) return "Configure trigger...";

	const objectLabel = trigger.objectType
		? trigger.objectType.charAt(0).toUpperCase() + trigger.objectType.slice(1)
		: "";
	const triggerType = trigger.type || "status_changed";

	switch (triggerType) {
		case "status_changed": {
			if (trigger.fromStatus && trigger.toStatus)
				return `${objectLabel} ${trigger.fromStatus} \u2192 ${trigger.toStatus}`;
			if (trigger.toStatus)
				return `${objectLabel} \u2192 ${trigger.toStatus}`;
			return objectLabel || "Configure trigger...";
		}
		case "record_created":
			return `${objectLabel} created`;
		case "record_updated":
			return trigger.field
				? `${objectLabel}.${trigger.field} changes`
				: `${objectLabel} updated`;
		case "email_received":
			return "Email received";
		case "scheduled":
			return `Runs ${trigger.schedule?.frequency || "daily"}`;
		default:
			return objectLabel || "Configure trigger...";
	}
}

export const TriggerNodeRF = memo(({ data, selected }: NodeProps) => {
	const summary = getSummary(data);

	return (
		<div
			className={cn(
				"px-4 py-3 rounded-xl border-2 min-w-[260px]",
				"bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
				selected && "ring-2 ring-amber-400 dark:ring-amber-500"
			)}
			aria-label={`Trigger: ${summary}`}
		>
			<div className="flex items-center gap-3">
				<div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
					<Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-xs font-semibold uppercase text-amber-600 dark:text-amber-400">
						Trigger
					</div>
					<div className="text-sm font-semibold text-foreground truncate">
						{summary}
					</div>
				</div>
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-amber-400 !w-2 !h-2 !border-0"
			/>
		</div>
	);
});
TriggerNodeRF.displayName = "TriggerNodeRF";
