import { describe, it, expect } from "vitest";
import {
	computeLiveTraversalStatuses,
	computeNodeResults,
	computeNodeStatuses,
	nodeResultFacts,
	runEdgeClass,
	RUN_STATUS_META,
	runStatusRingClass,
} from "./run-status";

describe("computeNodeStatuses", () => {
	it("returns an empty map for no execution", () => {
		expect(computeNodeStatuses(null)).toEqual({});
		expect(computeNodeStatuses(undefined)).toEqual({});
	});

	it("maps each revealed entry to its result", () => {
		const statuses = computeNodeStatuses({
			status: "completed",
			nodesExecuted: [
				{ nodeId: "a", result: "success" },
				{ nodeId: "b", result: "skipped" },
			],
		});
		expect(statuses).toEqual({ a: "success", b: "skipped" });
	});

	it("marks the current node running while the run is in progress", () => {
		const statuses = computeNodeStatuses({
			status: "running",
			currentNodeId: "b",
			nodesExecuted: [{ nodeId: "a", result: "success" }],
		});
		expect(statuses.a).toBe("success");
		expect(statuses.b).toBe("running");
	});

	it("does not mark a current node running once the run finished", () => {
		const statuses = computeNodeStatuses({
			status: "completed",
			currentNodeId: "b",
			nodesExecuted: [{ nodeId: "a", result: "success" }],
		});
		expect(statuses.b).toBeUndefined();
	});

	it("aggregates multiple entries per node with failure winning (loops)", () => {
		const statuses = computeNodeStatuses({
			status: "failed",
			nodesExecuted: [
				{ nodeId: "body", result: "success" },
				{ nodeId: "body", result: "failed" },
				{ nodeId: "body", result: "success" },
			],
		});
		expect(statuses.body).toBe("failed");
	});

	it("prefers success over skipped across iterations", () => {
		const statuses = computeNodeStatuses({
			status: "completed",
			nodesExecuted: [
				{ nodeId: "n", result: "skipped" },
				{ nodeId: "n", result: "success" },
			],
		});
		expect(statuses.n).toBe("success");
	});
});

describe("runStatusRingClass", () => {
	it("returns a class for each active status and empty for idle/undefined", () => {
		expect(runStatusRingClass("running")).toContain("ring-info");
		expect(runStatusRingClass("success")).toContain("ring-success");
		expect(runStatusRingClass("failed")).toContain("ring-danger");
		expect(runStatusRingClass("skipped")).toContain("ring-muted-foreground");
		expect(runStatusRingClass("idle")).toBe("");
		expect(runStatusRingClass(undefined)).toBe("");
	});

	it("holds a steady halo on running instead of pulsing the card", () => {
		expect(runStatusRingClass("running")).not.toContain("animate-pulse");
		expect(runStatusRingClass("running")).toContain("shadow-");
	});
});

describe("RUN_STATUS_META", () => {
	it("labels every non-idle status for screen readers", () => {
		expect(RUN_STATUS_META.running.label).toBe("Running");
		expect(RUN_STATUS_META.success.label).toBe("Succeeded");
		expect(RUN_STATUS_META.failed.label).toBe("Failed");
		expect(RUN_STATUS_META.skipped.label).toBe("Skipped");
	});
});

describe("computeLiveTraversalStatuses", () => {
	it("only counts loop-body entries from the latest revealed iteration", () => {
		// A loop condition alternating branches: iteration 0 took yes,
		// iteration 1 took no — only the current (no) branch should light up.
		const statuses = computeLiveTraversalStatuses({
			status: "running",
			nodesExecuted: [
				{ nodeId: "yes-head", result: "success", loopNodeId: "loop", loopIndex: 0 },
				{ nodeId: "no-head", result: "success", loopNodeId: "loop", loopIndex: 1 },
			],
		});
		expect(statuses["yes-head"]).toBeUndefined();
		expect(statuses["no-head"]).toBe("success");
	});

	it("keeps entries outside any loop and merges within the kept iteration", () => {
		const statuses = computeLiveTraversalStatuses({
			status: "completed",
			nodesExecuted: [
				{ nodeId: "before", result: "success" },
				{ nodeId: "body", result: "failed", loopNodeId: "loop", loopIndex: 0 },
				{ nodeId: "body", result: "success", loopNodeId: "loop", loopIndex: 1 },
			],
		});
		expect(statuses.before).toBe("success");
		expect(statuses.body).toBe("success");
	});

	it("tracks each loop's latest iteration independently", () => {
		const statuses = computeLiveTraversalStatuses({
			status: "running",
			nodesExecuted: [
				{ nodeId: "a-body", result: "success", loopNodeId: "loop-a", loopIndex: 2 },
				{ nodeId: "b-body", result: "success", loopNodeId: "loop-b", loopIndex: 0 },
			],
		});
		expect(statuses["a-body"]).toBe("success");
		expect(statuses["b-body"]).toBe("success");
	});

	it("marks the current node running while the run is in progress", () => {
		const statuses = computeLiveTraversalStatuses({
			status: "running",
			currentNodeId: "next",
			nodesExecuted: [
				{ nodeId: "stale", result: "success", loopNodeId: "loop", loopIndex: 0 },
				{ nodeId: "fresh", result: "success", loopNodeId: "loop", loopIndex: 1 },
			],
		});
		expect(statuses.next).toBe("running");
		expect(statuses.stale).toBeUndefined();
	});
});

describe("runEdgeClass", () => {
	it("marches only the edge into the running step", () => {
		expect(runEdgeClass("success", "running")).toBe("flow-edge-running");
		expect(runEdgeClass("running", "running")).toBe("flow-edge-running");
	});

	it("leaves completed edges solid", () => {
		expect(runEdgeClass("success", "success")).toBe("");
	});

	it("marks the edge into a failed step", () => {
		expect(runEdgeClass("success", "failed")).toBe("flow-edge-failed");
	});

	it("marks edges into skipped steps, including inside a skipped branch", () => {
		expect(runEdgeClass("success", "skipped")).toBe("flow-edge-skipped");
		expect(runEdgeClass("skipped", "skipped")).toBe("flow-edge-skipped");
	});

	it("returns empty when the target hasn't been reached", () => {
		expect(runEdgeClass("success", undefined)).toBe("");
		expect(runEdgeClass("success", "idle")).toBe("");
	});

	it("returns empty when the source never ran", () => {
		expect(runEdgeClass(undefined, "running")).toBe("");
		expect(runEdgeClass(undefined, "failed")).toBe("");
		expect(runEdgeClass(undefined, "skipped")).toBe("");
		expect(runEdgeClass("skipped", "running")).toBe("");
	});
});

describe("computeNodeResults", () => {
	it("returns an empty map for no execution", () => {
		expect(computeNodeResults(null)).toEqual({});
	});

	it("reports duration, records, and errors for top-level steps", () => {
		const results = computeNodeResults({
			status: "failed",
			nodesExecuted: [
				{ nodeId: "a", result: "success", startedAt: 1000, completedAt: 2200, recordsProcessed: 12 },
				{ nodeId: "b", result: "failed", error: "Record not found" },
			],
		});
		expect(results.a).toEqual({ status: "success", durationMs: 1200, recordsProcessed: 12 });
		expect(results.b).toEqual({ status: "failed", error: "Record not found" });
	});

	it("keeps a loop body step's first failure and drops per-iteration numbers", () => {
		const results = computeNodeResults({
			status: "completed_with_errors",
			nodesExecuted: [
				{ nodeId: "body", result: "success", loopNodeId: "L", loopIndex: 0, startedAt: 0, completedAt: 5 },
				{ nodeId: "body", result: "failed", error: "first", loopNodeId: "L", loopIndex: 1 },
				{ nodeId: "body", result: "failed", error: "second", loopNodeId: "L", loopIndex: 2 },
			],
		});
		expect(results.body).toEqual({ status: "failed", error: "first" });
	});

	it("uses the loop summary tally for loop nodes", () => {
		const results = computeNodeResults({
			status: "completed_with_errors",
			nodesExecuted: [{ nodeId: "L", result: "success" }],
			loopSummary: [{ nodeId: "L", total: 14, succeeded: 12, failed: 2, skipped: 0 }],
		});
		expect(results.L.loop).toEqual({ total: 14, succeeded: 12, failed: 2, skipped: 0 });
		expect(nodeResultFacts(results.L)).toEqual(["12 of 14 items", "2 failed"]);
	});

	it("keeps results for node ids the canvas no longer has", () => {
		const results = computeNodeResults({
			status: "completed",
			nodesExecuted: [{ nodeId: "gone", result: "success" }],
		});
		expect(results.gone.status).toBe("success");
	});
});

describe("nodeResultFacts", () => {
	it("formats duration and record count", () => {
		expect(nodeResultFacts({ status: "success", durationMs: 1200, recordsProcessed: 1 })).toEqual([
			"1.2s",
			"1 record",
		]);
	});

	it("is empty when nothing was measured", () => {
		expect(nodeResultFacts({ status: "success" })).toEqual([]);
	});
});
