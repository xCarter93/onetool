"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	getStraightPath,
	type EdgeProps,
} from "@xyflow/react";
import { NextItemMarker } from "./next-item-marker";
import { edgeStroke } from "./edge-style";
import { EdgeInsertButton } from "./edge-insert-button";
import { useEdgeHovered } from "./edge-hover-context";

/**
 * Spine connector between sequential steps (and trigger → first step, merge
 * dot → continuation). Layout keeps both endpoints on the same vertical
 * spine, so the path is a straight drop. Every non-terminal edge carries an
 * always-visible insert "+" at its midpoint; terminal edges render the fixed
 * 50px stub with the prominent terminal "+".
 */
export function PlusButtonEdge(props: EdgeProps) {
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
	const isTerminal = data?.isTerminal === true;
	const impliedNextItem = data?.impliedNextItem === true;
	const loop = data?.inLoop === true;
	const hovered = useEdgeHovered(id);
	const onInsertNode = data?.onInsertNode as
		| ((edgeId: string, nodeType: string, actionType?: string) => void)
		| undefined;

	// Terminal edges: fixed-length stub below source (ignore target position to prevent flip on drag)
	if (isTerminal) {
		const TERMINAL_LENGTH = 50;
		const fixedTargetY = sourceY + TERMINAL_LENGTH;
		const [edgePath] = getStraightPath({
			sourceX,
			sourceY,
			targetX: sourceX,
			targetY: fixedTargetY,
		});

		return (
			<>
				<BaseEdge
					path={edgePath}
					interactionWidth={interactionWidth}
					style={{ ...style, ...edgeStroke({ loop, dashed: true, hovered, selected }) }}
				/>
				<EdgeLabelRenderer>
					<EdgeInsertButton
						edgeId={id}
						x={sourceX}
						y={fixedTargetY}
						onInsert={onInsertNode}
						variant="stub"
						edgeHovered={hovered}
					/>
					{impliedNextItem && <NextItemMarker x={sourceX} y={fixedTargetY + 18} />}
				</EdgeLabelRenderer>
			</>
		);
	}

	// Non-terminal: straight vertical drop with a midpoint insert "+".
	const [edgePath, labelX, labelY] = getStraightPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
	});

	return (
		<>
			<BaseEdge
				path={edgePath}
				markerEnd={markerEnd}
				interactionWidth={interactionWidth}
				style={{ ...style, ...edgeStroke({ loop, hovered, selected }) }}
			/>
			<EdgeLabelRenderer>
				<EdgeInsertButton
					edgeId={id}
					x={labelX}
					y={labelY}
					onInsert={onInsertNode}
					edgeHovered={hovered}
				/>
			</EdgeLabelRenderer>
		</>
	);
}
