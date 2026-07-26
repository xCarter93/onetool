"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	getSmoothStepPath,
	Position,
	type EdgeProps,
} from "@xyflow/react";
import { NextItemMarker } from "./next-item-marker";
import { getBranchPlusY } from "./edge-geometry";
import { edgeStroke } from "./edge-style";
import { EdgeInsertButton } from "./edge-insert-button";
import { EdgeLabelPill } from "./edge-label-pill";
import { useEdgeHovered } from "./edge-hover-context";

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
 * the always-visible "+" lives in the lane (prominent stub "+" on empty
 * branches, compact inline "+" on populated ones).
 */
export function BranchLabelEdge(props: EdgeProps) {
	const {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		data,
		style,
		markerEnd,
		selected,
		interactionWidth,
	} = props;
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
	const loop = isLoopBranch || data?.inLoop === true;
	const hovered = useEdgeHovered(id);
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
		: getBranchPlusY(labelY, effectiveTargetY, Boolean(label));

	return (
		<>
			<BaseEdge
				path={edgePath}
				markerEnd={markerEnd}
				interactionWidth={interactionWidth}
				style={{
					...style,
					...edgeStroke({ loop, dashed: isTerminal || ghostTarget, hovered, selected }),
				}}
			/>
			<EdgeLabelRenderer>
				{label && (
					<EdgeLabelPill x={labelX} y={labelY} loop={loop}>
						{label}
					</EdgeLabelPill>
				)}
				{!ghostTarget && (
					<EdgeInsertButton
						edgeId={id}
						x={plusX}
						y={plusY}
						onInsert={onInsertNode}
						variant={isTerminal ? "stub" : "inline"}
						edgeHovered={hovered}
					/>
				)}
				{impliedNextItem && <NextItemMarker x={plusX} y={plusY + 18} />}
			</EdgeLabelRenderer>
		</>
	);
}
