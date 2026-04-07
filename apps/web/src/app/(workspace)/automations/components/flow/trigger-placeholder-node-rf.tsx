"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";

export const TriggerPlaceholderNodeRF = memo(({ selected }: NodeProps) => {
	return (
		<div className="relative mt-4">
			<span className="absolute -top-2.5 left-3 bg-background px-2 text-[10px] font-semibold uppercase tracking-wider text-amber-400 z-10">
				Trigger
			</span>
			<BaseNode
				className={cn(
					"w-[280px] border-dashed border-amber-300/50",
					"cursor-pointer hover:border-amber-400 transition-colors",
					selected && "ring-2 ring-primary/50",
				)}
				aria-label="Trigger placeholder -- click to configure"
			>
				<BaseNodeContent className="p-3">
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 rounded-lg bg-amber-50/50 flex items-center justify-center shrink-0">
							<Zap className="h-4 w-4 text-amber-400" />
						</div>
						<span className="text-sm text-muted-foreground">
							Choose a trigger
						</span>
					</div>
				</BaseNodeContent>
			</BaseNode>
		</div>
	);
});
TriggerPlaceholderNodeRF.displayName = "TriggerPlaceholderNodeRF";
