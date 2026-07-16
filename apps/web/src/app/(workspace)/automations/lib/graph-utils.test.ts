import { describe, it, expect } from "vitest";
import { collectSubtree, collectLoopBody, findParent } from "./graph-utils";
import type { WorkflowNode } from "./node-types";

const action = (newStatus: string): WorkflowNode["config"] => ({
	kind: "action",
	action: {
		type: "update_field",
		target: "self",
		field: "status",
		value: { kind: "static", value: newStatus },
	},
});

const condition = (value: string): WorkflowNode["config"] => ({
	kind: "condition",
	logic: "and",
	groups: [
		{
			logic: "and",
			rules: [{ field: "status", operator: "equals", value: { kind: "static", value } }],
		},
	],
});

describe("graph-utils", () => {
	describe("collectSubtree", () => {
		it("traverses both nextNodeId and elseNodeId and returns all descendant IDs", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "c1",
					type: "condition",
					config: condition("active"),
					nextNodeId: "a1",
					elseNodeId: "a2",
				},
				{
					id: "a1",
					type: "action",
					config: action("done"),
					nextNodeId: "a3",
				},
				{
					id: "a2",
					type: "action",
					config: action("inactive"),
				},
				{
					id: "a3",
					type: "action",
					config: action("active"),
				},
			];

			const result = collectSubtree("c1", nodes);
			expect(result).toEqual(new Set(["c1", "a1", "a2", "a3"]));
		});

		// Regression: deleting a condition must not take its merge continuation
		// with it — those steps run after the branches converge, so they belong
		// to the parent chain (same rule as a loop's After-Last path).
		it("excludeRootMerge keeps the root's continuation but still collects nested merges", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "c1",
					type: "condition",
					config: condition("active"),
					nextNodeId: "c2",
					elseNodeId: "a2",
					mergeNodeId: "keep1",
				},
				{
					id: "c2",
					type: "condition",
					config: condition("done"),
					nextNodeId: "a1",
					// A nested condition's continuation IS inside c1's true branch.
					mergeNodeId: "nested1",
				},
				{ id: "a1", type: "action", config: action("done") },
				{ id: "a2", type: "action", config: action("inactive") },
				{ id: "nested1", type: "action", config: action("active") },
				{ id: "keep1", type: "action", config: action("active"), nextNodeId: "keep2" },
				{ id: "keep2", type: "action", config: action("done") },
			];

			expect(collectSubtree("c1", nodes, { excludeRootMerge: true })).toEqual(
				new Set(["c1", "c2", "a1", "a2", "nested1"])
			);
			// Without the flag the continuation chain is part of the subtree.
			expect(collectSubtree("c1", nodes)).toEqual(
				new Set(["c1", "c2", "a1", "a2", "nested1", "keep1", "keep2"])
			);
		});

		it("returns only the node itself for a leaf node", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "a1",
					type: "action",
					config: action("done"),
				},
			];

			const result = collectSubtree("a1", nodes);
			expect(result).toEqual(new Set(["a1"]));
		});

		it("returns set with nonexistent ID when node is not found", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "a1",
					type: "action",
					config: action("done"),
				},
			];

			const result = collectSubtree("nonexistent", nodes);
			expect(result).toEqual(new Set(["nonexistent"]));
		});
	});

	describe("collectLoopBody", () => {
		it("returns loop node and For Each body subtree, excluding After Last subtree", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "loop1",
					type: "loop",
					bodyStartNodeId: "b1",
					nextNodeId: "a1",
				},
				{
					id: "b1",
					type: "action",
					config: action("done"),
					nextNodeId: "b2",
				},
				{
					id: "b2",
					type: "action",
					config: action("active"),
				},
				{
					id: "a1",
					type: "action",
					config: action("inactive"),
				},
			];

			const result = collectLoopBody("loop1", nodes);
			expect(result).toEqual(new Set(["loop1", "b1", "b2"]));
			expect(result.has("a1")).toBe(false);
		});

		it("returns only the loop node if it has no bodyStartNodeId", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "loop1",
					type: "loop",
				},
			];

			const result = collectLoopBody("loop1", nodes);
			expect(result).toEqual(new Set(["loop1"]));
		});

		it("includes branch descendants inside loop body and excludes After Last subtree", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "loop1",
					type: "loop",
					bodyStartNodeId: "c1",
					nextNodeId: "after1",
				},
				{
					id: "c1",
					type: "condition",
					config: condition("active"),
					nextNodeId: "bodyNext",
					elseNodeId: "bodyElse",
				},
				{
					id: "bodyNext",
					type: "action",
					config: action("done"),
				},
				{
					id: "bodyElse",
					type: "action",
					config: action("draft"),
				},
				{
					id: "after1",
					type: "action",
					config: action("inactive"),
					nextNodeId: "after2",
				},
				{
					id: "after2",
					type: "action",
					config: action("active"),
				},
			];

			const result = collectLoopBody("loop1", nodes);
			expect(result).toEqual(new Set(["loop1", "c1", "bodyNext", "bodyElse"]));
			expect(result.has("after1")).toBe(false);
			expect(result.has("after2")).toBe(false);
		});
	});

	describe("findParent", () => {
		it("finds parent via nextNodeId and returns branch 'next'", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "c1",
					type: "condition",
					config: condition("active"),
					nextNodeId: "a1",
					elseNodeId: "a2",
				},
				{
					id: "a1",
					type: "action",
					config: action("done"),
				},
				{
					id: "a2",
					type: "action",
					config: action("inactive"),
				},
			];

			const result = findParent("a1", nodes);
			expect(result).toEqual({ parentId: "c1", branch: "next" });
		});

		it("finds parent via elseNodeId and returns branch 'else'", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "c1",
					type: "condition",
					config: condition("active"),
					nextNodeId: "a1",
					elseNodeId: "a2",
				},
				{
					id: "a1",
					type: "action",
					config: action("done"),
				},
				{
					id: "a2",
					type: "action",
					config: action("inactive"),
				},
			];

			const result = findParent("a2", nodes);
			expect(result).toEqual({ parentId: "c1", branch: "else" });
		});

		it("finds parent via bodyStartNodeId and returns branch 'body'", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "loop1",
					type: "loop",
					bodyStartNodeId: "b1",
					nextNodeId: "a1",
				},
				{
					id: "b1",
					type: "action",
					config: action("done"),
				},
			];

			const result = findParent("b1", nodes);
			expect(result).toEqual({ parentId: "loop1", branch: "body" });
		});

		it("returns null parentId and null branch for root node", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "root",
					type: "action",
					config: action("done"),
				},
			];

			const result = findParent("root", nodes);
			expect(result).toEqual({ parentId: null, branch: null });
		});
	});
});
