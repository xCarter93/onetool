"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import type { AdjustTimeNodeConfig } from "../../lib/node-types";

function singularize(unit: AdjustTimeNodeConfig["unit"], amount: number): string {
	return amount === 1 ? unit.slice(0, -1) : unit;
}

function getSummary(config: AdjustTimeNodeConfig | undefined): {
	title: string;
	description: string;
	isConfigured: boolean;
} {
	if (!config || !config.amount) {
		return { title: "Adjust time", description: "Not configured", isConfigured: false };
	}
	const verb = config.direction === "subtract" ? "Subtract" : "Add";
	const baseLabel = config.base.kind === "var" ? "a variable" : "the base time";
	return {
		title: "Adjust time",
		description: `${verb} ${config.amount} ${singularize(config.unit, config.amount)} ${config.direction === "subtract" ? "from" : "to"} ${baseLabel}`,
		isConfigured: true,
	};
}

export const AdjustTimeNodeRF = memo(({ data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as AdjustTimeNodeConfig | undefined;
	const { title, description, isConfigured } = getSummary(config);

	return (
		<BaseNode
			className={cn(
				"w-[280px]",
				isConfigured
					? "border-l-4 border-l-cyan-500 dark:border-l-cyan-400"
					: "border-dashed border-muted-foreground/30",
			)}
			aria-label={`Adjust time: ${title} - ${description}`}
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300 flex items-center justify-center shrink-0">
						<Clock3 className="h-4 w-4" />
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
AdjustTimeNodeRF.displayName = "AdjustTimeNodeRF";
