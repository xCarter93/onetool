"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
	Loader2,
	CheckCircle2,
	XCircle,
	CircleSlash,
	Play,
	Square,
	AlertTriangle,
} from "lucide-react";
import type { Node } from "@xyflow/react";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { FETCH_SCAN_CEILING } from "@onetool/backend/convex/lib/workflowTypes";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { RunRecordRef } from "../../hooks/use-automation-editor";
import { DebugTimeline } from "./debug-timeline";
import { summarizeLoopFailures, type RunStatus } from "../../lib/run-format";
import type { TriggerableObjectType } from "../../lib/node-types";

type SampleRecord = {
	entityType: TriggerableObjectType;
	entityId: string;
	label: string;
};

type ExecutionDoc = Doc<"workflowExecutions"> | null | undefined;

interface DebugPanelProps {
	/** Trigger object type, if the automation is scoped to a record. */
	objectType?: "client" | "project" | "quote" | "invoice" | "task";
	/** Trigger type — scheduled runs execute record-less, so no picker. */
	triggerType?: string;
	sampleRecords: SampleRecord[];
	execution: ExecutionDoc;
	isRunning: boolean;
	isStartingTest: boolean;
	hasActiveRun: boolean;
	onStartTest: (record?: RunRecordRef) => void;
	onCancel: () => void;
	rfNodes: Node[];
	onNavigateToNode: (nodeId: string) => void;
}

const OBJECT_LABEL: Record<string, string> = {
	client: "client",
	project: "project",
	quote: "quote",
	invoice: "invoice",
	task: "task",
};

/** Overall run status line — a failure is never conveyed by color alone. */
function StatusLine({ execution }: { execution: ExecutionDoc }) {
	if (!execution) return null;
	const count = execution.nodesExecuted.length;
	const failedIndex = execution.nodesExecuted.findIndex(
		(entry) => entry.result === "failed"
	);
	const failedText =
		failedIndex >= 0
			? `Failed at step ${failedIndex + 1}${execution.error ? `: ${execution.error}` : ""}`
			: execution.error
				? `Failed: ${execution.error}`
				: "Test failed";

	const { total: loopTotal, failed: loopFailed } = summarizeLoopFailures(
		execution.loopSummary
	);
	// A test run is a dry run over a sample: nothing failed, it *would* fail.
	const isDry = execution.dryRun === true;
	const withErrorsText =
		loopTotal > 0
			? isDry
				? `Test completed — ${loopFailed} of ${loopTotal} previewed item${
						loopTotal === 1 ? "" : "s"
					} would fail`
				: `Completed — ${loopFailed} of ${loopTotal} item${
						loopTotal === 1 ? "" : "s"
					} failed`
			: "Completed with errors";

	// Typed against RunStatus so a future added status fails to compile here
	// instead of silently falling through the `if (!s) return null` guard.
	const map: Record<RunStatus, { icon: ReactNode; text: string; cls: string }> = {
		running: {
			icon: (
				<Loader2 className="size-4 animate-spin text-blue-600 dark:text-blue-400" />
			),
			text: `Running… ${count} step${count === 1 ? "" : "s"} done`,
			cls: "text-blue-700 dark:text-blue-300",
		},
		completed: {
			icon: (
				<CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
			),
			text: "Test completed",
			cls: "text-emerald-700 dark:text-emerald-300",
		},
		completed_with_errors: {
			icon: (
				<AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
			),
			text: withErrorsText,
			cls: "text-amber-700 dark:text-amber-300",
		},
		failed: {
			icon: <XCircle className="size-4 text-red-600 dark:text-red-400" />,
			text: failedText,
			cls: "text-red-700 dark:text-red-300",
		},
		skipped: {
			icon: <CircleSlash className="size-4 text-muted-foreground" />,
			text: "Skipped",
			cls: "text-muted-foreground",
		},
		cancelled: {
			icon: <CircleSlash className="size-4 text-muted-foreground" />,
			text: "Test cancelled",
			cls: "text-muted-foreground",
		},
	};

	const s = map[execution.status];
	if (!s) return null; // guard an out-of-enum status rather than crash the panel
	return (
		<div
			className={cn(
				"flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs",
				s.cls
			)}
			role="status"
			aria-live="polite"
		>
			<span className="mt-px shrink-0">{s.icon}</span>
			<span className="min-w-0 break-words">{s.text}</span>
		</div>
	);
}

/**
 * One block per loop node that had at least one item fail — headline count,
 * the first few failing items by label/error, and a partial-write caveat
 * when the backend flagged any of them `partial: true`.
 */
function PartialProgressBanner({ execution }: { execution: ExecutionDoc }) {
	// Test runs are dry: nothing was written, and the loop only walks a sample.
	// Saying "updated 2 of 50 records" there would be false twice over.
	const dry = execution?.dryRun === true;
	const loopsWithFailures = (execution?.loopSummary ?? []).filter(
		(s) => s.failed > 0
	);
	if (loopsWithFailures.length === 0) return null;

	const MAX_SHOWN = 3;

	return (
		<div className="space-y-2">
			{loopsWithFailures.map((summary) => {
				const shown = summary.errors.slice(0, MAX_SHOWN);
				// Count against `failed`, not `errors` — the server caps the stored
				// error list, so failures past the cap have no entry here.
				const hiddenCount = summary.failed - shown.length;
				const anyPartial = summary.errors.some((e) => e.partial);
				return (
					<div
						key={summary.nodeId}
						className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20"
					>
						<div className="flex items-start justify-between gap-2">
							<span className="text-xs font-medium text-amber-900 dark:text-amber-200">
								{dry
									? `${summary.succeeded} of ${summary.total} previewed item${
											summary.total === 1 ? "" : "s"
										} would run`
									: `Updated ${summary.succeeded} of ${summary.total} record${
											summary.total === 1 ? "" : "s"
										}`}
								{!dry && summary.skipped > 0
									? ` — ${summary.skipped} skipped`
									: ""}
							</span>
							<Badge variant="warning" className="shrink-0">
								{summary.failed} {dry ? "would fail" : "failed"}
							</Badge>
						</div>
						{shown.length > 0 && (
							<ul className="space-y-1">
								{shown.map((err) => (
									<li
										key={err.index}
										className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/90"
									>
										<span className="font-medium">
											{err.label ?? `Item ${err.index + 1}`}:
										</span>{" "}
										<span className="text-amber-800/80 dark:text-amber-300/70">
											{err.error}
										</span>
									</li>
								))}
							</ul>
						)}
						{hiddenCount > 0 && (
							<p className="text-[11px] text-amber-800/70 dark:text-amber-300/60">
								+{hiddenCount} more
							</p>
						)}
						{anyPartial && !dry && (
							<p className="text-[11px] text-amber-800/80 dark:text-amber-300/70">
								Some failed items may have been partially updated — check the
								timeline for which steps ran.
							</p>
						)}
					</div>
				);
			})}
		</div>
	);
}

export function DebugPanel({
	objectType,
	triggerType,
	sampleRecords,
	execution,
	isRunning,
	isStartingTest,
	hasActiveRun,
	onStartTest,
	onCancel,
	rfNodes,
	onNavigateToNode,
}: DebugPanelProps) {
	const [recordId, setRecordId] = useState<string | undefined>(undefined);

	const needsRecord = !!objectType && triggerType !== "scheduled";

	// Default to the most recent record until the user picks one (derived, so no
	// setState-in-effect churn). A pick made under a previous object type is
	// ignored once it no longer matches the sample list.
	const validRecordId =
		recordId && sampleRecords.some((r) => r.entityId === recordId)
			? recordId
			: undefined;
	const effectiveRecordId = validRecordId ?? sampleRecords[0]?.entityId;
	const selected = useMemo(
		() => sampleRecords.find((r) => r.entityId === effectiveRecordId),
		[effectiveRecordId, sampleRecords]
	);

	const run = () => {
		const record: RunRecordRef | undefined =
			needsRecord && selected
				? { entityType: selected.entityType, entityId: selected.entityId }
				: undefined;
		onStartTest(record);
	};

	const entries = execution?.nodesExecuted ?? [];

	return (
		<div className="flex flex-col gap-3 p-3">
			<p className="text-xs text-muted-foreground">
				Dry-run this workflow against a sample record to inspect each step&apos;s
				input and output. No records are changed and no messages are sent.
			</p>

			{needsRecord && (
				<div className="space-y-1.5">
					<label
						htmlFor="debug-run-record"
						className="text-xs font-medium text-muted-foreground"
					>
						Sample {OBJECT_LABEL[objectType!] ?? "record"}
					</label>
					{sampleRecords.length > 0 ? (
						<Select
							value={effectiveRecordId}
							onValueChange={(value) => setRecordId(value ?? undefined)}
						>
							<SelectTrigger id="debug-run-record" className="w-full">
								<SelectValue placeholder="Pick a record" />
							</SelectTrigger>
							<SelectContent>
								{sampleRecords.map((record) => (
									<SelectItem key={record.entityId} value={record.entityId}>
										{record.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<p className="text-xs text-muted-foreground">
							No {OBJECT_LABEL[objectType!] ?? "record"}s yet — the test will run
							without a record.
						</p>
					)}
				</div>
			)}

			<div className="flex items-center gap-2">
				{isRunning ? (
					<Button
						variant="outline"
						size="sm"
						className="flex-1"
						onClick={onCancel}
					>
						<Square className="size-4" />
						Stop
					</Button>
				) : (
					<Button
						variant="default"
						size="sm"
						className="flex-1"
						onClick={run}
						disabled={isStartingTest}
					>
						{isStartingTest ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Play className="size-4" />
						)}
						{hasActiveRun ? "Run again" : "Run test"}
					</Button>
				)}
			</div>

			{hasActiveRun && <StatusLine execution={execution} />}

			{hasActiveRun && execution && execution.status !== "running" && (
				<PartialProgressBanner execution={execution} />
			)}

			{hasActiveRun && execution?.dataTruncated && (
				<Tooltip>
					<TooltipTrigger
						render={<Badge variant="warning" className="w-fit gap-1" />}
					>
						<AlertTriangle className="size-3" aria-hidden />
						Results truncated
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-xs">
						At least one step stopped scanning at the{" "}
						{FETCH_SCAN_CEILING.toLocaleString()} most recent records; older
						records were not considered.
					</TooltipContent>
				</Tooltip>
			)}

			{hasActiveRun && execution?.triggerRecord && (
				<div className="text-[11px] text-muted-foreground">
					Trigger record:{" "}
					<span className="font-medium text-foreground">
						{execution.triggerRecord.label ??
							execution.triggerRecord.entityType}
					</span>
				</div>
			)}

			{entries.length > 0 ? (
				<div className="space-y-1.5">
					<div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Execution timeline
					</div>
					<DebugTimeline
						entries={entries}
						rfNodes={rfNodes}
						onNavigateToNode={onNavigateToNode}
					/>
				</div>
			) : (
				!hasActiveRun && (
					<p className="text-xs text-muted-foreground">
						Run a test to see each step&apos;s status, input, and output here.
					</p>
				)
			)}
		</div>
	);
}
