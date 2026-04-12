"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";

function getSummary(data: Record<string, unknown>): {
	title: string;
	description: string;
	isConfigured: boolean;
} {
	const config = data.config as
		| {
				entityType?: string;
				filters?: Array<{ field: string; operator: string; value: unknown }>;
				limit?: number;
		  }
		| undefined;
	if (!config || !config.entityType)
		return { title: "Fetch Records", description: "Configure data source...", isConfigured: false };

	const entityLabel =
		config.entityType.charAt(0).toUpperCase() + config.entityType.slice(1);
	const filterCount = config.filters?.length ?? 0;
	const description =
		filterCount > 0
			? `${entityLabel} with ${filterCount} filter${filterCount > 1 ? "s" : ""}`
			: entityLabel;

	return { title: `Fetch ${entityLabel}`, description, isConfigured: true };
}

export const FetchNodeRF = memo(({ data, selected }: NodeProps) => {
	const { title, description, isConfigured } = getSummary(data);

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
			aria-label={`Fetch: ${title} - ${description}`}
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
						<Database className="h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-semibold truncate">{title}</div>
						<div className="text-xs text-muted-foreground truncate">
							{description}
						</div>
					</div>
					<span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
						Records
					</span>
				</div>
			</BaseNodeContent>
			<BaseHandle type="source" position={Position.Bottom} />
		</BaseNode>
	);
});
FetchNodeRF.displayName = "FetchNodeRF";
