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
				"rounded-xl border-2 min-w-[300px] overflow-hidden",
				"bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800",
				selected && "ring-2 ring-orange-400 dark:ring-orange-500"
			)}
			aria-label={`Loop: ${summary}`}
		>
			<Handle
				type="target"
				position={Position.Top}
				className="bg-border! w-2! h-2! border-0!"
			/>

			{/* Header */}
			<div className="px-4 py-3 flex items-center gap-3">
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

			{/* Branch labels */}
			<div className="flex border-t border-orange-200 dark:border-orange-800 divide-x divide-orange-200 dark:divide-orange-800">
				<div className="flex-1 py-1.5 text-center">
					<span className="text-xs font-semibold text-orange-500 dark:text-orange-400">
						For Each
					</span>
				</div>
				<div className="flex-1 py-1.5 text-center">
					<span className="text-xs font-semibold text-muted-foreground">
						After Last
					</span>
				</div>
			</div>

			{/* Loop-back target handle (right side) for iteration edge */}
			<Handle
				type="target"
				position={Position.Right}
				id="loopReturn"
				className="bg-orange-400! w-2! h-2! border-0!"
			/>

			{/* Dual source handles: "each" (left) and "after" (right) */}
			<Handle
				type="source"
				position={Position.Bottom}
				id="each"
				className="bg-orange-400! w-2! h-2! border-0!"
				style={{ left: "25%" }}
			/>
			<Handle
				type="source"
				position={Position.Bottom}
				id="after"
				className="bg-muted-foreground! w-2! h-2! border-0!"
				style={{ left: "75%" }}
			/>
		</div>
	);
});
LoopNodeRF.displayName = "LoopNodeRF";
