import { describe, expect, it } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNode } from "../lib/node-types";
import {
	computeLayout,
	LOOP_NODE_WIDTH,
	NODE_WIDTH,
} from "./dagre-layout";

describe("dagre-layout computeLayout", () => {
	it("returns positioned nodes for a simple linear flow", () => {
		const nodes: Node[] = [
			{ id: "trigger", type: "triggerNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "action1", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
		];
		const edges: Edge[] = [
			{ id: "e1", source: "trigger", target: "action1" },
		];

		const result = computeLayout(nodes, edges);
		expect(result).toHaveLength(2);
		// Nodes should be vertically ordered
		const trigger = result.find((n) => n.id === "trigger");
		const action = result.find((n) => n.id === "action1");
		expect(trigger).toBeDefined();
		expect(action).toBeDefined();
		expect(action!.position.y).toBeGreaterThan(trigger!.position.y);
	});

	it("positions loop body nodes vertically under the loop header", () => {
		const workflowNodes: WorkflowNode[] = [
			{ id: "loop1", type: "loop", nextNodeId: "body1", elseNodeId: "after1" },
			{
				id: "body1",
				type: "action",
				config: { targetType: "self", actionType: "update_field", newStatus: "done" },
			},
			{
				id: "after1",
				type: "action",
				config: { targetType: "client", actionType: "update_field", newStatus: "inactive" },
			},
		];

		const nodes: Node[] = [
			{ id: "loop1", type: "loopNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "body1", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "after1", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
		];
		const edges: Edge[] = [
			{ id: "e1", source: "loop1", target: "body1", sourceHandle: "each", data: { branchType: "each" } },
			{ id: "e2", source: "loop1", target: "after1", sourceHandle: "after", data: { branchType: "after" } },
		];

		const result = computeLayout(nodes, edges, workflowNodes);
		const loop = result.find((n) => n.id === "loop1");
		const body = result.find((n) => n.id === "body1");
		const after = result.find((n) => n.id === "after1");

		expect(loop).toBeDefined();
		expect(body).toBeDefined();
		expect(after).toBeDefined();

		// Body should be below loop
		expect(body!.position.y).toBeGreaterThan(loop!.position.y);
		// After should be below body
		expect(after!.position.y).toBeGreaterThan(body!.position.y);
	});

	it("positions empty loop terminals below the loop node", () => {
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
		const edges: Edge[] = [
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

		const layouted = computeLayout(nodes, edges);
		const loop = layouted.find((n) => n.id === "loop1");
		const eachTerminal = layouted.find((n) => n.id === "__terminal__loop1-each");
		const afterTerminal = layouted.find((n) => n.id === "__terminal__loop1-after");

		expect(loop).toBeDefined();
		expect(eachTerminal).toBeDefined();
		expect(afterTerminal).toBeDefined();

		// Both terminals should be below the loop node
		expect(eachTerminal!.position.y).toBeGreaterThan(loop!.position.y);
		expect(afterTerminal!.position.y).toBeGreaterThan(loop!.position.y);
	});

	it("returns empty array for empty input", () => {
		const result = computeLayout([], []);
		expect(result).toHaveLength(0);
	});

	it("does not contain merge nodes in output", () => {
		const nodes: Node[] = [
			{ id: "trigger", type: "triggerNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "cond1", type: "conditionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "__terminal__cond1-yes", type: "terminalNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "__terminal__cond1-no", type: "terminalNode", data: {}, position: { x: 0, y: 0 } },
		];
		const edges: Edge[] = [
			{ id: "e1", source: "trigger", target: "cond1" },
			{
				id: "e2",
				source: "cond1",
				target: "__terminal__cond1-yes",
				sourceHandle: "yes",
				data: { branchType: "yes", isTerminal: true },
			},
			{
				id: "e3",
				source: "cond1",
				target: "__terminal__cond1-no",
				sourceHandle: "no",
				data: { branchType: "no", isTerminal: true },
			},
		];

		const result = computeLayout(nodes, edges);
		// No merge nodes should exist
		const mergeNodes = result.filter((n) => n.id.startsWith("__merge__"));
		expect(mergeNodes).toHaveLength(0);
	});

	it("keeps condition Yes centered and No in separate right column", () => {
		const workflowNodes: WorkflowNode[] = [
			{
				id: "cond1",
				type: "condition",
				nextNodeId: "yes1",
				elseNodeId: "no1",
			},
			{
				id: "yes1",
				type: "action",
				config: { targetType: "self", actionType: "update_field", newStatus: "done" },
			},
			{
				id: "no1",
				type: "action",
				config: { targetType: "self", actionType: "update_field", newStatus: "pending" },
			},
		];

		const nodes: Node[] = [
			{ id: "trigger", type: "triggerNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "cond1", type: "conditionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "yes1", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "no1", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
		];

		const edges: Edge[] = [
			{ id: "e-trigger-cond", source: "trigger", target: "cond1", data: { branchType: "next" } },
			{
				id: "e-cond-yes",
				source: "cond1",
				target: "yes1",
				sourceHandle: "yes",
				data: { branchType: "yes" },
			},
			{
				id: "e-cond-no",
				source: "cond1",
				target: "no1",
				sourceHandle: "no",
				data: { branchType: "no" },
			},
		];

		const result = computeLayout(nodes, edges, workflowNodes);
		const condition = result.find((n) => n.id === "cond1");
		const yesNode = result.find((n) => n.id === "yes1");
		const noNode = result.find((n) => n.id === "no1");

		expect(condition).toBeDefined();
		expect(yesNode).toBeDefined();
		expect(noNode).toBeDefined();

		const conditionCenterX = condition!.position.x + NODE_WIDTH / 2;
		const yesCenterX = yesNode!.position.x + NODE_WIDTH / 2;
		const noCenterX = noNode!.position.x + NODE_WIDTH / 2;

		// Yes branch should stay centered under the condition column
		expect(Math.abs(yesCenterX - conditionCenterX)).toBeLessThanOrEqual(1);
		// No branch should be clearly separated from Yes (no overlap at node-card widths)
		expect(noCenterX - yesCenterX).toBeGreaterThan(NODE_WIDTH);
	});

	it("keeps loop After Last centered even when the loop body has wide condition branches", () => {
		const workflowNodes: WorkflowNode[] = [
			{
				id: "loop1",
				type: "loop",
				nextNodeId: "cond1",
				elseNodeId: "after1",
			},
			{
				id: "cond1",
				type: "condition",
				nextNodeId: "yes1",
				elseNodeId: "no1",
			},
			{
				id: "yes1",
				type: "action",
				config: { targetType: "self", actionType: "update_field", newStatus: "done" },
			},
			{
				id: "no1",
				type: "action",
				config: { targetType: "self", actionType: "update_field", newStatus: "pending" },
			},
			{
				id: "after1",
				type: "action",
				config: { targetType: "self", actionType: "update_field", newStatus: "after" },
			},
		];

		const nodes: Node[] = [
			{ id: "loop1", type: "loopNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "cond1", type: "conditionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "yes1", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "no1", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "after1", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
		];

		const edges: Edge[] = [
			{ id: "e-loop-each", source: "loop1", target: "cond1", sourceHandle: "each", data: { branchType: "each" } },
			{ id: "e-loop-after", source: "loop1", target: "after1", sourceHandle: "after", data: { branchType: "after" } },
			{ id: "e-cond-yes", source: "cond1", target: "yes1", sourceHandle: "yes", data: { branchType: "yes" } },
			{ id: "e-cond-no", source: "cond1", target: "no1", sourceHandle: "no", data: { branchType: "no" } },
		];

		const result = computeLayout(nodes, edges, workflowNodes);
		const loop = result.find((n) => n.id === "loop1");
		const after = result.find((n) => n.id === "after1");
		const noNode = result.find((n) => n.id === "no1");

		expect(loop).toBeDefined();
		expect(after).toBeDefined();
		expect(noNode).toBeDefined();

		const loopCenterX = loop!.position.x + LOOP_NODE_WIDTH / 2;
		const afterCenterX = after!.position.x + NODE_WIDTH / 2;
		const noCenterX = noNode!.position.x + NODE_WIDTH / 2;

		// After Last should still converge back under the loop column.
		expect(Math.abs(afterCenterX - loopCenterX)).toBeLessThanOrEqual(1);
		expect(noCenterX).toBeGreaterThan(afterCenterX);
	});

	it("keeps empty After Last terminal centered when loop body stays in the main column", () => {
		const workflowNodes: WorkflowNode[] = [
			{ id: "loop1", type: "loop", nextNodeId: "body1" },
			{
				id: "body1",
				type: "action",
				config: { targetType: "self", actionType: "update_field", newStatus: "done" },
			},
		];

		const nodes: Node[] = [
			{ id: "loop1", type: "loopNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "body1", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
			{
				id: "__terminal__loop1-after",
				type: "terminalNode",
				data: {},
				position: { x: 0, y: 0 },
			},
		];

		const edges: Edge[] = [
			{ id: "e-loop-each", source: "loop1", target: "body1", sourceHandle: "each", data: { branchType: "each" } },
			{
				id: "e-loop-after-terminal",
				source: "loop1",
				target: "__terminal__loop1-after",
				sourceHandle: "after",
				type: "afterLastEdge",
				data: { branchType: "after", isTerminal: true },
			},
		];

		const result = computeLayout(nodes, edges, workflowNodes);
		const loop = result.find((n) => n.id === "loop1");
		const afterTerminal = result.find((n) => n.id === "__terminal__loop1-after");

		expect(loop).toBeDefined();
		expect(afterTerminal).toBeDefined();

		const loopCenterX = loop!.position.x + LOOP_NODE_WIDTH / 2;
		expect(Math.abs(afterTerminal!.position.x - (loopCenterX - 2))).toBeLessThanOrEqual(1);
	});

	it("keeps the main loop column vertically aligned despite nested right branches", () => {
		const workflowNodes: WorkflowNode[] = [
			{
				id: "fetch1",
				type: "fetch_records",
				config: { entityType: "quote" },
				nextNodeId: "loop1",
			},
			{
				id: "loop1",
				type: "loop",
				nextNodeId: "cond1",
			},
			{
				id: "cond1",
				type: "condition",
				nextNodeId: "yes1",
				elseNodeId: "no1",
			},
			{
				id: "yes1",
				type: "action",
				config: { targetType: "self", actionType: "update_field", newStatus: "done" },
			},
			{
				id: "no1",
				type: "action",
				config: { targetType: "self", actionType: "update_field", newStatus: "pending" },
			},
		];

		const nodes: Node[] = [
			{ id: "fetch1", type: "fetchNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "loop1", type: "loopNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "cond1", type: "conditionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "yes1", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "no1", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
		];

		const edges: Edge[] = [
			{ id: "e-fetch-loop", source: "fetch1", target: "loop1", data: { branchType: "next" } },
			{ id: "e-loop-cond", source: "loop1", target: "cond1", sourceHandle: "each", data: { branchType: "each" } },
			{ id: "e-cond-yes", source: "cond1", target: "yes1", sourceHandle: "yes", data: { branchType: "yes" } },
			{ id: "e-cond-no", source: "cond1", target: "no1", sourceHandle: "no", data: { branchType: "no" } },
		];

		const result = computeLayout(nodes, edges, workflowNodes);
		const fetch = result.find((n) => n.id === "fetch1");
		const loop = result.find((n) => n.id === "loop1");
		const condition = result.find((n) => n.id === "cond1");
		const yesNode = result.find((n) => n.id === "yes1");

		expect(fetch).toBeDefined();
		expect(loop).toBeDefined();
		expect(condition).toBeDefined();
		expect(yesNode).toBeDefined();

		const fetchCenterX = fetch!.position.x + NODE_WIDTH / 2;
		const loopCenterX = loop!.position.x + LOOP_NODE_WIDTH / 2;
		const conditionCenterX = condition!.position.x + NODE_WIDTH / 2;
		const yesCenterX = yesNode!.position.x + NODE_WIDTH / 2;

		expect(Math.abs(fetchCenterX - loopCenterX)).toBeLessThanOrEqual(1);
		expect(Math.abs(conditionCenterX - loopCenterX)).toBeLessThanOrEqual(1);
		expect(Math.abs(yesCenterX - loopCenterX)).toBeLessThanOrEqual(1);
	});

	it("pushes nested condition no branches farther right than ancestor no branches", () => {
		const workflowNodes: WorkflowNode[] = [
			{
				id: "cond1",
				type: "condition",
				nextNodeId: "cond2",
				elseNodeId: "no1",
			},
			{
				id: "cond2",
				type: "condition",
				nextNodeId: "yes2",
				elseNodeId: "no2",
			},
			{
				id: "no1",
				type: "action",
				config: { targetType: "self", actionType: "update_field", newStatus: "first-no" },
			},
			{
				id: "no2",
				type: "action",
				config: { targetType: "self", actionType: "update_field", newStatus: "second-no" },
			},
			{
				id: "yes2",
				type: "action",
				config: { targetType: "self", actionType: "update_field", newStatus: "done" },
			},
		];

		const nodes: Node[] = [
			{ id: "cond1", type: "conditionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "cond2", type: "conditionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "no1", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "no2", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "yes2", type: "actionNode", data: {}, position: { x: 0, y: 0 } },
		];

		const edges: Edge[] = [
			{ id: "e-cond1-yes", source: "cond1", target: "cond2", sourceHandle: "yes", data: { branchType: "yes" } },
			{ id: "e-cond1-no", source: "cond1", target: "no1", sourceHandle: "no", data: { branchType: "no" } },
			{ id: "e-cond2-yes", source: "cond2", target: "yes2", sourceHandle: "yes", data: { branchType: "yes" } },
			{ id: "e-cond2-no", source: "cond2", target: "no2", sourceHandle: "no", data: { branchType: "no" } },
		];

		const result = computeLayout(nodes, edges, workflowNodes);
		const firstNo = result.find((n) => n.id === "no1");
		const secondNo = result.find((n) => n.id === "no2");

		expect(firstNo).toBeDefined();
		expect(secondNo).toBeDefined();

		const firstNoCenterX = firstNo!.position.x + NODE_WIDTH / 2;
		const secondNoCenterX = secondNo!.position.x + NODE_WIDTH / 2;

		expect(secondNoCenterX).toBeGreaterThan(firstNoCenterX);
	});

	it("keeps nested no terminals farther right inside loop bodies", () => {
		const workflowNodes = [
			{
				id: "loop1",
				type: "loop",
				nextNodeId: "cond1",
			},
			{
				id: "cond1",
				type: "condition",
				nextNodeId: "cond2",
				elseNodeId: "placeholder1",
			},
			{
				id: "cond2",
				type: "condition",
			},
			{
				id: "placeholder1",
				type: "placeholder",
			},
		] as WorkflowNode[];

		const nodes: Node[] = [
			{ id: "loop1", type: "loopNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "cond1", type: "conditionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "cond2", type: "conditionNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "placeholder1", type: "placeholderNode", data: {}, position: { x: 0, y: 0 } },
			{ id: "__terminal__cond2-no", type: "terminalNode", data: {}, position: { x: 0, y: 0 } },
		];

		const edges: Edge[] = [
			{ id: "e-loop-cond1", source: "loop1", target: "cond1", sourceHandle: "each", data: { branchType: "each" } },
			{ id: "e-cond1-yes", source: "cond1", target: "cond2", sourceHandle: "yes", data: { branchType: "yes" } },
			{ id: "e-cond1-no", source: "cond1", target: "placeholder1", sourceHandle: "no", data: { branchType: "no" } },
			{
				id: "e-cond2-no-terminal",
				source: "cond2",
				target: "__terminal__cond2-no",
				sourceHandle: "no",
				data: { branchType: "no", isTerminal: true },
				type: "branchLabelEdge",
			},
		];

		const result = computeLayout(nodes, edges, workflowNodes);
		const placeholder = result.find((n) => n.id === "placeholder1");
		const nestedNoTerminal = result.find((n) => n.id === "__terminal__cond2-no");

		expect(placeholder).toBeDefined();
		expect(nestedNoTerminal).toBeDefined();

		const placeholderCenterX = placeholder!.position.x + NODE_WIDTH / 2;
		expect(nestedNoTerminal!.position.x).toBeGreaterThan(placeholderCenterX);
	});
});
