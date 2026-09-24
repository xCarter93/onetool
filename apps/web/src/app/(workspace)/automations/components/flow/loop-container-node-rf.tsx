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
			className="pointer-events-none relative rounded-lg border border-dashed border-warning/70 bg-warning-soft"
			style={{ width, height }}
		>
			<div className="absolute -top-2.5 left-4 flex items-center gap-1 rounded-full border border-warning/70 bg-card px-2 py-0.5">
				<Repeat className="h-3 w-3 text-warning-foreground" />
				<span className="text-[10px] font-semibold tracking-wide text-warning-foreground">
					Loop
				</span>
			</div>
		</div>
	);
});
LoopContainerNodeRF.displayName = "LoopContainerNodeRF";
