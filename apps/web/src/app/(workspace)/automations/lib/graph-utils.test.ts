import { describe, it, expect } from "vitest";
import { collectSubtree, collectLoopBody, findParent } from "./graph-utils";
import type { WorkflowNode } from "../components/workflow-node";

describe("graph-utils", () => {
	describe("collectSubtree", () => {
		it("traverses both nextNodeId and elseNodeId and returns all descendant IDs", () => {
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
					nextNodeId: "a3",
				},
				{
					id: "a2",
					type: "action",
					action: { targetType: "client", actionType: "update_status", newStatus: "inactive" },
				},
				{
					id: "a3",
					type: "action",
					action: { targetType: "self", actionType: "update_status", newStatus: "active" },
				},
			];

			const result = collectSubtree("c1", nodes);
			expect(result).toEqual(new Set(["c1", "a1", "a2", "a3"]));
		});

		it("returns only the node itself for a leaf node", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "a1",
					type: "action",
					action: { targetType: "self", actionType: "update_status", newStatus: "done" },
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
					action: { targetType: "self", actionType: "update_status", newStatus: "done" },
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
					nextNodeId: "b1",
					elseNodeId: "a1",
				},
				{
					id: "b1",
					type: "action",
					action: { targetType: "self", actionType: "update_status", newStatus: "done" },
					nextNodeId: "b2",
				},
				{
					id: "b2",
					type: "action",
					action: { targetType: "self", actionType: "update_status", newStatus: "active" },
				},
				{
					id: "a1",
					type: "action",
					action: { targetType: "client", actionType: "update_status", newStatus: "inactive" },
				},
			];

			const result = collectLoopBody("loop1", nodes);
			expect(result).toEqual(new Set(["loop1", "b1", "b2"]));
			expect(result.has("a1")).toBe(false);
		});

		it("returns only the loop node if it has no nextNodeId", () => {
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
					nextNodeId: "c1",
					elseNodeId: "after1",
				},
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
					nextNodeId: "after2",
				},
				{
					id: "after2",
					type: "action",
					action: { targetType: "client", actionType: "update_status", newStatus: "active" },
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

			const result = findParent("a1", nodes);
			expect(result).toEqual({ parentId: "c1", branch: "next" });
		});

		it("finds parent via elseNodeId and returns branch 'else'", () => {
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

			const result = findParent("a2", nodes);
			expect(result).toEqual({ parentId: "c1", branch: "else" });
		});

		it("returns null parentId and null branch for root node", () => {
			const nodes: WorkflowNode[] = [
				{
					id: "root",
					type: "action",
					action: { targetType: "self", actionType: "update_status", newStatus: "done" },
				},
			];

			const result = findParent("root", nodes);
			expect(result).toEqual({ parentId: null, branch: null });
		});
	});
});
