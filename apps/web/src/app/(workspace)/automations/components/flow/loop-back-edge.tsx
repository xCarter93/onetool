"use client";

import { BaseEdge, type EdgeProps } from "@xyflow/react";

export function LoopBackEdge({
	sourceX,
	sourceY,
	targetX,
	targetY,
	markerEnd,
	style,
}: EdgeProps) {
	const offsetX = 50;
	const rightX = Math.max(sourceX, targetX) + offsetX;
	const cornerRadius = 16;

	// Path: from source (bottom of last body node), go down slightly,
	// curve right, go up along right side, curve left to target (loop header right side)
	const edgePath = [
		`M ${sourceX} ${sourceY}`,
		`L ${sourceX} ${sourceY + cornerRadius}`,
		`Q ${sourceX} ${sourceY + cornerRadius * 2} ${sourceX + cornerRadius} ${sourceY + cornerRadius * 2}`,
		`L ${rightX - cornerRadius} ${sourceY + cornerRadius * 2}`,
		`Q ${rightX} ${sourceY + cornerRadius * 2} ${rightX} ${sourceY + cornerRadius}`,
		`L ${rightX} ${targetY + cornerRadius}`,
		`Q ${rightX} ${targetY} ${rightX - cornerRadius} ${targetY}`,
		`L ${targetX} ${targetY}`,
	].join(" ");

	return (
		<BaseEdge
			path={edgePath}
			markerEnd={markerEnd}
			style={{
				...style,
				strokeWidth: 2,
				stroke: "var(--color-border)",
				strokeDasharray: "6 3",
			}}
		/>
	);
}
