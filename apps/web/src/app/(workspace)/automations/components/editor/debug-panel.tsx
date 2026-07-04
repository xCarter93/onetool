"use client";

import { useMemo, useState } from "react";
import {
	Loader2,
	CheckCircle2,
	XCircle,
	CircleSlash,
	Play,
	Square,
} from "lucide-react";
import type { Node } from "@xyflow/react";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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

type SampleRecord = {
	entityType: "client" | "project" | "quote" | "invoice" | "task";
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

	const map = {
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
	} as const;

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
						<Select value={effectiveRecordId} onValueChange={setRecordId}>
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
						intent="outline"
						size="sm"
						className="flex-1"
						onPress={onCancel}
					>
						<Square className="size-4" />
						Stop
					</Button>
				) : (
					<Button
						intent="primary"
						size="sm"
						className="flex-1"
						onPress={run}
						isPending={isStartingTest}
					>
						<Play className="size-4" />
						{hasActiveRun ? "Run again" : "Run test"}
					</Button>
				)}
			</div>

			{hasActiveRun && <StatusLine execution={execution} />}

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
