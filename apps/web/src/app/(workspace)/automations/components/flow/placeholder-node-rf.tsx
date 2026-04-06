"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import type { PlaceholderRFNode } from "../../lib/node-types";

export const PlaceholderNodeRF = memo(
	({ selected }: NodeProps<PlaceholderRFNode>) => {
		return (
			<BaseNode
				className={cn(
					"w-[280px] border-dashed border-muted-foreground/30",
					"hover:border-primary/30 transition-colors",
					selected && "ring-2 ring-primary/50",
				)}
				aria-label="Empty step -- click to configure"
			>
				<BaseHandle type="target" position={Position.Top} />
				<BaseNodeContent className="p-3">
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
							<Plus className="h-5 w-5 text-muted-foreground" />
						</div>
						<span className="text-sm text-muted-foreground">
							Choose a step
						</span>
					</div>
				</BaseNodeContent>
			</BaseNode>
		);
	},
);
PlaceholderNodeRF.displayName = "PlaceholderNodeRF";
