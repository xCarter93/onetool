"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";

/**
 * Dotted frame rendered behind a loop's body (Attio-style container).
 * Pure visual: sized by the derived layout, never interactive.
 */
export const LoopContainerNodeRF = memo(({ data }: NodeProps) => {
	const width = (data as { width?: number })?.width ?? 0;
	const height = (data as { height?: number })?.height ?? 0;

	return (
		<div
			aria-hidden
			className="pointer-events-none rounded-2xl border-2 border-dashed border-orange-300/60 bg-orange-50/25 dark:border-orange-400/35 dark:bg-orange-400/5"
			style={{ width, height }}
		/>
	);
});
LoopContainerNodeRF.displayName = "LoopContainerNodeRF";
