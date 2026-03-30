import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import type { WorkflowNode } from "../components/workflow-node";
import {
	adjustAfterLastPositions,
	computeDagreLayout,
	computeLoopBodyBounds,
	LOOP_NODE_WIDTH,
	LOOP_EACH_HANDLE_RATIO,
} from "./dagre-layout";

describe("dagre-layout loop post-processing", () => {
	it("computeLoopBodyBounds includes branched descendants in loop body", () => {
		const workflowNodes: WorkflowNode[] = [
			{ id: "loop1", type: "loop", nextNodeId: "c1", elseNodeId: "after1" },
			{
				id: "c1",
				type: "condition",
				condition: { field: "status", operator: "equals", value: "active" },
				nextNodeId: "bodyNext",
				elseNodeId: "bodyElse",
			},
			{
				id: "bodyNext",
				type: "action",
				action: { targetType: "self", actionType: "update_status", newStatus: "done" },
			},
			{
				id: "bodyElse",
				type: "action",
				action: { targetType: "self", actionType: "update_status", newStatus: "draft" },
			},
			{
				id: "after1",
				type: "action",
				action: { targetType: "client", actionType: "update_status", newStatus: "inactive" },
			},
		];

		const layoutedNodes: Node[] = [
			{ id: "loop1", type: "loopNode", data: {}, position: { x: 100, y: 100 } },
			{ id: "c1", type: "conditionNode", data: {}, position: { x: 80, y: 260 } },
			{ id: "bodyNext", type: "actionNode", data: {}, position: { x: 80, y: 420 } },
			{ id: "bodyElse", type: "actionNode", data: {}, position: { x: 420, y: 420 } },
			{ id: "after1", type: "actionNode", data: {}, position: { x: 120, y: 600 } },
		];

		const bounds = computeLoopBodyBounds(layoutedNodes, workflowNodes);
		expect(bounds).toHaveLength(1);
		const loopBounds = bounds[0].bounds;

		// bodyElse should expand the loop body width toward the right.
		expect(loopBounds.x).toBe(80);
		expect(loopBounds.width).toBeGreaterThan(600);
	});

	it("adjustAfterLastPositions moves after-last subtree outside loop body bounds", () => {
		const workflowNodes: WorkflowNode[] = [
			{ id: "loop1", type: "loop", nextNodeId: "body1", elseNodeId: "after1" },
			{
				id: "body1",
				type: "action",
				action: { targetType: "self", actionType: "update_status", newStatus: "done" },
			},
			{
				id: "after1",
				type: "action",
				action: { targetType: "client", actionType: "update_status", newStatus: "inactive" },
			},
		];

		const layoutedNodes: Node[] = [
			{ id: "loop1", type: "loopNode", data: {}, position: { x: 100, y: 100 } },
			{ id: "body1", type: "actionNode", data: {}, position: { x: 80, y: 260 } },
			// Starts too close to the body; should be nudged right/down.
			{ id: "after1", type: "actionNode", data: {}, position: { x: 120, y: 240 } },
		];

		const loopBodies = computeLoopBodyBounds(layoutedNodes, workflowNodes);
		const adjusted = adjustAfterLastPositions(layoutedNodes, loopBodies, workflowNodes);
		const afterNode = adjusted.find((n) => n.id === "after1");
		expect(afterNode).toBeDefined();

		const body = loopBodies[0].bounds;
		// adjustAfterLastPositions uses RANK_SEP (80) gap below body
		const bodyBottom = body.y + body.height + 80;
		// "After Last" now centers under the loop node center (not at 80% handle)
		const expectedAfterX = 100 + 300 / 2 - 280 / 2;

		expect(afterNode!.position.x).toBe(expectedAfterX);
		expect(afterNode!.position.y).toBeGreaterThanOrEqual(bodyBottom);
	});

	it("computeLoopBodyBounds excludes nodes reachable from After Last subtree", () => {
		const workflowNodes: WorkflowNode[] = [
			{ id: "loop1", type: "loop", nextNodeId: "body1", elseNodeId: "after1" },
			{
				id: "body1",
				type: "condition",
				condition: { field: "status", operator: "equals", value: "active" },
				nextNodeId: "body2",
				// This branch points to after subtree and should not expand loop scope.
				elseNodeId: "after1",
			},
			{
				id: "body2",
				type: "action",
				action: { targetType: "self", actionType: "update_status", newStatus: "done" },
			},
			{
				id: "after1",
				type: "action",
				action: { targetType: "client", actionType: "update_status", newStatus: "inactive" },
			},
		];

		const layoutedNodes: Node[] = [
			{ id: "loop1", type: "loopNode", data: {}, position: { x: 100, y: 100 } },
			{ id: "body1", type: "conditionNode", data: {}, position: { x: 80, y: 260 } },
			{ id: "body2", type: "actionNode", data: {}, position: { x: 80, y: 420 } },
			// Intentionally far to the right to detect accidental inclusion.
			{ id: "after1", type: "actionNode", data: {}, position: { x: 900, y: 420 } },
		];

		const bounds = computeLoopBodyBounds(layoutedNodes, workflowNodes);
		expect(bounds).toHaveLength(1);

		const bodyBounds = bounds[0].bounds;
		expect(bodyBounds.x).toBe(80);
		// Right edge should be from body chain, not from after1 at x=900.
		expect(bodyBounds.x + bodyBounds.width).toBeLessThan(900);
	});

	it("positions empty loop terminals straight down under their respective handles", () => {
		const nodes: Node[] = [
			{ id: "loop1", type: "loopNode", data: {}, position: { x: 0, y: 0 } },
			{
				id: "__terminal__loop1-each",
				type: "terminalNode",
				data: {},
				position: { x: 0, y: 0 },
			},
			{
				id: "__terminal__loop1-after",
				type: "terminalNode",
				data: {},
				position: { x: 0, y: 0 },
			},
		];
		const edges = [
			{
				id: "e-loop1-each",
				source: "loop1",
				target: "__terminal__loop1-each",
				sourceHandle: "each",
				type: "branchLabelEdge",
				data: { isTerminal: true, branchType: "each" },
			},
			{
				id: "e-loop1-after",
				source: "loop1",
				target: "__terminal__loop1-after",
				sourceHandle: "after",
				type: "branchLabelEdge",
				data: { isTerminal: true, branchType: "after" },
			},
		];

		const layouted = computeDagreLayout(nodes, edges);
		const loop = layouted.find((n) => n.id === "loop1");
		const eachTerminal = layouted.find((n) => n.id === "__terminal__loop1-each");
		const afterTerminal = layouted.find((n) => n.id === "__terminal__loop1-after");

		expect(loop).toBeDefined();
		expect(eachTerminal).toBeDefined();
		expect(afterTerminal).toBeDefined();

		const loopCenterX = loop!.position.x + LOOP_NODE_WIDTH / 2;
		const eachHandleX = loop!.position.x + LOOP_NODE_WIDTH * LOOP_EACH_HANDLE_RATIO;

		// Terminal node position is stored as centerX - 2 in layout.
		const eachTerminalCenterX = eachTerminal!.position.x + 2;
		const afterTerminalCenterX = afterTerminal!.position.x + 2;

		// "each" terminal goes under the each handle; "after" is centered under the loop
		// (AfterLastEdge curves from the right side to this centered target)
		expect(eachTerminalCenterX).toBeCloseTo(eachHandleX, 5);
		expect(afterTerminalCenterX).toBeCloseTo(loopCenterX, 5);
	});
});
