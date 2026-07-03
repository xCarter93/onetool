import { describe, it, expect } from "vitest";
import {
	automationToReactFlow,
	reactFlowToFlatArray,
	TRIGGER_NODE_ID,
	TRIGGER_PLACEHOLDER_ID,
	RF_NODE_TYPES,
	RF_EDGE_TYPES,
	isTerminalId,
	type EditorNode,
} from "./flow-adapter";
import type {
	ActionNodeConfig,
	ConditionNodeConfig,
	TriggerConfig,
	WorkflowNode,
} from "./node-types";

const makeTrigger = (overrides?: Partial<TriggerConfig>): TriggerConfig => ({
	type: "status_changed",
	objectType: "client",
	toStatus: "active",
	...overrides,
});

const updateStatusAction = (newStatus: string): ActionNodeConfig => ({
	kind: "action",
	action: {
		type: "update_field",
		target: "self",
		field: "status",
		value: { kind: "static", value: newStatus },
	},
});

const updateClientStatusAction = (newStatus: string): ActionNodeConfig => ({
	kind: "action",
	action: {
		type: "update_field",
		target: { related: "client" },
		field: "status",
		value: { kind: "static", value: newStatus },
	},
});

const statusEqualsCondition = (value: string): ConditionNodeConfig => ({
	kind: "condition",
	logic: "and",
	groups: [
		{
			logic: "and",
			rules: [{ field: "status", operator: "equals", value: { kind: "static", value } }],
		},
	],
});

describe("flow-adapter", () => {
	it("converts null trigger with no nodes to placeholder only", () => {
		const result = automationToReactFlow(null, []);
		// Placeholder node only — no terminal stub, placeholder IS the interaction point
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0].id).toBe(TRIGGER_PLACEHOLDER_ID);
		expect(result.edges).toHaveLength(0);
	});

	it("creates trigger RF node from TriggerConfig", () => {
		const trigger = makeTrigger();
		const result = automationToReactFlow(trigger, []);
		// Trigger + terminal stub
		expect(result.nodes).toHaveLength(2);
		expect(result.nodes[0].id).toBe(TRIGGER_NODE_ID);
		expect(result.nodes[0].type).toBe("triggerNode");
		expect((result.nodes[0].data as { trigger: TriggerConfig }).trigger).toEqual(trigger);
	});

	it("converts single action node to RF format", () => {
		const trigger = makeTrigger();
		const nodes: EditorNode[] = [
			{
				id: "a1",
				type: "action",
				config: updateStatusAction("active"),
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
		const nodes: EditorNode[] = [
			{
				id: "a1",
				type: "action",
				config: updateStatusAction("active"),
				nextNodeId: "a2",
			},
			{
				id: "a2",
				type: "action",
				config: updateClientStatusAction("inactive"),
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
		const nodes: EditorNode[] = [
			{
				id: "c1",
				type: "condition",
				config: statusEqualsCondition("active"),
				nextNodeId: "a1",
				elseNodeId: "a2",
			},
			{
				id: "a1",
				type: "action",
				config: updateStatusAction("completed"),
			},
			{
				id: "a2",
				type: "action",
				config: updateClientStatusAction("inactive"),
			},
		];

		const result = automationToReactFlow(trigger, nodes);

		// Find branch edges from c1
		const yesEdge = result.edges.find((e) => e.source === "c1" && e.target === "a1");
		const noEdge = result.edges.find((e) => e.source === "c1" && e.target === "a2");

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
		const originalNodes: EditorNode[] = [
			{
				id: "a1",
				type: "action",
				config: updateStatusAction("active"),
			},
		];

		const rf = automationToReactFlow(trigger, originalNodes);
		const result = reactFlowToFlatArray(rf.nodes, rf.edges);

		expect(result.trigger).toEqual(trigger);
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0].id).toBe("a1");
		expect(result.nodes[0].type).toBe("action");
		expect(result.nodes[0].config).toEqual((originalNodes[0] as WorkflowNode).config);
		// Single node has no outgoing pointer
		expect(result.nodes[0].nextNodeId).toBeUndefined();
		expect(result.nodes[0].elseNodeId).toBeUndefined();
	});

	it("round-trips condition with branches without data loss", () => {
		const trigger = makeTrigger();
		const originalNodes: EditorNode[] = [
			{
				id: "c1",
				type: "condition",
				config: statusEqualsCondition("active"),
				nextNodeId: "a1",
				elseNodeId: "a2",
			},
			{
				id: "a1",
				type: "action",
				config: updateStatusAction("completed"),
			},
			{
				id: "a2",
				type: "action",
				config: updateClientStatusAction("inactive"),
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
		expect(c1!.config).toEqual((originalNodes[0] as WorkflowNode).config);

		const a1 = result.nodes.find((n) => n.id === "a1");
		expect(a1!.config).toEqual((originalNodes[1] as WorkflowNode).config);

		const a2 = result.nodes.find((n) => n.id === "a2");
		expect(a2!.config).toEqual((originalNodes[2] as WorkflowNode).config);
	});

	it("round-trips complex graph preserving all structure", () => {
		const trigger = makeTrigger({ objectType: "project", toStatus: "completed" });
		const originalNodes: EditorNode[] = [
			{
				id: "c1",
				type: "condition",
				config: statusEqualsCondition("in-progress"),
				nextNodeId: "a1",
				elseNodeId: "a2",
			},
			{
				id: "a1",
				type: "action",
				config: updateStatusAction("completed"),
				nextNodeId: "a3",
			},
			{
				id: "a2",
				type: "action",
				config: updateClientStatusAction("inactive"),
			},
			{
				id: "a3",
				type: "action",
				config: updateClientStatusAction("active"),
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
		const nodes: EditorNode[] = [
			{
				id: "c1",
				type: "condition",
				config: statusEqualsCondition("active"),
				nextNodeId: "a1",
				elseNodeId: "a2",
			},
			{ id: "a1", type: "action", config: updateStatusAction("done") },
			{ id: "a2", type: "action", config: updateClientStatusAction("inactive") },
		];

		const result = automationToReactFlow(trigger, nodes);
		const yesEdge = result.edges.find((e) => e.source === "c1" && e.target === "a1");
		const noEdge = result.edges.find((e) => e.source === "c1" && e.target === "a2");

		expect(yesEdge!.data?.branchType).toBe("yes");
		expect(noEdge!.data?.branchType).toBe("no");
	});

	it("all loop edges have branchType metadata", () => {
		const trigger = makeTrigger();
		const nodes: EditorNode[] = [
			{
				id: "loop1",
				type: "loop",
				nextNodeId: "b1",
				elseNodeId: "a1",
			},
			{ id: "b1", type: "action", config: updateStatusAction("done") },
			{ id: "a1", type: "action", config: updateClientStatusAction("inactive") },
		];

		const result = automationToReactFlow(trigger, nodes);
		const eachEdge = result.edges.find((e) => e.source === "loop1" && e.target === "b1");
		const afterEdge = result.edges.find((e) => e.source === "loop1" && e.target === "a1");

		expect(eachEdge!.data?.branchType).toBe("each");
		expect(afterEdge!.data?.branchType).toBe("after");
	});

	it("linear edges have branchType next", () => {
		const trigger = makeTrigger();
		const nodes: EditorNode[] = [
			{
				id: "a1",
				type: "action",
				config: updateStatusAction("done"),
				nextNodeId: "a2",
			},
			{ id: "a2", type: "action", config: updateClientStatusAction("inactive") },
		];

		const result = automationToReactFlow(trigger, nodes);
		const chainEdge = result.edges.find((e) => e.source === "a1" && e.target === "a2");
		expect(chainEdge!.data?.branchType).toBe("next");
		expect(chainEdge!.type).toBe(RF_EDGE_TYPES.straight);
	});

	it("trigger-to-root edge has branchType next", () => {
		const trigger = makeTrigger();
		const nodes: EditorNode[] = [
			{ id: "a1", type: "action", config: updateStatusAction("done") },
		];

		const result = automationToReactFlow(trigger, nodes);
		const triggerEdge = result.edges.find((e) => e.source === TRIGGER_NODE_ID && e.target === "a1");
		expect(triggerEdge!.data?.branchType).toBe("next");
		expect(triggerEdge!.type).toBe(RF_EDGE_TYPES.straight);
	});

	it("terminal stub edges inherit branchType", () => {
		const trigger = makeTrigger();
		const nodes: EditorNode[] = [
			{
				id: "c1",
				type: "condition",
				config: statusEqualsCondition("active"),
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
		const nodes: EditorNode[] = [
			{
				id: "c1",
				type: "condition",
				config: statusEqualsCondition("active"),
				nextNodeId: "a1",
				elseNodeId: "a2",
			},
			{ id: "a1", type: "action", config: updateStatusAction("done") },
			{ id: "a2", type: "action", config: updateClientStatusAction("inactive") },
		];

		const result = automationToReactFlow(trigger, nodes);
		const yesEdge = result.edges.find((e) => e.source === "c1" && e.target === "a1");
		const noEdge = result.edges.find((e) => e.source === "c1" && e.target === "a2");

		expect(yesEdge!.id).toContain("-yes-");
		expect(noEdge!.id).toContain("-no-");
	});

	it("round-trips loop node with branches without data loss", () => {
		const trigger = makeTrigger();
		const originalNodes: EditorNode[] = [
			{
				id: "loop1",
				type: "loop",
				nextNodeId: "b1",
				elseNodeId: "a1",
			},
			{ id: "b1", type: "action", config: updateStatusAction("done") },
			{ id: "a1", type: "action", config: updateClientStatusAction("inactive") },
		];

		const rf = automationToReactFlow(trigger, originalNodes);
		const result = reactFlowToFlatArray(rf.nodes, rf.edges);

		expect(result.nodes).toHaveLength(3);
		const loop = result.nodes.find((n) => n.id === "loop1");
		expect(loop!.nextNodeId).toBe("b1");
		expect(loop!.elseNodeId).toBe("a1");
	});

	it("routes loop-back from a condition's yes terminal when the loop body ends at a condition", () => {
		const trigger = makeTrigger();
		const nodes: EditorNode[] = [
			{
				id: "loop1",
				type: "loop",
				nextNodeId: "cond1",
			},
			{
				id: "cond1",
				type: "condition",
				config: statusEqualsCondition("active"),
			},
		];

		const result = automationToReactFlow(trigger, nodes);
		const loopBackEdge = result.edges.find((e) => e.data?.branchType === "loop_back");

		expect(loopBackEdge).toBeDefined();
		expect(loopBackEdge!.source).toBe("__terminal__cond1-yes");
		expect(loopBackEdge!.target).toBe("loop1");
	});

	it("RF_EDGE_TYPES has straight, branchLabel, loopBack, and afterLast", () => {
		expect(RF_EDGE_TYPES.straight).toBe("straightEdge");
		expect(RF_EDGE_TYPES.branchLabel).toBe("branchLabelEdge");
		expect(RF_EDGE_TYPES.loopBack).toBe("loopBackEdge");
		expect(RF_EDGE_TYPES.afterLast).toBe("afterLastEdge");
		// plusButton should not exist
		expect((RF_EDGE_TYPES as Record<string, string>).plusButton).toBeUndefined();
	});

	it("filters out placeholder nodes when serializing", () => {
		const trigger = makeTrigger();
		const nodes: EditorNode[] = [
			{ id: "p1", type: "placeholder" },
		];

		const rf = automationToReactFlow(trigger, nodes);
		const result = reactFlowToFlatArray(rf.nodes, rf.edges);
		expect(result.nodes).toHaveLength(0);
	});
});
