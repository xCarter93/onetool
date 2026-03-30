import { describe, it, expect } from "vitest";
import {
	automationToReactFlow,
	reactFlowToFlatArray,
	TRIGGER_NODE_ID,
	TRIGGER_PLACEHOLDER_ID,
	RF_NODE_TYPES,
	RF_EDGE_TYPES,
	isTerminalId,
} from "./flow-adapter";
import type { WorkflowNode } from "../components/workflow-node";
import type { TriggerConfig } from "../components/trigger-node";

const makeTrigger = (
	overrides?: Partial<TriggerConfig>
): TriggerConfig => ({
	objectType: "client",
	toStatus: "active",
	...overrides,
});

describe("flow-adapter", () => {
	it("converts null trigger with no nodes to placeholder with terminal stub", () => {
		const result = automationToReactFlow(null, []);
		// Placeholder node + terminal stub
		expect(result.nodes).toHaveLength(2);
		expect(result.nodes[0].id).toBe(TRIGGER_PLACEHOLDER_ID);
		expect(isTerminalId(result.nodes[1].id)).toBe(true);
		expect(result.edges).toHaveLength(1);
	});

	it("creates trigger RF node from TriggerConfig", () => {
		const trigger = makeTrigger();
		const result = automationToReactFlow(trigger, []);
		// Trigger + terminal stub
		expect(result.nodes).toHaveLength(2);
		expect(result.nodes[0].id).toBe(TRIGGER_NODE_ID);
		expect(result.nodes[0].type).toBe("triggerNode");
		expect(result.nodes[0].data.trigger).toEqual(trigger);
	});

	it("converts single action node to RF format", () => {
		const trigger = makeTrigger();
		const nodes: WorkflowNode[] = [
			{
				id: "a1",
				type: "action",
				action: {
					targetType: "self",
					actionType: "update_status",
					newStatus: "active",
				},
			},
		];

		const result = automationToReactFlow(trigger, nodes);
		// 3 RF nodes: trigger + action + terminal stub for action
		expect(result.nodes).toHaveLength(3);
		// 2 edges: trigger -> action, action -> terminal
		expect(result.edges).toHaveLength(2);
		const triggerEdge = result.edges.find((e) => e.source === TRIGGER_NODE_ID);
		expect(triggerEdge!.target).toBe("a1");
	});

	it("converts linear chain to sequential RF edges", () => {
		const trigger = makeTrigger();
		const nodes: WorkflowNode[] = [
			{
				id: "a1",
				type: "action",
				action: {
					targetType: "self",
					actionType: "update_status",
					newStatus: "active",
				},
				nextNodeId: "a2",
			},
			{
				id: "a2",
				type: "action",
				action: {
					targetType: "client",
					actionType: "update_status",
					newStatus: "inactive",
				},
			},
		];

		const result = automationToReactFlow(trigger, nodes);
		// 4 nodes: trigger + a1 + a2 + terminal stub for a2
		expect(result.nodes).toHaveLength(4);

		const triggerEdge = result.edges.find((e) => e.source === TRIGGER_NODE_ID);
		expect(triggerEdge).toBeDefined();
		expect(triggerEdge!.target).toBe("a1");
		expect(triggerEdge!.type).toBe(RF_EDGE_TYPES.straight);

		const chainEdge = result.edges.find((e) => e.source === "a1");
		expect(chainEdge).toBeDefined();
		expect(chainEdge!.target).toBe("a2");
		expect(chainEdge!.type).toBe(RF_EDGE_TYPES.straight);
	});

	it("converts condition node to branching RF edges", () => {
		const trigger = makeTrigger();
		const nodes: WorkflowNode[] = [
			{
				id: "c1",
				type: "condition",
				condition: {
					field: "status",
					operator: "equals",
					value: "active",
				},
				nextNodeId: "a1",
				elseNodeId: "a2",
			},
			{
				id: "a1",
				type: "action",
				action: {
					targetType: "self",
					actionType: "update_status",
					newStatus: "completed",
				},
			},
			{
				id: "a2",
				type: "action",
				action: {
					targetType: "client",
					actionType: "update_status",
					newStatus: "inactive",
				},
			},
		];

		const result = automationToReactFlow(trigger, nodes);

		// Find branch edges from c1
		const yesEdge = result.edges.find(
			(e) => e.source === "c1" && e.target === "a1"
		);
		const noEdge = result.edges.find(
			(e) => e.source === "c1" && e.target === "a2"
		);

		expect(yesEdge).toBeDefined();
		expect(yesEdge!.type).toBe(RF_EDGE_TYPES.branchLabel);
		expect(yesEdge!.data?.variant).toBe("yes");
		expect(yesEdge!.data?.label).toBe("Yes");

		expect(noEdge).toBeDefined();
		expect(noEdge!.type).toBe(RF_EDGE_TYPES.branchLabel);
		expect(noEdge!.data?.variant).toBe("no");
		expect(noEdge!.data?.label).toBe("No");
	});

	it("round-trips single action without data loss", () => {
		const trigger = makeTrigger();
		const originalNodes: WorkflowNode[] = [
			{
				id: "a1",
				type: "action",
				action: {
					targetType: "self",
					actionType: "update_status",
					newStatus: "active",
				},
			},
		];

		const rf = automationToReactFlow(trigger, originalNodes);
		const result = reactFlowToFlatArray(rf.nodes, rf.edges);

		expect(result.trigger).toEqual(trigger);
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0].id).toBe("a1");
		expect(result.nodes[0].type).toBe("action");
		expect(result.nodes[0].action).toEqual(originalNodes[0].action);
		// Single node has no outgoing pointer
		expect(result.nodes[0].nextNodeId).toBeUndefined();
		expect(result.nodes[0].elseNodeId).toBeUndefined();
	});

	it("round-trips condition with branches without data loss", () => {
		const trigger = makeTrigger();
		const originalNodes: WorkflowNode[] = [
			{
				id: "c1",
				type: "condition",
				condition: {
					field: "status",
					operator: "equals",
					value: "active",
				},
				nextNodeId: "a1",
				elseNodeId: "a2",
			},
			{
				id: "a1",
				type: "action",
				action: {
					targetType: "self",
					actionType: "update_status",
					newStatus: "completed",
				},
			},
			{
				id: "a2",
				type: "action",
				action: {
					targetType: "client",
					actionType: "update_status",
					newStatus: "inactive",
				},
			},
		];

		const rf = automationToReactFlow(trigger, originalNodes);
		const result = reactFlowToFlatArray(rf.nodes, rf.edges);

		expect(result.trigger).toEqual(trigger);
		expect(result.nodes).toHaveLength(3);

		const c1 = result.nodes.find((n) => n.id === "c1");
		expect(c1).toBeDefined();
		expect(c1!.nextNodeId).toBe("a1");
		expect(c1!.elseNodeId).toBe("a2");
		expect(c1!.condition).toEqual(originalNodes[0].condition);

		const a1 = result.nodes.find((n) => n.id === "a1");
		expect(a1!.action).toEqual(originalNodes[1].action);

		const a2 = result.nodes.find((n) => n.id === "a2");
		expect(a2!.action).toEqual(originalNodes[2].action);
	});

	it("round-trips complex graph preserving all structure", () => {
		const trigger = makeTrigger({ objectType: "project", toStatus: "completed" });
		const originalNodes: WorkflowNode[] = [
			{
				id: "c1",
				type: "condition",
				condition: {
					field: "status",
					operator: "equals",
					value: "in-progress",
				},
				nextNodeId: "a1",
				elseNodeId: "a2",
			},
			{
				id: "a1",
				type: "action",
				action: {
					targetType: "self",
					actionType: "update_status",
					newStatus: "completed",
				},
				nextNodeId: "a3",
			},
			{
				id: "a2",
				type: "action",
				action: {
					targetType: "client",
					actionType: "update_status",
					newStatus: "inactive",
				},
			},
			{
				id: "a3",
				type: "action",
				action: {
					targetType: "client",
					actionType: "update_status",
					newStatus: "active",
				},
			},
		];

		const rf = automationToReactFlow(trigger, originalNodes);
		const result = reactFlowToFlatArray(rf.nodes, rf.edges);

		expect(result.trigger).toEqual(trigger);
		expect(result.nodes).toHaveLength(4);

		// Verify all pointers survived round-trip
		const c1 = result.nodes.find((n) => n.id === "c1");
		expect(c1!.nextNodeId).toBe("a1");
		expect(c1!.elseNodeId).toBe("a2");

		const a1 = result.nodes.find((n) => n.id === "a1");
		expect(a1!.nextNodeId).toBe("a3");
		expect(a1!.elseNodeId).toBeUndefined();

		const a2 = result.nodes.find((n) => n.id === "a2");
		expect(a2!.nextNodeId).toBeUndefined();

		const a3 = result.nodes.find((n) => n.id === "a3");
		expect(a3!.nextNodeId).toBeUndefined();
	});

	it("trigger node gets ID constant TRIGGER_NODE_ID and type triggerNode", () => {
		expect(TRIGGER_NODE_ID).toBe("__trigger__");
		expect(RF_NODE_TYPES.trigger).toBe("triggerNode");

		const trigger = makeTrigger();
		const result = automationToReactFlow(trigger, []);
		const triggerNode = result.nodes.find((n) => n.id === TRIGGER_NODE_ID);
		expect(triggerNode).toBeDefined();
		expect(triggerNode!.type).toBe("triggerNode");
	});

	// --- branchType metadata tests ---

	it("all condition edges have branchType metadata", () => {
		const trigger = makeTrigger();
		const nodes: WorkflowNode[] = [
			{
				id: "c1",
				type: "condition",
				condition: { field: "status", operator: "equals", value: "active" },
				nextNodeId: "a1",
				elseNodeId: "a2",
			},
			{
				id: "a1",
				type: "action",
				action: { targetType: "self", actionType: "update_status", newStatus: "done" },
			},
			{
				id: "a2",
				type: "action",
				action: { targetType: "client", actionType: "update_status", newStatus: "inactive" },
			},
		];

		const result = automationToReactFlow(trigger, nodes);
		const yesEdge = result.edges.find((e) => e.source === "c1" && e.target === "a1");
		const noEdge = result.edges.find((e) => e.source === "c1" && e.target === "a2");

		expect(yesEdge!.data?.branchType).toBe("yes");
		expect(noEdge!.data?.branchType).toBe("no");
	});

	it("all loop edges have branchType metadata", () => {
		const trigger = makeTrigger();
		const nodes: WorkflowNode[] = [
			{
				id: "loop1",
				type: "loop",
				nextNodeId: "b1",
				elseNodeId: "a1",
			},
			{
				id: "b1",
				type: "action",
				action: { targetType: "self", actionType: "update_status", newStatus: "done" },
			},
			{
				id: "a1",
				type: "action",
				action: { targetType: "client", actionType: "update_status", newStatus: "inactive" },
			},
		];

		const result = automationToReactFlow(trigger, nodes);
		const eachEdge = result.edges.find((e) => e.source === "loop1" && e.target === "b1");
		const afterEdge = result.edges.find((e) => e.source === "loop1" && e.target === "a1");

		expect(eachEdge!.data?.branchType).toBe("each");
		expect(afterEdge!.data?.branchType).toBe("after");
	});

	it("linear edges have branchType next", () => {
		const trigger = makeTrigger();
		const nodes: WorkflowNode[] = [
			{
				id: "a1",
				type: "action",
				action: { targetType: "self", actionType: "update_status", newStatus: "done" },
				nextNodeId: "a2",
			},
			{
				id: "a2",
				type: "action",
				action: { targetType: "client", actionType: "update_status", newStatus: "inactive" },
			},
		];

		const result = automationToReactFlow(trigger, nodes);
		const chainEdge = result.edges.find((e) => e.source === "a1" && e.target === "a2");
		expect(chainEdge!.data?.branchType).toBe("next");
		expect(chainEdge!.type).toBe(RF_EDGE_TYPES.straight);
	});

	it("trigger-to-root edge has branchType next", () => {
		const trigger = makeTrigger();
		const nodes: WorkflowNode[] = [
			{
				id: "a1",
				type: "action",
				action: { targetType: "self", actionType: "update_status", newStatus: "done" },
			},
		];

		const result = automationToReactFlow(trigger, nodes);
		const triggerEdge = result.edges.find((e) => e.source === TRIGGER_NODE_ID && e.target === "a1");
		expect(triggerEdge!.data?.branchType).toBe("next");
		expect(triggerEdge!.type).toBe(RF_EDGE_TYPES.straight);
	});

	it("terminal stub edges inherit branchType", () => {
		const trigger = makeTrigger();
		const nodes: WorkflowNode[] = [
			{
				id: "c1",
				type: "condition",
				condition: { field: "status", operator: "equals", value: "active" },
				// No nextNodeId or elseNodeId - both are terminal stubs
			},
		];

		const result = automationToReactFlow(trigger, nodes);
		const terminalEdges = result.edges.filter((e) => e.data?.isTerminal === true && e.source === "c1");
		expect(terminalEdges).toHaveLength(2);

		const yesTerminal = terminalEdges.find((e) => e.sourceHandle === "yes");
		const noTerminal = terminalEdges.find((e) => e.sourceHandle === "no");

		expect(yesTerminal!.data?.branchType).toBe("yes");
		expect(noTerminal!.data?.branchType).toBe("no");
	});

	it("edge IDs include sourceHandle for condition branches", () => {
		const trigger = makeTrigger();
		const nodes: WorkflowNode[] = [
			{
				id: "c1",
				type: "condition",
				condition: { field: "status", operator: "equals", value: "active" },
				nextNodeId: "a1",
				elseNodeId: "a2",
			},
			{
				id: "a1",
				type: "action",
				action: { targetType: "self", actionType: "update_status", newStatus: "done" },
			},
			{
				id: "a2",
				type: "action",
				action: { targetType: "client", actionType: "update_status", newStatus: "inactive" },
			},
		];

		const result = automationToReactFlow(trigger, nodes);
		const yesEdge = result.edges.find((e) => e.source === "c1" && e.target === "a1");
		const noEdge = result.edges.find((e) => e.source === "c1" && e.target === "a2");

		expect(yesEdge!.id).toContain("-yes-");
		expect(noEdge!.id).toContain("-no-");
	});

	it("round-trips loop node with branches without data loss", () => {
		const trigger = makeTrigger();
		const originalNodes: WorkflowNode[] = [
			{
				id: "loop1",
				type: "loop",
				nextNodeId: "b1",
				elseNodeId: "a1",
			},
			{
				id: "b1",
				type: "action",
				action: { targetType: "self", actionType: "update_status", newStatus: "done" },
			},
			{
				id: "a1",
				type: "action",
				action: { targetType: "client", actionType: "update_status", newStatus: "inactive" },
			},
		];

		const rf = automationToReactFlow(trigger, originalNodes);
		const result = reactFlowToFlatArray(rf.nodes, rf.edges);

		expect(result.nodes).toHaveLength(3);
		const loop = result.nodes.find((n) => n.id === "loop1");
		expect(loop!.nextNodeId).toBe("b1");
		expect(loop!.elseNodeId).toBe("a1");
	});

	it("RF_EDGE_TYPES has straight, branchLabel, loopBack, and afterLast", () => {
		expect(RF_EDGE_TYPES.straight).toBe("straightEdge");
		expect(RF_EDGE_TYPES.branchLabel).toBe("branchLabelEdge");
		expect(RF_EDGE_TYPES.loopBack).toBe("loopBackEdge");
		expect(RF_EDGE_TYPES.afterLast).toBe("afterLastEdge");
		// plusButton should not exist
		expect((RF_EDGE_TYPES as Record<string, string>).plusButton).toBeUndefined();
	});
});
