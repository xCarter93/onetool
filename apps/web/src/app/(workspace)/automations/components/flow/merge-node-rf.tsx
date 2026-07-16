"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

/**
 * Invisible convergence point below a condition: both branch lanes reconverge
 * here before flow continues (merge chain, loop-back, or "+" stub). Purely a
 * routing anchor for edges — no visual, never serialized, never interactive.
 */
export const MergeNodeRF = memo(() => {
	return (
		<div aria-hidden className="h-px w-px">
			<Handle
				type="target"
				position={Position.Top}
				className="bg-transparent! w-0! h-0! min-w-0! min-h-0! border-0!"
			/>
			<Handle
				type="source"
				position={Position.Bottom}
				className="bg-transparent! w-0! h-0! min-w-0! min-h-0! border-0!"
			/>
		</div>
	);
});
MergeNodeRF.displayName = "MergeNodeRF";
