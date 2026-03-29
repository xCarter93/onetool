"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";

export const AddStepNodeRF = memo((_props: NodeProps) => {
	return (
		<div className="flex flex-col items-center">
			<Handle
				type="target"
				position={Position.Top}
				className="bg-border! w-2! h-2! border-0!"
			/>
			<div className="px-6 py-3 rounded-xl border-2 border-dashed border-muted-foreground/30 text-muted-foreground/50 flex items-center gap-2 min-w-[200px] justify-center">
				<Plus className="h-4 w-4" />
				<span className="text-sm font-medium">Add a step</span>
			</div>
		</div>
	);
});
AddStepNodeRF.displayName = "AddStepNodeRF";
