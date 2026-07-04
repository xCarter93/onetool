"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Sigma } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import type { AggregateNodeConfig, AggregateOperation } from "../../lib/node-types";

const OP_LABELS: Record<AggregateOperation, string> = {
	sum: "Sum",
	avg: "Average",
	min: "Minimum",
	max: "Maximum",
};

function getSummary(config: AggregateNodeConfig | undefined): {
	title: string;
	description: string;
	isConfigured: boolean;
} {
	if (!config || !config.sourceNodeId || !config.field) {
		return { title: "Aggregate", description: "Not configured", isConfigured: false };
	}
	return {
		title: "Aggregate",
		description: `${OP_LABELS[config.op]} of ${config.field} across found records`,
		isConfigured: true,
	};
}

export const AggregateNodeRF = memo(({ data, selected }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as AggregateNodeConfig | undefined;
	const { title, description, isConfigured } = getSummary(config);

	return (
		<BaseNode
			className={cn(
				"w-[280px]",
				isConfigured
					? "border-border shadow-sm"
					: "border-dashed border-muted-foreground/30",
				"hover:border-primary/30 transition-colors",
				selected && "ring-2 ring-primary/50",
			)}
			aria-label={`Aggregate: ${title} - ${description}`}
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
						<Sigma className="h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-semibold truncate">{title}</div>
						<div className="text-xs text-muted-foreground truncate">
							{description}
						</div>
					</div>
					<span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
						Utility
					</span>
				</div>
			</BaseNodeContent>
			<BaseHandle type="source" position={Position.Bottom} />
		</BaseNode>
	);
});
AggregateNodeRF.displayName = "AggregateNodeRF";
