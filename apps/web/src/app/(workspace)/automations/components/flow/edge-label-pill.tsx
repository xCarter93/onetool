"use client";

import { cn } from "@/lib/utils";

/**
 * Branch-name pill rendered on an edge ("Is true", "For Each", "After Last").
 * Loop lanes carry the loop system's orange; condition lanes stay neutral.
 * Rendered inside the parent edge's EdgeLabelRenderer.
 */
export function EdgeLabelPill({
	x,
	y,
	loop = false,
	children,
}: {
	x: number;
	y: number;
	loop?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div
			className="nodrag nopan pointer-events-none absolute"
			style={{
				transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
			}}
		>
			<span
				className={cn(
					"rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap select-none",
					// Opaque backgrounds: pills sit on top of edge strokes and the
					// loop container border, and must mask them in both themes.
					loop
						? "border-warning/40 bg-warning-soft text-warning-foreground   "
						: "border-border/60 bg-muted text-muted-foreground"
				)}
			>
				{children}
			</span>
		</div>
	);
}
