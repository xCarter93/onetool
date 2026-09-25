"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import { useReactFlow, useViewport, type FitViewOptions } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Zoom cluster: out, readout (click resets to 100%), in, fit. Needs a ReactFlowProvider above. */
export function FlowZoomControls({
	className,
	fitViewOptions,
}: {
	className?: string;
	fitViewOptions?: FitViewOptions;
}) {
	const { zoom } = useViewport();
	const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();

	return (
		<div
			className={cn(
				"flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5",
				className
			)}
		>
			<Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => zoomOut({ duration: 200 })}>
				<Minus />
			</Button>
			<Button
				variant="ghost"
				size="sm"
				className="min-w-12 tabular-nums"
				aria-label="Reset zoom to 100%"
				onClick={() => zoomTo(1, { duration: 200 })}
			>
				{Math.round(zoom * 100)}%
			</Button>
			<Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => zoomIn({ duration: 200 })}>
				<Plus />
			</Button>
			<span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Fit to view"
				onClick={() => fitView(fitViewOptions ?? { duration: 200 })}
			>
				<Maximize />
			</Button>
		</div>
	);
}
