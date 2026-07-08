// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { toSavableNodes, useAutomationEditor } from "./use-automation-editor";
import type { ActionNodeConfig, WorkflowNode } from "../lib/node-types";

vi.mock("convex/react", () => ({
	useQuery: () => undefined,
	useMutation: () => vi.fn(),
}));
vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
	}),
}));

// Regression: condition `source` must be derived from graph position at save
// time, not trusted from config — a stamped {loopNodeId} would otherwise go
// stale when the node moves out of the loop (runtime hard-fails on a stale
// loop ref), and legacy nodes (source unset) would never backfill.
describe("toSavableNodes condition source derivation", () => {
	const fetchNode: WorkflowNode = {
		id: "fetch1",
		type: "fetch_records",
		config: { kind: "fetch_records", objectType: "task", filters: [] },
		nextNodeId: "loop1",
	} as unknown as WorkflowNode;

	const loopNode: WorkflowNode = {
		id: "loop1",
		type: "loop",
		config: { kind: "loop", sourceNodeId: "fetch1" },
		bodyStartNodeId: "cond1",
	} as unknown as WorkflowNode;

	const conditionInLoop: WorkflowNode = {
		id: "cond1",
		type: "condition",
		config: {
			kind: "condition",
			logic: "and",
			groups: [],
		},
	} as unknown as WorkflowNode;

	it("stamps {loopNodeId} for a condition inside a loop body", () => {
		const saved = toSavableNodes([fetchNode, loopNode, conditionInLoop]);
		const cond = saved.find((n) => n.id === "cond1");
		expect(cond?.config).toMatchObject({ source: { loopNodeId: "loop1" } });
	});

	it("stamps 'trigger' for a top-level condition, overriding a stale loop ref", () => {
		const staleCondition: WorkflowNode = {
			id: "cond2",
			type: "condition",
			config: {
				kind: "condition",
				logic: "and",
				groups: [],
				// Stale: claims loop scope but the node is not in any loop body.
				source: { loopNodeId: "loop-deleted" },
			},
		} as unknown as WorkflowNode;
		const saved = toSavableNodes([staleCondition]);
		expect(saved[0].config).toMatchObject({ source: "trigger" });
	});
});

describe("multi-level undo/redo", () => {
	function setup() {
		const rendered = renderHook(() => useAutomationEditor(null));
		// A trigger is required before steps can be inserted.
		act(() => {
			rendered.result.current.handleTriggerTypeSelect("record_created");
		});
		return rendered;
	}

	function insertAction(result: {
		current: ReturnType<typeof useAutomationEditor>;
	}): string {
		// The trigger's terminal edge is the only insertion point on an empty canvas.
		const edgeId = result.current.layoutedEdges[0].id;
		let newId = "";
		act(() => {
			newId = result.current.handleInsertNode(edgeId, "action") ?? "";
		});
		return newId;
	}

	it("undoes and redoes an insertion", () => {
		const { result } = setup();
		expect(result.current.nodes).toHaveLength(0);

		insertAction(result);
		expect(result.current.nodes).toHaveLength(1);
		expect(result.current.canUndo).toBe(true);

		act(() => result.current.handleUndo());
		expect(result.current.nodes).toHaveLength(0);
		expect(result.current.canRedo).toBe(true);

		act(() => result.current.handleRedo());
		expect(result.current.nodes).toHaveLength(1);
		expect(result.current.canRedo).toBe(false);
	});

	it("supports multiple undo levels back to the initial state", () => {
		const { result } = setup();
		insertAction(result);
		insertAction(result);
		expect(result.current.nodes).toHaveLength(2);

		act(() => result.current.handleUndo());
		expect(result.current.nodes).toHaveLength(1);
		act(() => result.current.handleUndo());
		expect(result.current.nodes).toHaveLength(0);
		act(() => result.current.handleUndo()); // undoes the trigger selection
		expect(result.current.trigger).toBeNull();
		expect(result.current.canUndo).toBe(false);
	});

	it("coalesces rapid config edits on one node into a single undo step", () => {
		const { result } = setup();
		const nodeId = insertAction(result);
		const original = result.current.nodes.find((n) => n.id === nodeId) as WorkflowNode;
		const originalConfig = original.config;

		const edited = (message: string): ActionNodeConfig => ({
			kind: "action",
			action: {
				type: "send_notification",
				recipient: "org_admins",
				message,
			},
		});
		act(() => result.current.handleNodeChange(nodeId, { config: edited("a") }));
		act(() => result.current.handleNodeChange(nodeId, { config: edited("ab") }));
		act(() => result.current.handleNodeChange(nodeId, { config: edited("abc") }));

		// One undo jumps past the whole burst, back to the pre-edit config.
		act(() => result.current.handleUndo());
		const reverted = result.current.nodes.find((n) => n.id === nodeId) as WorkflowNode;
		expect(reverted.config).toEqual(originalConfig);
	});

	it("clears the redo stack when a new edit lands after an undo", () => {
		const { result } = setup();
		insertAction(result);
		act(() => result.current.handleUndo());
		expect(result.current.canRedo).toBe(true);

		insertAction(result);
		expect(result.current.canRedo).toBe(false);
	});

	it("restores a deleted node via undo", () => {
		const { result } = setup();
		// Deleting the ROOT node opens the clear-confirm dialog instead, so
		// build a two-step chain and delete the child.
		const rootId = insertAction(result);
		const childEdge = result.current.layoutedEdges.find(
			(e) => e.source === rootId
		);
		let childId = "";
		act(() => {
			childId = result.current.handleInsertNode(childEdge!.id, "action") ?? "";
		});
		expect(result.current.nodes).toHaveLength(2);

		act(() => result.current.handleDeleteNode(childId));
		expect(result.current.nodes).toHaveLength(1);
		expect(result.current.undoBanner).not.toBeNull();

		act(() => result.current.handleUndo());
		expect(result.current.nodes.map((n) => n.id)).toContain(childId);
	});
});
