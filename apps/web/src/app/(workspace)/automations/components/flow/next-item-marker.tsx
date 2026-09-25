"use client";

import { CornerDownLeft } from "lucide-react";

/**
 * "↩ Next item" pill rendered under a dangling leaf inside a loop body:
 * the engine skips to the next record when a body walk ends, and the canvas
 * should say so. Rendered inside an EdgeLabelRenderer.
 */
export function NextItemMarker({ x, y }: { x: number; y: number }) {
	return (
		<div
			className="nodrag nopan pointer-events-none absolute"
			style={{
				transform: `translate(-50%, 0) translate(${x}px, ${y}px)`,
			}}
		>
			<span className="flex items-center gap-1 whitespace-nowrap rounded-sm border border-warning/40 bg-background/90 px-1.5 py-0.5 text-2xs font-medium text-warning-foreground select-none">
				<CornerDownLeft className="h-3 w-3" />
				Next item
			</span>
		</div>
	);
}
