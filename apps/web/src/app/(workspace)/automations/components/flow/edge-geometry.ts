import type { Node } from "@xyflow/react";
import type { WorkflowNode } from "../../lib/node-types";

const NODE_WIDTH = 260;
const LOOP_NODE_WIDTH = 300;
import { collectLoopBody, collectSubtree } from "../../lib/graph-utils";

const AFTER_LAST_MIN_OFFSET_X = 56;
const AFTER_LAST_CLEARANCE_X = 48;
const TERMINAL_VISUAL_WIDTH = 28;

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

export function computeAfterLastRouteRightX(
	loopNodeId: string,
	layoutedNodes: Node[],
	workflowNodes: WorkflowNode[]
): number | undefined {
	const loopNode = workflowNodes.find(
		(node): node is Extract<WorkflowNode, { type: "loop" }> =>
			node.id === loopNodeId && node.type === "loop"
	);
	if (!loopNode) return undefined;

	const bodyIds = collectLoopBody(loopNodeId, workflowNodes);
	const afterIds = loopNode.elseNodeId
		? collectSubtree(loopNode.elseNodeId, workflowNodes)
		: new Set<string>();
	const bodyIdList = [...bodyIds];

	let maxRightX = -Infinity;

	for (const node of layoutedNodes) {
		if (node.type === "terminalNode") {
			const parentId = bodyIdList.find((bodyId) =>
				node.id.startsWith(`__terminal__${bodyId}`)
			);
			if (!parentId) continue;
			if (afterIds.has(parentId) && parentId !== loopNodeId) continue;

			maxRightX = Math.max(maxRightX, node.position.x + TERMINAL_VISUAL_WIDTH);
			continue;
		}

		if (!bodyIds.has(node.id)) continue;
		if (afterIds.has(node.id) && node.id !== loopNodeId) continue;

		const width = node.type === "loopNode" ? LOOP_NODE_WIDTH : NODE_WIDTH;
		maxRightX = Math.max(maxRightX, node.position.x + width);
	}

	return Number.isFinite(maxRightX) ? maxRightX + AFTER_LAST_CLEARANCE_X : undefined;
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
