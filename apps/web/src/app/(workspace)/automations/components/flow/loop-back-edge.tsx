"use client";

import { BaseEdge, type EdgeProps } from "@xyflow/react";
import { edgeStroke } from "./edge-style";

/**
 * Iteration return: from the loop body's tail, down past the terminal stub,
 * left into the container's inner lane, up, and into the loop header's left
 * handle. Non-insertable by design — appending to the body happens on the
 * tail's own "+" stub, which is the same operation.
 */
export function LoopBackEdge({
	sourceX,
	sourceY,
	targetX,
	targetY,
	data,
	markerEnd,
	style,
	selected,
	interactionWidth,
}: EdgeProps) {
	const offsetX = 50;
	// Vertical run: hug the loop container's left lane when the derived layout
	// provides it; otherwise fall back to min X minus a fixed offset.
	const routeLeftX =
		typeof data?.routeLeftX === "number" ? (data.routeLeftX as number) : undefined;
	const leftX = routeLeftX ?? Math.min(sourceX, targetX) - offsetX;
	const cornerRadius = 16;
	// Extend below source to clear the terminal "+" stub button (50px below
	// source) — plain chain tails and merge dots both carry one.
	const extendBelow = 70;
	const bottomY = sourceY + extendBelow;

	// Path: from source (bottom of last body node), go down past terminal stub,
	// curve LEFT, go up along left side, curve right to target (loop header left side)
	const edgePath = [
		`M ${sourceX} ${sourceY}`,
		`L ${sourceX} ${bottomY - cornerRadius}`,
		`Q ${sourceX} ${bottomY} ${sourceX - cornerRadius} ${bottomY}`,
		`L ${leftX + cornerRadius} ${bottomY}`,
		`Q ${leftX} ${bottomY} ${leftX} ${bottomY - cornerRadius}`,
		`L ${leftX} ${targetY + cornerRadius}`,
		`Q ${leftX} ${targetY} ${leftX + cornerRadius} ${targetY}`,
		`L ${targetX} ${targetY}`,
	].join(" ");

	return (
		<BaseEdge
			path={edgePath}
			markerEnd={markerEnd}
			interactionWidth={interactionWidth}
			style={{ ...style, ...edgeStroke({ loop: true, selected }) }}
		/>
	);
}
