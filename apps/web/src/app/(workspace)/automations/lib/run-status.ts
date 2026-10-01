import { Check, Minus, X, type LucideIcon } from "lucide-react";
import { formatDuration } from "./run-format";

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
	error?: string;
	startedAt?: number;
	completedAt?: number;
	recordsProcessed?: number;
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
	loopSummary?: (LoopTally & { nodeId: string })[];
};

export type LoopTally = {
	total: number;
	succeeded: number;
	failed: number;
	skipped: number;
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
 * to their loop's latest revealed iteration. Drives the edge run classes: a
 * condition inside a loop marks the branch the current iteration took, not
 * every branch any iteration ever took. Node rings keep the aggregated map —
 * a failure three iterations back stays visible there.
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
 * Class applied to a React Flow edge wrapper for its run state. Callers
 * resolve synthetic canvas ids (trigger, merge dots, terminal stubs) to the
 * real node whose status they carry, and skip edges whose ends resolve to the
 * same node. Only the edge into the running step marches (running is only
 * ever set while the execution is live); failed and skipped marks stay after
 * the run so the canvas still shows where it stopped. Styled in flow-theme.css.
 */
export function runEdgeClass(
	source: NodeRunStatus | undefined,
	target: NodeRunStatus | undefined
): string {
	const sourceTraversed = source === "success" || source === "running";
	if (target === "running" && sourceTraversed) return "flow-edge-running";
	if (target === "failed" && sourceTraversed) return "flow-edge-failed";
	if (target === "skipped" && source !== undefined && source !== "idle") {
		return "flow-edge-skipped";
	}
	return "";
}

type ActiveRunStatus = Exclude<NodeRunStatus, "idle">;

/** What one step did in a run, for the card footer and the inspector. */
export type NodeRunResult = {
	status: ActiveRunStatus;
	error?: string;
	durationMs?: number;
	recordsProcessed?: number;
	loop?: LoopTally;
};

/**
 * Per-node result of a run. A step revisited by a loop reports its first
 * failure, and no duration or count — one iteration's numbers would misstate
 * the step. Loop nodes carry their loopSummary tally, which (unlike the
 * truncated log) is authoritative.
 */
export function computeNodeResults(
	execution: ExecutionLike | null | undefined
): Record<string, NodeRunResult> {
	const results: Record<string, NodeRunResult> = {};
	if (!execution) return results;

	const picked = new Map<string, ExecutedEntry>();
	for (const entry of execution.nodesExecuted) {
		if (picked.get(entry.nodeId)?.result === "failed") continue;
		picked.set(entry.nodeId, entry);
	}

	for (const [nodeId, status] of Object.entries(computeNodeStatuses(execution))) {
		if (status === "idle") continue;
		const entry = picked.get(nodeId);
		const tally = execution.loopSummary?.find((s) => s.nodeId === nodeId);
		const result: NodeRunResult = { status };
		if (entry?.result === "failed" && entry.error) result.error = entry.error;
		if (entry && entry.loopNodeId === undefined) {
			if (entry.startedAt !== undefined && entry.completedAt !== undefined) {
				result.durationMs = entry.completedAt - entry.startedAt;
			}
			if (entry.recordsProcessed !== undefined) {
				result.recordsProcessed = entry.recordsProcessed;
			}
		}
		if (tally) {
			const { total, succeeded, failed, skipped } = tally;
			result.loop = { total, succeeded, failed, skipped };
		}
		results[nodeId] = result;
	}
	return results;
}

function plural(n: number, word: string): string {
	return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

/** Short muted facts for a step that ran, e.g. ["1.2s", "12 records"]. */
export function nodeResultFacts(result: NodeRunResult): string[] {
	if (result.loop) {
		const { total, succeeded, failed } = result.loop;
		const facts = [`${succeeded.toLocaleString()} of ${plural(total, "item")}`];
		if (failed > 0) facts.push(`${failed.toLocaleString()} failed`);
		return facts;
	}
	const facts: string[] = [];
	if (result.durationMs !== undefined) facts.push(formatDuration(result.durationMs));
	if (result.recordsProcessed !== undefined) {
		facts.push(plural(result.recordsProcessed, "record"));
	}
	return facts;
}

const RING = "ring-2 ring-offset-2 ring-offset-background";

/**
 * Header icon, screen-reader label and wrapper ring per run status. The card
 * pairs the icon with the ring so color is never the sole status signal; the
 * running icon is the shared Spinner.
 */
export const RUN_STATUS_META: Record<
	ActiveRunStatus,
	{ label: string; icon?: LucideIcon; ring: string }
> = {
	running: {
		label: "Running",
		ring: `${RING} ring-info shadow-[0_0_0_8px_color-mix(in_oklch,var(--color-info)_25%,transparent)]`,
	},
	success: { label: "Succeeded", icon: Check, ring: `${RING} ring-success` },
	failed: { label: "Failed", icon: X, ring: `${RING} ring-danger` },
	skipped: { label: "Skipped", icon: Minus, ring: `${RING} ring-muted-foreground/40` },
};

export function runStatusRingClass(status: NodeRunStatus | undefined): string {
	return status && status !== "idle" ? RUN_STATUS_META[status].ring : "";
}
