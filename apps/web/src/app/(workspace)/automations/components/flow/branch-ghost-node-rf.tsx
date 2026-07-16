"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import type { BranchGhostRFNode } from "../../lib/node-types";

/**
 * Ghost "Choose a step" card in an empty condition branch or loop body —
 * visually identical to a transient placeholder so lanes read the same
 * whether or not an insert has started. Clicking inserts a placeholder via
 * the incoming branch edge (same flow as the "+" buttons).
 */
export const BranchGhostNodeRF = memo(({ data }: NodeProps<BranchGhostRFNode>) => {
	return (
		<BaseNode
			className="w-[280px] cursor-pointer border-dashed border-muted-foreground/30 hover:border-primary/50"
			role="button"
			aria-label="Empty branch: add a step"
			onClick={(e) => {
				e.stopPropagation();
				data.onInsertNode?.(data.edgeId, "placeholder");
			}}
			onKeyDown={(e) => {
				// BaseNode is a focusable div — without this the card is reachable
				// by keyboard but not activatable.
				if (e.key !== "Enter" && e.key !== " ") return;
				e.preventDefault();
				e.stopPropagation();
				data.onInsertNode?.(data.edgeId, "placeholder");
			}}
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
						<Plus className="h-5 w-5 text-muted-foreground" />
					</div>
					<span className="text-sm text-muted-foreground">Choose a step</span>
				</div>
			</BaseNodeContent>
			<BaseHandle type="source" position={Position.Bottom} className="opacity-0!" />
		</BaseNode>
	);
});
BranchGhostNodeRF.displayName = "BranchGhostNodeRF";
