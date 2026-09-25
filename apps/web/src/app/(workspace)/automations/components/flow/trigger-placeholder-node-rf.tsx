"use client";

import { memo } from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { BaseNode, BaseNodeContent } from "@/components/base-node";

export const TriggerPlaceholderNodeRF = memo(() => {
	return (
		<div className="relative mt-4">
			<span className="absolute -top-2.5 left-3 bg-background px-2 text-2xs font-semibold uppercase tracking-wider text-warning-foreground z-10">
				Trigger
			</span>
			<BaseNode
				className={cn(
					"w-[300px] border-dashed border-warning/50",
					"cursor-pointer hover:border-warning transition-colors",
				)}
				aria-label="Trigger placeholder — click to configure"
			>
				<BaseNodeContent className="p-3">
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 rounded-lg bg-warning-soft flex items-center justify-center shrink-0">
							<Zap className="h-4 w-4 text-warning-foreground" />
						</div>
						<span className="text-sm text-muted-foreground">
							Choose a trigger
						</span>
					</div>
				</BaseNodeContent>
			</BaseNode>
		</div>
	);
});
TriggerPlaceholderNodeRF.displayName = "TriggerPlaceholderNodeRF";
