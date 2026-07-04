"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import type { DelayNodeConfig } from "../../lib/node-types";

function singularize(unit: DelayNodeConfig["unit"], amount: number): string {
	return amount === 1 ? unit.slice(0, -1) : unit;
}

function getSummary(config: DelayNodeConfig | undefined): {
	title: string;
	description: string;
	isConfigured: boolean;
} {
	if (!config || !config.amount) {
		return { title: "Configure delay", description: "Set a wait duration...", isConfigured: false };
	}
	return {
		title: `Wait ${config.amount} ${singularize(config.unit, config.amount)}`,
		description: `Pauses the workflow for ${config.amount} ${singularize(config.unit, config.amount)}`,
		isConfigured: true,
	};
}

export const DelayNodeRF = memo(({ data, selected }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as DelayNodeConfig | undefined;
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
			aria-label={`Delay: ${title} - ${description}`}
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
						<Timer className="h-4 w-4" />
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
			<BaseHandle type="source" position={Position.Bottom} />
		</BaseNode>
	);
});
DelayNodeRF.displayName = "DelayNodeRF";
