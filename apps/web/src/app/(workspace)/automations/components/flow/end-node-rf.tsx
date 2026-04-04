"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Square } from "lucide-react";
import { cn } from "@/lib/utils";

export const EndNodeRF = memo(({ selected }: NodeProps) => {
	return (
		<div
			className={cn(
				"px-4 py-3 rounded-xl border-2 min-w-[260px]",
				"bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800",
				selected && "ring-2 ring-red-400 dark:ring-red-500"
			)}
			aria-label="End Automation"
		>
			<Handle
				type="target"
				position={Position.Top}
				className="bg-border! w-2! h-2! border-0!"
			/>
			<div className="flex items-center gap-3">
				<div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
					<Square className="h-4 w-4 text-red-600 dark:text-red-400 fill-red-600 dark:fill-red-400" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-xs font-semibold uppercase text-red-600 dark:text-red-400">
						End
					</div>
					<div className="text-sm font-semibold text-foreground truncate">
						Flow stops here
					</div>
				</div>
			</div>
			{/* No source handles — nothing exits an End node */}
		</div>
	);
});
EndNodeRF.displayName = "EndNodeRF";
