"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	getStraightPath,
	getSmoothStepPath,
	Position,
	type EdgeProps,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function PlusButtonEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	data,
	style,
}: EdgeProps) {
	const isTerminal = data?.isTerminal === true;
	const onInsertNode = data?.onInsertNode as
		| ((edgeId: string, nodeType: string) => void)
		| undefined;

	// For terminal edges, shorten the path so it ends at the "+" button position
	// instead of continuing past it to the invisible terminal node
	const effectiveTargetY = isTerminal
		? sourceY + (targetY - sourceY) * 0.5
		: targetY;

	// Terminal edges: straight vertical line. Connected edges: smoothstep so
	// non-aligned nodes get clean right-angle routing instead of diagonal lines.
	let edgePath: string;
	let plusX: number;
	let plusY: number;

	if (isTerminal) {
		[edgePath] = getStraightPath({
			sourceX,
			sourceY,
			targetX: sourceX, // Keep terminal edges perfectly vertical
			targetY: effectiveTargetY,
		});
		plusX = sourceX;
		plusY = effectiveTargetY;
	} else {
		let labelX: number, labelY: number;
		[edgePath, labelX, labelY] = getSmoothStepPath({
			sourceX,
			sourceY,
			sourcePosition: Position.Bottom,
			targetX,
			targetY,
			targetPosition: Position.Top,
			borderRadius: 8,
		});
		plusX = labelX;
		plusY = labelY;
	}

	return (
		<>
			<BaseEdge path={edgePath} style={{ ...style, strokeWidth: 2, stroke: "var(--color-border)" }} />
			<EdgeLabelRenderer>
				<div
					className="nodrag nopan pointer-events-auto"
					style={{
						position: "absolute",
						transform: `translate(-50%, -50%) translate(${plusX}px, ${plusY}px)`,
						zIndex: 10,
					}}
				>
					<button
						onClick={(e) => {
							e.stopPropagation();
							onInsertNode?.(id, "placeholder");
						}}
						className={cn(
							"w-7 h-7 rounded-full bg-background border-2 border-muted-foreground/30 hover:border-primary hover:bg-primary/10 flex items-center justify-center transition-colors shadow-sm cursor-pointer",
							isTerminal
								? "opacity-100"
								: "opacity-0 hover:opacity-100 focus:opacity-100"
						)}
						aria-label="Add step"
					>
						<Plus className="h-3.5 w-3.5 text-muted-foreground" />
					</button>
				</div>
			</EdgeLabelRenderer>
		</>
	);
}
