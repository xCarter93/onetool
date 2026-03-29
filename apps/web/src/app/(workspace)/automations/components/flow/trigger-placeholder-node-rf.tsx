"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";

/**
 * Dashed outline placeholder shown when no trigger is configured.
 * Clicking it opens the trigger sidebar.
 */
export const TriggerPlaceholderNodeRF = memo((_props: NodeProps) => {
	return (
		<div className="px-4 py-3 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 min-w-[260px] bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer hover:border-amber-400 dark:hover:border-amber-600 transition-colors">
			<div className="flex items-center gap-3">
				<div className="w-8 h-8 rounded-lg bg-amber-100/50 dark:bg-amber-900/30 flex items-center justify-center">
					<Zap className="h-4 w-4 text-amber-400 dark:text-amber-600" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-xs font-semibold uppercase text-amber-400 dark:text-amber-600">
						Trigger
					</div>
					<div className="text-sm font-medium text-muted-foreground">
						Click to set a trigger
					</div>
				</div>
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="bg-amber-300! w-2! h-2! border-0! opacity-50!"
			/>
		</div>
	);
});
TriggerPlaceholderNodeRF.displayName = "TriggerPlaceholderNodeRF";
