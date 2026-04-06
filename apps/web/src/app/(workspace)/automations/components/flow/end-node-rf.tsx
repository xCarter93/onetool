"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { CircleStop } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";

export const EndNodeRF = memo(({ selected }: NodeProps) => {
	return (
		<BaseNode
			className={cn(
				"w-[280px] border-border shadow-sm",
				"hover:border-primary/30 transition-colors",
				selected && "ring-2 ring-primary/50",
			)}
			aria-label="End: Workflow stops here"
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
						<CircleStop className="h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-semibold truncate">End</div>
						<div className="text-xs text-muted-foreground truncate">
							Workflow stops here
						</div>
					</div>
					<span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
						Flow
					</span>
				</div>
			</BaseNodeContent>
		</BaseNode>
	);
});
EndNodeRF.displayName = "EndNodeRF";
