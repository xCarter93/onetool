"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Repeat } from "lucide-react";

/**
 * Dashed frame rendered behind a loop's body (Attio-style container), with a
 * "Loop" chip straddling the top-left border so the region reads as a named
 * scope at a glance. Pure visual: sized by the derived layout, never
 * interactive.
 */
export const LoopContainerNodeRF = memo(({ data }: NodeProps) => {
	const width = (data as { width?: number })?.width ?? 0;
	const height = (data as { height?: number })?.height ?? 0;

	return (
		<div
			aria-hidden
			className="pointer-events-none relative rounded-2xl border-[1.5px] border-dashed border-orange-300/70 bg-orange-50/30 dark:border-orange-400/30 dark:bg-orange-400/[0.04]"
			style={{ width, height }}
		>
			<div className="absolute -top-2.5 left-4 flex items-center gap-1 rounded-full border border-orange-200/80 bg-background px-2 py-0.5 dark:border-orange-400/25">
				<Repeat className="h-3 w-3 text-orange-500 dark:text-orange-400" />
				<span className="text-[10px] font-semibold tracking-wide text-orange-600 dark:text-orange-300">
					Loop
				</span>
			</div>
		</div>
	);
});
LoopContainerNodeRF.displayName = "LoopContainerNodeRF";
