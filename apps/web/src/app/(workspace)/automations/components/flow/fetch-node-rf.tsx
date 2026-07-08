"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import { OBJECT_TYPE_LABELS, type FetchNodeConfig } from "../../lib/node-types";

function getSummary(config: FetchNodeConfig | undefined): {
	title: string;
	description: string;
	isConfigured: boolean;
} {
	if (!config || !config.objectType) {
		return { title: "Fetch Records", description: "Configure data source...", isConfigured: false };
	}

	const entityLabel = OBJECT_TYPE_LABELS[config.objectType];
	const filterCount = config.filters?.reduce((sum, g) => sum + g.rules.length, 0) ?? 0;
	const description =
		filterCount > 0
			? `${entityLabel} with ${filterCount} filter${filterCount > 1 ? "s" : ""}`
			: entityLabel;

	return { title: `Fetch ${entityLabel}`, description, isConfigured: true };
}

export const FetchNodeRF = memo(({ data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as FetchNodeConfig | undefined;
	const { title, description, isConfigured } = getSummary(config);

	return (
		<BaseNode
			className={cn(
				"w-[280px]",
				isConfigured
					? "border-l-4 border-l-blue-500 dark:border-l-blue-400"
					: "border-dashed border-muted-foreground/30",
			)}
			aria-label={`Fetch: ${title} - ${description}`}
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300 flex items-center justify-center shrink-0">
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
