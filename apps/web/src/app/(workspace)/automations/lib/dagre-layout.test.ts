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
				sourceHandle: "center",
				data: { branchType: "yes", isTerminal: true },
			},
			{
				id: "e3",
				source: "cond1",
				target: "__terminal__cond1-no",
				sourceHandle: "center",
				data: { branchType: "no", isTerminal: true },
			},
		];

		const result = computeLayout(nodes, edges);
		// No merge nodes should exist
		const mergeNodes = result.filter((n) => n.id.startsWith("__merge__"));
		expect(mergeNodes).toHaveLength(0);
	});
});
