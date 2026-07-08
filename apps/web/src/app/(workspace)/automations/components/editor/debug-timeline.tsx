"use client";

import { useState, type ReactNode } from "react";
import {
	CheckCircle2,
	XCircle,
	CircleSlash,
	Loader2,
	ChevronRight,
	Crosshair,
	AlertTriangle,
} from "lucide-react";
import type { Node } from "@xyflow/react";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDuration } from "../../lib/run-format";
import { TRIGGER_NODE_ID } from "../../lib/flow-adapter";

type ExecutedNode = Doc<"workflowExecutions">["nodesExecuted"][number];

const NODE_TYPE_LABELS: Record<string, string> = {
	trigger: "Trigger",
	condition: "Condition",
	action: "Update record",
	send_notification: "Send notification",
	create_record: "Create record",
	fetch_records: "Fetch records",
	loop: "Loop",
	aggregate: "Aggregate",
	adjust_time: "Adjust time",
	delay: "Delay",
	delay_until: "Delay until",
	end: "End",
};

/** Executed node ids map onto canvas node ids; the trigger is the fixed id. */
function resolveLabel(nodeId: string, rfNodes: Node[]): string {
	if (nodeId === TRIGGER_NODE_ID) return "Trigger";
	const node = rfNodes.find((n) => n.id === nodeId);
	const nt = (node?.data as Record<string, unknown> | undefined)?.nodeType as
		| string
		| undefined;
	if (nt) return NODE_TYPE_LABELS[nt] ?? nt;
	// Node was edited away after this run — keep it in the list, no canvas ring.
	return "Removed step";
}

const RESULT_ICON: Record<ExecutedNode["result"], ReactNode> = {
	success: (
		<CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
	),
	failed: <XCircle className="size-3.5 text-red-600 dark:text-red-400" />,
	skipped: <CircleSlash className="size-3.5 text-muted-foreground" />,
	running: (
		<Loader2 className="size-3.5 animate-spin text-blue-600 dark:text-blue-400" />
	),
};

/** The backend caps snapshots at ~4KB, replacing oversized payloads with a
 * { _truncated, preview } marker whose `preview` is a raw JSON prefix. */
function isTruncated(v: unknown): v is { _truncated: true; preview?: string } {
	return (
		typeof v === "object" &&
		v !== null &&
		(v as { _truncated?: unknown })._truncated === true
	);
}

/** input/output are `v.any()` — stringify defensively, never throw on render. */
function JsonBlock({ label, value }: { label: string; value: unknown }) {
	const truncated = isTruncated(value);
	let text: string;
	if (truncated) {
		text = String(value.preview ?? "");
	} else {
		try {
			text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
		} catch {
			text = String(value);
		}
	}
	return (
		<div className="space-y-1">
			<div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
				<span>{label}</span>
				{truncated && (
					<span className="rounded bg-amber-100 px-1 py-px text-[9px] font-medium normal-case tracking-normal text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
						truncated
					</span>
				)}
			</div>
			<pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed text-foreground">
				{text}
				{truncated && "…"}
			</pre>
		</div>
	);
}

interface DebugTimelineProps {
	entries: ExecutedNode[];
	rfNodes: Node[];
	onNavigateToNode: (nodeId: string) => void;
}

export function DebugTimeline({
	entries,
	rfNodes,
	onNavigateToNode,
}: DebugTimelineProps) {
	// One row open at a time keeps the 280px panel legible.
	const [expanded, setExpanded] = useState<number | null>(null);
	if (entries.length === 0) return null;

	return (
		<ol className="space-y-0.5">
			{entries.map((entry, i) => {
				const isOpen = expanded === i;
				const label = resolveLabel(entry.nodeId, rfNodes);
				const duration =
					entry.completedAt != null && entry.startedAt != null
						? formatDuration(entry.completedAt - entry.startedAt)
						: null;
				const hasDetail =
					entry.input !== undefined ||
					entry.output !== undefined ||
					entry.error != null ||
					entry.recordsProcessed != null;

				return (
					<li key={i}>
						<div className={cn("rounded-md", isOpen && "bg-accent/40")}>
							<div className="flex items-center gap-1">
								<button
									type="button"
									aria-expanded={isOpen}
									onClick={() => setExpanded(isOpen ? null : i)}
									className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<ChevronRight
										className={cn(
											"size-3 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150",
											isOpen && "rotate-90"
										)}
									/>
									<span className="shrink-0">
										{RESULT_ICON[entry.result] ?? RESULT_ICON.skipped}
									</span>
									<span className="min-w-0 flex-1 truncate text-sm">
										<span className="tabular-nums text-muted-foreground">
											{i + 1}.
										</span>{" "}
										{label}
									</span>
									{entry.truncated && (
										<Tooltip>
											<TooltipTrigger asChild>
												<Badge
													variant="warning"
													className="shrink-0 gap-1 px-1.5 py-0 text-[10px]"
												>
													<AlertTriangle className="size-2.5" aria-hidden />
													Truncated
												</Badge>
											</TooltipTrigger>
											<TooltipContent side="top" className="max-w-xs">
												This step stopped scanning at the 5,000 most recent
												records; older records were not considered.
											</TooltipContent>
										</Tooltip>
									)}
									{duration && (
										<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
											{duration}
										</span>
									)}
								</button>
								<Button
									intent="plain"
									size="sq-sm"
									onPress={() => onNavigateToNode(entry.nodeId)}
									aria-label={`Focus ${label} on canvas`}
									className="shrink-0 text-muted-foreground"
								>
									<Crosshair className="size-3.5" />
								</Button>
							</div>

							{isOpen && (
								<div className="space-y-2 pb-2 pl-7 pr-2">
									{entry.error != null && (
										<div className="rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:bg-red-950/30 dark:text-red-300">
											{entry.error}
										</div>
									)}
									{entry.recordsProcessed != null && (
										<div className="text-[11px] text-muted-foreground">
											{entry.recordsProcessed} record
											{entry.recordsProcessed === 1 ? "" : "s"} processed
										</div>
									)}
									{entry.input !== undefined && (
										<JsonBlock label="Input" value={entry.input} />
									)}
									{entry.output !== undefined && (
										<JsonBlock label="Output" value={entry.output} />
									)}
									{!hasDetail && (
										<div className="text-[11px] text-muted-foreground">
											No data captured for this step.
										</div>
									)}
								</div>
							)}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
