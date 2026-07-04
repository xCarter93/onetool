/**
 * Per-node run status derived from a live workflow execution, used to paint
 * the canvas during test/manual runs and to render the step list.
 */

export type NodeRunStatus =
	| "idle"
	| "running"
	| "success"
	| "failed"
	| "skipped";

/** A revealed execution log entry (subset of the backend shape we consume). */
type ExecutedEntry = {
	nodeId: string;
	result: "success" | "skipped" | "failed" | "running";
};

type ExecutionLike = {
	status: "running" | "completed" | "failed" | "skipped" | "cancelled";
	currentNodeId?: string;
	nodesExecuted: ExecutedEntry[];
};

// Loops revisit body nodes, so a node can have several entries — a failure
// always wins, then success over skipped (a node that mattered once counts).
const RANK: Record<Exclude<NodeRunStatus, "idle">, number> = {
	failed: 3,
	running: 2,
	success: 1,
	skipped: 0,
};

function merge(a: NodeRunStatus, b: NodeRunStatus): NodeRunStatus {
	if (a === "idle") return b;
	if (b === "idle") return a;
	return RANK[a] >= RANK[b] ? a : b;
}

/** Map each visited node id to its aggregated status for the given run. */
export function computeNodeStatuses(
	execution: ExecutionLike | null | undefined
): Record<string, NodeRunStatus> {
	const statuses: Record<string, NodeRunStatus> = {};
	if (!execution) return statuses;

	for (const entry of execution.nodesExecuted) {
		statuses[entry.nodeId] = merge(
			statuses[entry.nodeId] ?? "idle",
			entry.result
		);
	}

	// The node about to run (or running) hasn't logged its final result yet.
	if (execution.status === "running" && execution.currentNodeId) {
		statuses[execution.currentNodeId] = "running";
	}
	return statuses;
}

/**
 * Ring/pulse classes applied to a React Flow node wrapper for its run status.
 * The pulse is gated behind motion-safe (prefers-reduced-motion). Color is
 * paired with the test-run status line ("Failed at step N") so it's never the
 * sole status signal.
 */
export function runStatusRingClass(status: NodeRunStatus | undefined): string {
	switch (status) {
		case "running":
			return "rounded-[12px] ring-2 ring-blue-500/70 ring-offset-2 ring-offset-background motion-safe:animate-pulse";
		case "success":
			return "rounded-[12px] ring-2 ring-emerald-500/70 ring-offset-2 ring-offset-background";
		case "failed":
			return "rounded-[12px] ring-2 ring-red-500/70 ring-offset-2 ring-offset-background";
		case "skipped":
			return "rounded-[12px] ring-2 ring-muted-foreground/40 ring-offset-2 ring-offset-background";
		default:
			return "";
	}
}
