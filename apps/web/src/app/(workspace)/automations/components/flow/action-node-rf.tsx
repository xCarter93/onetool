"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

function getSummary(data: Record<string, unknown>): string {
	// Read from new config shape with fallback to legacy action
	const config = (data as Record<string, unknown>).config || (data as Record<string, unknown>).action;
	const action = config as
		| { targetType?: string; actionType?: string; newStatus?: string }
		| undefined;
	if (!action || !action.actionType) return "Configure action...";

	if ((action.actionType === "update_field" || action.actionType === "update_status") && action.newStatus) {
		const target = action.targetType ?? "self";
		return `Update ${target} \u2192 ${action.newStatus}`;
	}

	return action.actionType;
}

export const ActionNodeRF = memo(({ data, selected }: NodeProps) => {
	const summary = getSummary(data);

	return (
		<div
			className={cn(
				"px-4 py-3 rounded-xl border-2 min-w-[260px]",
				"bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800",
				selected && "ring-2 ring-green-400 dark:ring-green-500"
			)}
			aria-label={`Action: ${summary}`}
		>
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-border !w-2 !h-2 !border-0"
			/>
			<div className="flex items-center gap-3">
				<div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
					<Play className="h-4 w-4 text-green-600 dark:text-green-400" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-xs font-semibold uppercase text-green-600 dark:text-green-400">
						Update Record
					</div>
					<div className="text-sm font-semibold text-foreground truncate">
						{summary}
					</div>
				</div>
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-green-400 !w-2 !h-2 !border-0"
			/>
		</div>
	);
});
ActionNodeRF.displayName = "ActionNodeRF";
