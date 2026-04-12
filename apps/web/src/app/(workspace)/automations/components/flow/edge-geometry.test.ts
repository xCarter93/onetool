import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import type { WorkflowNode } from "../../lib/node-types";
import {
	computeAfterLastRouteRightX,
	getNoBranchGeometry,
	getAfterLastGeometry,
} from "./edge-geometry";

describe("edge geometry", () => {
	it("draws the No branch with a direct final segment into the target", () => {
		const noBranch = getNoBranchGeometry(520, 420, 750, 560);

		expect((noBranch.edgePath.match(/Q/g) || []).length).toBe(1);
		expect(noBranch.edgePath.endsWith(`L 750 ${noBranch.effectiveTargetY}`)).toBe(true);
	});

	it("keeps the After Last corridor to the outer right of a nested No branch when routing requires it", () => {
		const noBranch = getNoBranchGeometry(520, 420, 750, 560);
		const afterLast = getAfterLastGeometry(540, 300, 390, 700, {
			routeRightX: noBranch.rightX + 48,
		});

		expect(afterLast.rightX).toBeGreaterThan(noBranch.rightX);
	});

	it("keeps the After Last corridor to the outer right of the full No placeholder width when routing requires it", () => {
		const noPlaceholderCenterX = 750;
		const noPlaceholderRightX = noPlaceholderCenterX + 130;
		const afterLast = getAfterLastGeometry(540, 300, 390, 700, {
			routeRightX: noPlaceholderRightX + 48,
		});

		expect(afterLast.rightX).toBeGreaterThan(noPlaceholderRightX);
	});

	it("computes an After Last corridor beyond the widest loop body branch", () => {
		const workflowNodes: WorkflowNode[] = [
			{ id: "loop1", type: "loop", nextNodeId: "cond1", elseNodeId: "after1" },
			{ id: "cond1", type: "condition", nextNodeId: "yes1", elseNodeId: "no1" },
			{ id: "yes1", type: "action", config: { targetType: "self", actionType: "update_field" } },
			{ id: "no1", type: "action", config: { targetType: "self", actionType: "update_field" } },
			{ id: "after1", type: "action", config: { targetType: "self", actionType: "update_field" } },
		];

		const layoutedNodes: Node[] = [
			{ id: "loop1", type: "loopNode", data: {}, position: { x: 240, y: 200 } },
			{ id: "cond1", type: "conditionNode", data: {}, position: { x: 260, y: 352 } },
			{ id: "yes1", type: "actionNode", data: {}, position: { x: 260, y: 504 } },
			{ id: "no1", type: "actionNode", data: {}, position: { x: 760, y: 504 } },
			{ id: "after1", type: "actionNode", data: {}, position: { x: 260, y: 656 } },
		];

		const routeRightX = computeAfterLastRouteRightX("loop1", layoutedNodes, workflowNodes);

		expect(routeRightX).toBeGreaterThan(1020);
	});

	it("honors an explicit After Last corridor override", () => {
		const afterLast = getAfterLastGeometry(540, 300, 390, 700, {
			routeRightX: 1080,
		});

		expect(afterLast.rightX).toBe(1080);
	});
});
