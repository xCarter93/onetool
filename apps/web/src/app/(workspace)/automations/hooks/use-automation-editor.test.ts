// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { toSavableNodes } from "./use-automation-editor";
import type { WorkflowNode } from "../lib/node-types";

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
