"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const FetchNodeRF = memo(({ selected }: NodeProps) => {
	const summary = "Fetch records";

	return (
		<div
			className={cn(
				"px-4 py-3 rounded-xl border-2 min-w-[260px]",
				"bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
				selected && "ring-2 ring-blue-400 dark:ring-blue-500"
			)}
			aria-label={`Fetch: ${summary}`}
		>
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-border !w-2 !h-2 !border-0"
			/>
			<div className="flex items-center gap-3">
				<div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
					<Search className="h-4 w-4 text-blue-600 dark:text-blue-400" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-400">
						Fetch
					</div>
					<div className="text-sm font-semibold text-foreground truncate">
						{summary}
					</div>
				</div>
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-blue-400 !w-2 !h-2 !border-0"
			/>
		</div>
	);
});
FetchNodeRF.displayName = "FetchNodeRF";
