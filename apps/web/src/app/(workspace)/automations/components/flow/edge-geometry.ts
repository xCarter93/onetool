const AFTER_LAST_MIN_OFFSET_X = 56;

/**
 * Length of the After-Last edge's final vertical entry into its target: the
 * path finishes with a straight drop INTO the node's top handle (or terminal
 * "+" stub) so the node after a loop reads as connected from above, exactly
 * like every other spine node. derived-layout's AFTER_GAP reserves the
 * vertical corridor this stub and its corner occupy.
 */
export const AFTER_LAST_ENTRY_STUB = 48;

/** Min gap between the branch label pill's center and the "+" center: pill
 * half-height (~11) + "+" hovered half-height (~11) + breathing room. */
const BRANCH_PLUS_PILL_CLEARANCE = 28;
/** Min gap between the "+" center and the target card's top edge. */
const BRANCH_PLUS_TARGET_CLEARANCE = 16;

/**
 * Vertical position of a branch lane's inline "+": the lane midpoint, clamped
 * below the label pill (which sits on the fan-out corner at `pillY`) and above
 * the target card. On short lanes the raw midpoint lands on the pill, so pill
 * clearance wins over target clearance when both can't be satisfied.
 */
export function getBranchPlusY(
	pillY: number,
	targetY: number,
	hasPill: boolean
) {
	const midY = (pillY + targetY) / 2;
	const clamped = Math.min(midY, targetY - BRANCH_PLUS_TARGET_CLEARANCE);
	return hasPill ? Math.max(clamped, pillY + BRANCH_PLUS_PILL_CLEARANCE) : clamped;
}

/**
 * Orthogonal route for the loop's After-Last exit: from the loop header's
 * right handle, right into the corridor outside the container, down past the
 * container, left onto the spine, then a rounded corner into a vertical drop
 * that enters the target from directly above.
 */
export function getAfterLastGeometry(
	sourceX: number,
	sourceY: number,
	targetX: number,
	targetY: number,
	options?: { routeRightX?: number }
) {
	const cr = 16;
	const rightX = Math.max(
		sourceX + AFTER_LAST_MIN_OFFSET_X,
		targetX + cr * 2,
		options?.routeRightX ?? Number.NEGATIVE_INFINITY
	);
	// Horizontal run sits one entry-stub above the target's top edge. Clamps
	// keep the path drawable if a caller ever feeds a target tighter than the
	// derived layout guarantees: never above the source's exit corner, and
	// always leaving room for the final corner + a visible drop.
	const midY = Math.min(
		Math.max(sourceY + cr * 2, targetY - AFTER_LAST_ENTRY_STUB),
		targetY - cr - 4
	);
	// Corridor descent never backtracks upward, even out of contract.
	const corridorEndY = Math.max(sourceY + cr, midY - cr);

	return {
		rightX,
		cr,
		midY,
		labelX: rightX,
		labelY: sourceY + cr * 2,
		// "+" centered on the visible part of the final drop, clear of both
		// the target's top edge and the arrowhead entering it.
		plusX: targetX,
		plusY: targetY - 22,
		edgePath: [
			`M ${sourceX} ${sourceY}`,
			`L ${rightX - cr} ${sourceY}`,
			`Q ${rightX} ${sourceY} ${rightX} ${sourceY + cr}`,
			`L ${rightX} ${corridorEndY}`,
			`Q ${rightX} ${midY} ${rightX - cr} ${midY}`,
			`L ${targetX + cr} ${midY}`,
			`Q ${targetX} ${midY} ${targetX} ${midY + cr}`,
			`L ${targetX} ${targetY}`,
		].join(" "),
	};
}
