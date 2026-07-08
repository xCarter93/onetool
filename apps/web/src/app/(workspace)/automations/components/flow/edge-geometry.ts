const AFTER_LAST_MIN_OFFSET_X = 56;

export function getNoBranchGeometry(
	sourceX: number,
	sourceY: number,
	targetX: number,
	targetY: number
) {
	const offsetX = 50;
	const rightX = Math.max(sourceX + offsetX, targetX + 16);
	const cr = 16;
	const effectiveTargetY = Math.max(targetY, sourceY + cr * 3);

	return {
		rightX,
		cr,
		effectiveTargetY,
		labelX: rightX,
		labelY: sourceY + cr * 2,
		plusX: targetX,
		plusY: effectiveTargetY,
		edgePath: [
			`M ${sourceX} ${sourceY}`,
			`L ${rightX - cr} ${sourceY}`,
			`Q ${rightX} ${sourceY} ${rightX} ${sourceY + cr}`,
			`L ${rightX} ${effectiveTargetY}`,
			`L ${targetX} ${effectiveTargetY}`,
		].join(" "),
	};
}

export function getAfterLastGeometry(
	sourceX: number,
	sourceY: number,
	targetX: number,
	targetY: number,
	options?: { routeRightX?: number }
) {
	const rightX = Math.max(
		sourceX + AFTER_LAST_MIN_OFFSET_X,
		targetX + 8,
		options?.routeRightX ?? Number.NEGATIVE_INFINITY
	);
	const cr = 16;
	const effectiveTargetY = Math.max(targetY, sourceY + cr * 4);

	return {
		rightX,
		cr,
		effectiveTargetY,
		labelX: rightX,
		labelY: sourceY + cr * 2,
		plusX: targetX,
		plusY: effectiveTargetY,
		edgePath: [
			`M ${sourceX} ${sourceY}`,
			`L ${rightX - cr} ${sourceY}`,
			`Q ${rightX} ${sourceY} ${rightX} ${sourceY + cr}`,
			`L ${rightX} ${effectiveTargetY - cr}`,
			`Q ${rightX} ${effectiveTargetY} ${rightX - cr} ${effectiveTargetY}`,
			`L ${targetX} ${effectiveTargetY}`,
		].join(" "),
	};
}
