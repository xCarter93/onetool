"use client";

import { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import type { DelayUntilNodeConfig } from "../../lib/node-types";

function getSummary(config: DelayUntilNodeConfig | undefined): {
	title: string;
	description: string;
	isConfigured: boolean;
} {
	const until = config?.until;
	if (!until || (until.kind === "static" && (until.value === null || until.value === ""))) {
		return { title: "Wait until a date", description: "Choose a date...", isConfigured: false };
	}
	const description =
		until.kind === "var" ? `Resumes at ${until.path}` : `Resumes at ${until.value}`;
	return { title: "Wait until a date", description, isConfigured: true };
}

export const DelayUntilNodeRF = memo(({ data }: NodeProps) => {
	const config = (data as Record<string, unknown>)?.config as DelayUntilNodeConfig | undefined;
	const { title, description, isConfigured } = getSummary(config);

	return (
		<BaseNode
			className={cn(
				"w-[280px]",
				isConfigured
					? "border-l-4 border-l-cyan-500 dark:border-l-cyan-400"
					: "border-dashed border-muted-foreground/30",
			)}
			aria-label={`Delay until: ${title} - ${description}`}
		>
			<BaseHandle type="target" position={Position.Top} />
			<BaseNodeContent className="p-3">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300 flex items-center justify-center shrink-0">
						<CalendarClock className="h-4 w-4" />
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
DelayUntilNodeRF.displayName = "DelayUntilNodeRF";
