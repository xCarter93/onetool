"use client";

import {
	BaseEdge,
	getSmoothStepPath,
	Position,
	type EdgeProps,
} from "@xyflow/react";
import { EDGE_STYLE, LOOP_EDGE_STYLE } from "./edge-style";

/**
 * Clearance below a terminal stub's "+" button before the connector starts:
 * the stub sits at the button's center, the button is a 28px circle, so 13px
 * lands flush against its lower edge.
 */
const STUB_CLEARANCE = 13;
/** Slight extension past the (invisible) merge point so the join is seamless. */
const JOIN_OVERSHOOT = 4;

/**
 * Branch tail → merge point connector: curves inward from the lane back to
 * the spine. Non-interactive — inserting at the convergence happens on the
 * merge point's OUTGOING edge, not here.
 */
export function MergeInEdge({
	sourceX,
	sourceY,
	targetX,
	targetY,
	data,
	style,
}: EdgeProps) {
	const startY =
		data?.fromTerminalStub === true ? sourceY + STUB_CLEARANCE : sourceY;
	const [edgePath] = getSmoothStepPath({
		sourceX,
		sourceY: startY,
		sourcePosition: Position.Bottom,
		targetX,
		targetY: targetY + JOIN_OVERSHOOT,
		targetPosition: Position.Top,
		borderRadius: 12,
	});

	return (
		<BaseEdge
			path={edgePath}
			style={{
				...style,
				...(data?.inLoop === true ? LOOP_EDGE_STYLE : EDGE_STYLE),
			}}
		/>
	);
}
