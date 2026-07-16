"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	getSmoothStepPath,
	Position,
	type EdgeProps,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NextItemMarker } from "./next-item-marker";
import { EDGE_STYLE, LOOP_EDGE_STYLE } from "./edge-style";

/** Vertical stem below the source before the fan-out turns toward its lane. */
const FAN_DROP = 24;

/** Map raw branch labels to user-friendly text */
function displayLabel(label: string | undefined, branchType: string): string {
	if (label === "Yes" || (!label && branchType === "yes")) return "Is true";
	if (label === "No" || (!label && branchType === "no")) return "Is false";
	if (label === "For Each" || (!label && branchType === "each")) return "For Each";
	if (label === "After Last" || (!label && branchType === "after")) return "After Last";
	return label || "";
}

/**
 * Condition/loop branch edge, Salesforce-Flow style: a short stem drops from
 * the source, turns toward the branch lane with rounded corners, and runs
 * down the lane. The label pill sits on the fan-out corner at the lane's top;
 * the "+" lives in the lane (always visible on empty branches, hover-revealed
 * on populated ones).
 */
export function BranchLabelEdge(props: EdgeProps) {
	const { id, sourceX, sourceY, targetX, targetY, data, style } = props;
	const branchType =
		(data?.branchType as string) || (data?.variant as string) || "yes";
	const rawLabel = data?.label as string | undefined;
	const label = displayLabel(rawLabel, branchType);
	const isTerminal = data?.isTerminal === true;
	// The lane ends in a ghost "Choose a step" card — the card is the insert
	// affordance, so the edge renders no "+".
	const ghostTarget = data?.ghostTarget === true;
	const impliedNextItem = data?.impliedNextItem === true;
	const isLoopBranch = branchType === "each";
	const edgeStyle =
		isLoopBranch || data?.inLoop === true ? LOOP_EDGE_STYLE : EDGE_STYLE;
	const onInsertNode = data?.onInsertNode as
		| ((edgeId: string, nodeType: string) => void)
		| undefined;

	// Empty branches keep a fixed-length lane below the fan-out (the terminal
	// node's position is layout-derived from the same constant).
	const TERMINAL_LENGTH = 50;
	const effectiveTargetY = isTerminal ? sourceY + TERMINAL_LENGTH : targetY;

	const [edgePath] = getSmoothStepPath({
		sourceX,
		sourceY,
		sourcePosition: Position.Bottom,
		targetX,
		targetY: effectiveTargetY,
		targetPosition: Position.Top,
		borderRadius: 12,
		centerY: sourceY + FAN_DROP,
	});

	// Pill on the fan-out corner (top of the lane); "+" further down the lane.
	const labelX = targetX;
	const labelY = sourceY + FAN_DROP;
	const plusX = targetX;
	const plusY = isTerminal
		? effectiveTargetY
		: (sourceY + FAN_DROP + effectiveTargetY) / 2;

	return (
		<>
			<BaseEdge path={edgePath} style={{ ...style, ...edgeStyle }} />
			<EdgeLabelRenderer>
				{label && (
					<div
						className="nodrag nopan pointer-events-none absolute"
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
						}}
					>
						<span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground select-none whitespace-nowrap">
							{label}
						</span>
					</div>
				)}
				{!ghostTarget && (
					<div
						className="nodrag nopan pointer-events-auto absolute"
						style={{
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
				)}
				{impliedNextItem && <NextItemMarker x={plusX} y={plusY + 18} />}
			</EdgeLabelRenderer>
		</>
	);
}
