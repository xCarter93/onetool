"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

/**
 * Invisible terminal node — serves as the target for terminal "+" edges.
 * Renders only a tiny target handle so dagre can position it. The visible
 * interaction is the "+" button on the edge, not this node.
 */
export const TerminalNodeRF = memo((_props: NodeProps) => {
	return (
		<div className="w-1 h-1">
			<Handle
				type="target"
				position={Position.Top}
				className="bg-transparent! w-0! h-0! border-0!"
			/>
			<Handle
				type="source"
				position={Position.Bottom}
				className="bg-transparent! w-0! h-0! border-0!"
			/>
		</div>
	);
});
TerminalNodeRF.displayName = "TerminalNodeRF";
