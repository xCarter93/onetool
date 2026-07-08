"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAfterLastGeometry } from "./edge-geometry";
import { NextItemMarker } from "./next-item-marker";

/**
 * Custom edge for the "After Last" branch of loop nodes.
 * Routes from the loop's right-side handle: right → curve down → straight
 * down alongside the loop body → curve left → to target below.
 * Mirrors LoopBackEdge's left-side routing but on the right going downward.
 *
 * Insertion works like every other edge: "+" adds a placeholder and the
 * sidebar step picker opens. The picker is graph-position-scoped, so it
 * already hides "Next item" here (an After-Last placeholder hangs off the
 * loop's nextNodeId, outside the body).
 */
export function AfterLastEdge({
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
		| ((edgeId: string, nodeType: string, actionType?: string) => void)
		| undefined;

	const geometry = getAfterLastGeometry(sourceX, sourceY, targetX, targetY, {
		routeRightX:
			typeof data?.routeRightX === "number" ? (data.routeRightX as number) : undefined,
	});

	return (
		<>
			<BaseEdge
				path={geometry.edgePath}
				style={{ ...style, strokeWidth: 1.5, stroke: "var(--color-orange-300)", strokeDasharray: "6 3" }}
			/>
			<EdgeLabelRenderer>
				<div
					className="nodrag nopan pointer-events-none"
					style={{
						position: "absolute",
						transform: `translate(-50%, -50%) translate(${geometry.labelX}px, ${geometry.labelY}px)`,
					}}
				>
					<span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
						After Last
					</span>
				</div>
				<div
					className="nodrag nopan pointer-events-auto absolute"
					style={{
						transform: `translate(-50%, -50%) translate(${geometry.plusX}px, ${geometry.plusY}px)`,
						zIndex: 10,
					}}
				>
					<button
						onClick={(e) => {
							e.stopPropagation();
							onInsertNode?.(id, "placeholder");
						}}
						className={cn(
							"nodrag nopan w-7 h-7 rounded-full bg-background border border-border hover:border-primary flex items-center justify-center shadow-sm transition-colors cursor-pointer",
							isTerminal
								? "opacity-100"
								: "opacity-0 hover:opacity-100 focus:opacity-100",
						)}
						aria-label="Add step"
					>
						<Plus className="h-3.5 w-3.5 text-muted-foreground" />
					</button>
				</div>
				{isTerminal && data?.impliedNextItem === true && (
					<NextItemMarker x={geometry.plusX} y={geometry.plusY + 20} />
				)}
			</EdgeLabelRenderer>
		</>
	);
}
