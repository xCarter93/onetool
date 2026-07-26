"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface EdgeInsertButtonProps {
	edgeId: string;
	x: number;
	y: number;
	onInsert?: (edgeId: string, nodeType: string, actionType?: string) => void;
	/**
	 * "stub" — the terminal "+" capping an unbuilt tail: large and prominent,
	 * it's the primary "continue building" affordance.
	 * "inline" — insertion between existing steps: compact at rest, expands
	 * with a brand accent when the edge (or the button itself) is hovered.
	 */
	variant?: "inline" | "stub";
	/** The owning edge's interaction path is hovered. */
	edgeHovered?: boolean;
}

/**
 * The single insert affordance shared by every insertable edge. Always
 * visible — discoverability beats minimalism for insertion points — and
 * rendered inside the parent edge's EdgeLabelRenderer.
 */
export function EdgeInsertButton({
	edgeId,
	x,
	y,
	onInsert,
	variant = "inline",
	edgeHovered = false,
}: EdgeInsertButtonProps) {
	const stub = variant === "stub";
	return (
		<div
			className="nodrag nopan pointer-events-auto absolute"
			style={{
				transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
				zIndex: 10,
			}}
		>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onInsert?.(edgeId, "placeholder");
				}}
				className={cn(
					"nodrag nopan group flex cursor-pointer items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs",
					"transition-[transform,border-color,color,box-shadow] duration-150",
					"hover:border-primary hover:text-primary hover:shadow-sm",
					"focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
					stub
						? "h-7 w-7 border-border"
						: cn(
								"h-5 w-5",
								edgeHovered
									? "scale-110 border-primary text-primary shadow-sm"
									: "border-border"
							)
				)}
				aria-label="Add step"
			>
				<Plus className={stub ? "h-3.5 w-3.5" : "h-3 w-3"} />
			</button>
		</div>
	);
}
