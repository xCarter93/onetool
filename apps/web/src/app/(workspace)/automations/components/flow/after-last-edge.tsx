"use client";

import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { getAfterLastGeometry } from "./edge-geometry";
import { NextItemMarker } from "./next-item-marker";
import { edgeStroke } from "./edge-style";
import { EdgeInsertButton } from "./edge-insert-button";
import { EdgeLabelPill } from "./edge-label-pill";
import { useEdgeHovered } from "./edge-hover-context";

/**
 * Custom edge for the "After Last" branch of loop nodes.
 * Routes from the loop's right-side handle: right → down the corridor outside
 * the container → left onto the spine below the container → rounded corner
 * into a vertical drop that enters the target from directly above, so the
 * node after a loop connects exactly like any other spine node.
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
	markerEnd,
	selected,
	interactionWidth,
}: EdgeProps) {
	const isTerminal = data?.isTerminal === true;
	const hovered = useEdgeHovered(id);
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
				markerEnd={markerEnd}
				interactionWidth={interactionWidth}
				style={{
					...style,
					...edgeStroke({ loop: true, dashed: isTerminal, hovered, selected }),
				}}
			/>
			<EdgeLabelRenderer>
				<EdgeLabelPill x={geometry.labelX} y={geometry.labelY} loop>
					After Last
				</EdgeLabelPill>
				<EdgeInsertButton
					edgeId={id}
					x={geometry.plusX}
					y={isTerminal ? targetY : geometry.plusY}
					onInsert={onInsertNode}
					variant={isTerminal ? "stub" : "inline"}
					edgeHovered={hovered}
				/>
				{isTerminal && data?.impliedNextItem === true && (
					<NextItemMarker x={geometry.plusX} y={targetY + 20} />
				)}
			</EdgeLabelRenderer>
		</>
	);
}
