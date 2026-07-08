"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import type { LoopNodeConfig } from "../../lib/node-types";

function getSummary(config: LoopNodeConfig | undefined): {
	title: string;
	description: string;
	isConfigured: boolean;
} {
	if (!config || !config.sourceNodeId) {
		return { title: "Loop", description: "Not available yet", isConfigured: false };
	}
	return {
		title: "Loop",
		description: `Iterate over records from "${config.sourceNodeId}"`,
		isConfigured: true,
	};
}

export const LoopNodeRF = memo(({ data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as LoopNodeConfig | undefined;
	const { title, description, isConfigured } = getSummary(config);

	return (
		<BaseNode
			className={cn(
				"w-[280px]",
				isConfigured
					? "border-l-4 border-l-orange-500 dark:border-l-orange-400"
					: "border-dashed border-muted-foreground/30",
			)}
			aria-label={`Loop: ${title} - ${description}`}
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300 flex items-center justify-center shrink-0">
						<Repeat className="h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-semibold truncate">{title}</div>
						<div className="text-xs text-muted-foreground truncate">
							{description}
						</div>
					</div>
					<span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
						Utilities
					</span>
				</div>
			</BaseNodeContent>
			{/* Loop-back target handle (left side) for iteration edge */}
			<BaseHandle type="target" position={Position.Left} id="loopReturn" />
			{/* "For Each" source handle (bottom) */}
			<BaseHandle type="source" position={Position.Bottom} id="each" />
			{/* "After Last" source handle (right side) */}
			<BaseHandle type="source" position={Position.Right} id="after" />
		</BaseNode>
	);
});
LoopNodeRF.displayName = "LoopNodeRF";
