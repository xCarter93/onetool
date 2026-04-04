"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	getStraightPath,
	type EdgeProps,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNoBranchGeometry } from "./edge-geometry";

export function BranchLabelEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	data,
	style,
}: EdgeProps) {
	const branchType = (data?.branchType as string) || (data?.variant as string) || "yes";
	const label =
		(data?.label as string) ||
		(branchType === "yes" ? "Yes" : branchType === "no" ? "No" : branchType === "each" ? "For Each" : "");
	const isTerminal = data?.isTerminal === true;
	const onInsertNode = data?.onInsertNode as
		| ((edgeId: string, nodeType: string) => void)
		| undefined;

	let edgePath = "";
	let labelX = 0;
	let labelY = 0;
	let noBranchEndY = targetY;

	if (branchType === "yes" || branchType === "each") {
		// Yes and For Each: straight vertical line
		[edgePath, labelX, labelY] = getStraightPath({
			sourceX,
			sourceY,
			targetX,
			targetY,
		});
	} else if (branchType === "no") {
		const geometry = getNoBranchGeometry(sourceX, sourceY, targetX, targetY);
		noBranchEndY = geometry.effectiveTargetY;
		edgePath = geometry.edgePath;
		labelX = geometry.labelX;
		labelY = geometry.labelY;
	} else if (branchType === "after") {
		// After Last: straight vertical from right side
		[edgePath, labelX, labelY] = getStraightPath({
			sourceX,
			sourceY,
			targetX: sourceX,
			targetY: isTerminal ? sourceY + (targetY - sourceY) * 0.5 : targetY,
		});
	} else {
		// Fallback: straight
		[edgePath, labelX, labelY] = getStraightPath({
			sourceX,
			sourceY,
			targetX,
			targetY,
		});
	}

	// Pill color classes per branch type
	const pillClasses: Record<string, string> = {
		yes: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
		no: "bg-rose-50 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400",
		each: "bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400",
		after: "bg-muted text-muted-foreground",
	};
	const pillClass = pillClasses[branchType] || pillClasses.yes;

	// Plus button position: at the edge endpoint for terminals, midpoint for connected
	const plusX = branchType === "no" ? targetX : isTerminal ? targetX : labelX;
	const plusY = branchType === "no" ? noBranchEndY : isTerminal ? targetY : labelY;

	return (
		<>
			<BaseEdge
				path={edgePath}
				style={{ ...style, strokeWidth: 2, stroke: "var(--color-border)" }}
			/>
			<EdgeLabelRenderer>
				<div
					className="nodrag nopan pointer-events-none"
					style={{
						position: "absolute",
						transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
					}}
				>
					<span
						className={cn(
							"text-xs font-semibold px-2 py-0.5 rounded-full",
							pillClass
						)}
					>
						{label}
					</span>
				</div>
				{/* Plus button */}
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
