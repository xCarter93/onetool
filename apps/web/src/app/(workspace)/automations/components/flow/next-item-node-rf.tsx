"use client";

import { memo } from "react";
import { Position } from "@xyflow/react";
import { SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";

export const NextItemNodeRF = memo(() => {
	return (
		<BaseNode
			className={cn(
				"w-[280px] border-l-4 border-l-muted-foreground/40",
			)}
			aria-label="Next item: skips to the loop's next record"
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
						<SkipForward className="h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-semibold truncate">Next item</div>
						<div className="text-xs text-muted-foreground truncate">
							Skips to the loop&apos;s next record
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
NextItemNodeRF.displayName = "NextItemNodeRF";
