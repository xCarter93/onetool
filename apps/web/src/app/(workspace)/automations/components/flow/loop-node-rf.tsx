"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

export const LoopNodeRF = memo(({ selected }: NodeProps) => {
	const summary = "Loop over records";

	return (
		<div
			className={cn(
				"px-4 py-3 rounded-xl border-2 min-w-[260px]",
				"bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800",
				selected && "ring-2 ring-orange-400 dark:ring-orange-500"
			)}
			aria-label={`Loop: ${summary}`}
		>
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-border !w-2 !h-2 !border-0"
			/>
			<div className="flex items-center gap-3">
				<div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
					<Repeat className="h-4 w-4 text-orange-600 dark:text-orange-400" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-xs font-semibold uppercase text-orange-600 dark:text-orange-400">
						Loop
					</div>
					<div className="text-sm font-semibold text-foreground truncate">
						{summary}
					</div>
				</div>
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-orange-400 !w-2 !h-2 !border-0"
			/>
		</div>
	);
});
LoopNodeRF.displayName = "LoopNodeRF";
