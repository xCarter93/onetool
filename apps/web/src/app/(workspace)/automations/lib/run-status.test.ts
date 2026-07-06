import { describe, it, expect } from "vitest";
import { computeNodeStatuses, runStatusRingClass } from "./run-status";

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
		expect(runStatusRingClass("running")).toContain("ring-blue");
		expect(runStatusRingClass("success")).toContain("ring-emerald");
		expect(runStatusRingClass("failed")).toContain("ring-red");
		expect(runStatusRingClass("skipped")).toContain("ring-muted-foreground");
		expect(runStatusRingClass("idle")).toBe("");
		expect(runStatusRingClass(undefined)).toBe("");
	});

	it("gates the running pulse behind motion-safe", () => {
		expect(runStatusRingClass("running")).toContain("motion-safe:animate-pulse");
	});
});
