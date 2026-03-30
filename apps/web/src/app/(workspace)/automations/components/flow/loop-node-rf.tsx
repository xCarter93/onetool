"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOOP_EACH_HANDLE_RATIO } from "../../lib/dagre-layout";

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

			{/* Loop-back target handle (left side) for iteration edge */}
			<Handle
				type="target"
				position={Position.Left}
				id="loopReturn"
				className="bg-orange-400! w-2! h-2! border-0!"
			/>

			{/* "For Each" source handle (bottom center) */}
			<Handle
				type="source"
				position={Position.Bottom}
				id="each"
				className="bg-orange-400! w-2.5! h-2.5! border-0!"
				style={{ left: `${LOOP_EACH_HANDLE_RATIO * 100}%` }}
			/>
			{/* "After Last" source handle (right side) */}
			<Handle
				type="source"
				position={Position.Right}
				id="after"
				className="bg-muted-foreground! w-2.5! h-2.5! border-0!"
			/>
		</div>
	);
});
LoopNodeRF.displayName = "LoopNodeRF";
