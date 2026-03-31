"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaceholderRFNode } from "../../lib/node-types";

export const PlaceholderNodeRF = memo(({ selected }: NodeProps<PlaceholderRFNode>) => {
	return (
		<div
			className={cn(
				"px-4 py-3 rounded-xl border-2 border-dashed min-w-[200px]",
				"border-muted-foreground/40 dark:border-muted-foreground/30",
				"bg-muted/30 dark:bg-muted/10",
				selected && "ring-2 ring-muted-foreground/50"
			)}
			aria-label="Empty step -- click to configure"
		>
			<Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-muted-foreground/40" />
			<div className="flex items-center gap-3">
				<div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
					<Plus className="h-5 w-5 text-muted-foreground" />
				</div>
				<span className="text-sm text-muted-foreground">Choose a step</span>
			</div>
			<Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-muted-foreground/40" />
		</div>
	);
});
PlaceholderNodeRF.displayName = "PlaceholderNodeRF";
