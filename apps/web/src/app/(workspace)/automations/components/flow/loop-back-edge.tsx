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
	// Route to the LEFT side of the loop (min X minus offset)
	const leftX = Math.min(sourceX, targetX) - offsetX;
	const cornerRadius = 16;

	// Path: from source (bottom of last body node), go down slightly,
	// curve LEFT, go up along left side, curve right to target (loop header left side)
	const edgePath = [
		`M ${sourceX} ${sourceY}`,
		`L ${sourceX} ${sourceY + cornerRadius}`,
		`Q ${sourceX} ${sourceY + cornerRadius * 2} ${sourceX - cornerRadius} ${sourceY + cornerRadius * 2}`,
		`L ${leftX + cornerRadius} ${sourceY + cornerRadius * 2}`,
		`Q ${leftX} ${sourceY + cornerRadius * 2} ${leftX} ${sourceY + cornerRadius}`,
		`L ${leftX} ${targetY + cornerRadius}`,
		`Q ${leftX} ${targetY} ${leftX + cornerRadius} ${targetY}`,
		`L ${targetX} ${targetY}`,
	].join(" ");

	return (
		<BaseEdge
			path={edgePath}
			markerEnd={markerEnd}
			style={{
				...style,
				strokeWidth: 1.5,
				stroke: "var(--color-orange-300)",
				strokeDasharray: "6 3",
			}}
		/>
	);
}
