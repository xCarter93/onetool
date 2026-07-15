import type { Doc } from "@onetool/backend/convex/_generated/dataModel";

/** Terminal + in-flight states an execution row can be in (schema: workflowExecutions.status). */
export type RunStatus =
	| "running"
	| "completed"
	| "completed_with_errors"
	| "failed"
	| "skipped"
	| "cancelled";

type BadgeVariant =
	| "default"
	| "secondary"
	| "destructive"
	| "success"
	| "warning"
	| "outline";

export const RUN_STATUS_META: Record<
	RunStatus,
	{ label: string; badge: BadgeVariant }
> = {
	running: { label: "Running", badge: "default" },
	completed: { label: "Completed", badge: "success" },
	completed_with_errors: { label: "Completed with errors", badge: "warning" },
	failed: { label: "Failed", badge: "destructive" },
	skipped: { label: "Skipped", badge: "outline" },
	cancelled: { label: "Cancelled", badge: "warning" },
};

/** Order used by the status filter dropdown. */
export const RUN_STATUS_FILTER_ORDER: RunStatus[] = [
	"completed",
	"failed",
	"completed_with_errors",
	"running",
	"skipped",
	"cancelled",
];

/**
 * Human-readable duration. `ms` is an elapsed span (e.g. active execution time).
 * Null/undefined/negative → em dash so an in-flight or unmeasured run reads cleanly.
 */
export function formatDuration(ms: number | null | undefined): string {
	if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
	if (ms < 1) return "0ms";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	// Sub-10s keeps one decimal; a value that rounds to 10.0 falls through to the
	// whole-second path so it reads "10s", not "10.0s".
	if (ms < 10_000) {
		const oneDecimal = Math.round(ms / 100) / 10;
		if (oneDecimal < 10) return `${oneDecimal.toFixed(1)}s`;
	}
	// Round to whole seconds ONCE, then decompose with integer modulo so no branch
	// can carry-overflow (e.g. never "1m 60s" or "60s").
	const totalSeconds = Math.round(ms / 1000);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const totalMinutes = Math.floor(totalSeconds / 60);
	if (totalMinutes < 60) {
		const secs = totalSeconds % 60;
		return secs ? `${totalMinutes}m ${secs}s` : `${totalMinutes}m`;
	}
	const totalHours = Math.floor(totalMinutes / 60);
	if (totalHours < 24) {
		const mins = totalMinutes % 60;
		return mins ? `${totalHours}h ${mins}m` : `${totalHours}h`;
	}
	const days = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	return hours ? `${days}d ${hours}h` : `${days}d`;
}

/** Percentage for the success-rate tile. `rate` is a 0..1 fraction. */
export function formatPercent(rate: number | null | undefined): string {
	if (rate == null || !Number.isFinite(rate)) return "—";
	return `${Math.round(rate * 100)}%`;
}

/**
 * Turn the raw `triggeredBy` string into a friendly source label.
 * Values: "schedule", "manual:<userId>", "actor:<userId>" (user-caused record/
 * status event), a bare entity id (system-caused event), "automation"
 * (cascade), etc.
 */
export function formatTriggerSource(triggeredBy: string | undefined): string {
	if (!triggeredBy) return "—";
	if (triggeredBy.startsWith("manual")) return "Manual run";
	if (triggeredBy.startsWith("actor:")) return "Record change";
	switch (triggeredBy) {
		case "schedule":
			return "Schedule";
		case "status_changed":
			return "Status changed";
		case "record_created":
			return "Record created";
		case "record_updated":
			return "Record updated";
		case "automation":
			return "Chained";
		default:
			return triggeredBy.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
	}
}

/**
 * Sum item totals/failures across every loop node in a run's `loopSummary`
 * (a run can contain more than one loop). Zeroed out when there's no summary.
 */
export function summarizeLoopFailures(
	loopSummary: Doc<"workflowExecutions">["loopSummary"]
): { total: number; failed: number } {
	if (!loopSummary || loopSummary.length === 0) return { total: 0, failed: 0 };
	return loopSummary.reduce(
		(acc, s) => ({ total: acc.total + s.total, failed: acc.failed + s.failed }),
		{ total: 0, failed: 0 }
	);
}

/**
 * Row shape returned by `api.automations.listRuns` — the full execution doc plus
 * the joined automation name and derived latency (`activeMs`/`wallMs` are null
 * while a run is still in flight).
 */
export type RunRow = Doc<"workflowExecutions"> & {
	automationName: string;
	activeMs: number | null;
	wallMs: number | null;
};
