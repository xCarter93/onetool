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
	// Present on entries logged from inside a loop body.
	loopNodeId?: string;
	loopIndex?: number;
};

type ExecutionLike = {
	status:
		| "running"
		| "completed"
		| "completed_with_errors"
		| "failed"
		| "skipped"
		| "cancelled";
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
 * Like computeNodeStatuses, but loop-body entries only count when they belong
 * to their loop's latest revealed iteration. Drives the live edge-flow
 * animation: a condition inside a loop lights up the branch the current
 * iteration took, not every branch any iteration ever took. Node rings keep
 * the aggregated map — a failure three iterations back stays visible there.
 */
export function computeLiveTraversalStatuses(
	execution: ExecutionLike | null | undefined
): Record<string, NodeRunStatus> {
	const statuses: Record<string, NodeRunStatus> = {};
	if (!execution) return statuses;

	const latestIteration = new Map<string, number>();
	for (const entry of execution.nodesExecuted) {
		if (entry.loopNodeId === undefined || entry.loopIndex === undefined) continue;
		const prev = latestIteration.get(entry.loopNodeId);
		if (prev === undefined || entry.loopIndex > prev) {
			latestIteration.set(entry.loopNodeId, entry.loopIndex);
		}
	}

	for (const entry of execution.nodesExecuted) {
		if (
			entry.loopNodeId !== undefined &&
			entry.loopIndex !== latestIteration.get(entry.loopNodeId)
		) {
			continue;
		}
		statuses[entry.nodeId] = merge(
			statuses[entry.nodeId] ?? "idle",
			entry.result
		);
	}

	if (execution.status === "running" && execution.currentNodeId) {
		statuses[execution.currentNodeId] = "running";
	}
	return statuses;
}

/**
 * Class applied to a React Flow edge wrapper while a live run flows through
 * it: the source has been traversed and execution has reached the target.
 * Callers resolve synthetic canvas ids (trigger, merge dots, terminal stubs)
 * to the real node whose status they carry before looking statuses up.
 * flow-theme.css animates the dashes along the executed path; callers gate on
 * the execution actually being live so finished runs leave a calm canvas.
 */
export function runEdgeFlowClass(
	source: NodeRunStatus | undefined,
	target: NodeRunStatus | undefined
): string {
	const sourceTraversed = source === "success" || source === "running";
	const targetReached = target !== undefined && target !== "idle";
	return sourceTraversed && targetReached ? "flow-edge-running" : "";
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
