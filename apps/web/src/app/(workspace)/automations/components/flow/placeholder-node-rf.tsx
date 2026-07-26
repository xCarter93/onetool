"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import type { PlaceholderRFNode } from "../../lib/node-types";

export const PlaceholderNodeRF = memo(
	(_props: NodeProps<PlaceholderRFNode>) => {
		return (
			<BaseNode
				className={cn(
					"w-[280px] border-dashed border-muted-foreground/30",
				)}
				role="button"
				aria-label="Empty step — click to configure"
				onKeyDown={(e) => {
					// BaseNode is a focusable div — without this the card is reachable
					// by keyboard but not activatable. The synthetic click bubbles to
					// React Flow's node wrapper and triggers the same onNodeClick path.
					if (e.key !== "Enter" && e.key !== " ") return;
					e.preventDefault();
					e.stopPropagation();
					e.currentTarget.click();
				}}
			>
				<BaseHandle type="target" position={Position.Top} />
				<BaseNodeContent className="p-3">
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
							<Plus className="h-4 w-4 text-muted-foreground" />
						</div>
						<span className="text-sm text-muted-foreground">
							Choose a step
						</span>
					</div>
				</BaseNodeContent>
				<BaseHandle type="source" position={Position.Bottom} className="opacity-0!" />
			</BaseNode>
		);
	},
);
PlaceholderNodeRF.displayName = "PlaceholderNodeRF";
