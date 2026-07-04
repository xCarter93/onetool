"use client";

import { useMemo, useState } from "react";
import {
	FlaskConical,
	Loader2,
	CheckCircle2,
	XCircle,
	CircleSlash,
	Play,
	Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { RunRecordRef } from "../../hooks/use-automation-editor";

type SampleRecord = {
	entityType: "client" | "project" | "quote" | "invoice" | "task";
	entityId: string;
	label: string;
};

type ExecutionLike = {
	status: "running" | "completed" | "failed" | "skipped" | "cancelled";
	error?: string;
	nodesExecuted: { nodeId: string; result?: string }[];
} | null | undefined;

interface TestRunControlProps {
	/** Trigger object type, if the automation is scoped to a record. */
	objectType?: "client" | "project" | "quote" | "invoice" | "task";
	/** Trigger type — scheduled runs execute record-less, so no picker. */
	triggerType?: string;
	sampleRecords: SampleRecord[];
	execution: ExecutionLike;
	isRunning: boolean;
	isStartingTest: boolean;
	hasActiveRun: boolean;
	onStartTest: (record?: RunRecordRef) => void;
	onCancel: () => void;
}

const OBJECT_LABEL: Record<string, string> = {
	client: "client",
	project: "project",
	quote: "quote",
	invoice: "invoice",
	task: "task",
};

function StatusLine({ execution }: { execution: ExecutionLike }) {
	if (!execution) return null;
	const count = execution.nodesExecuted.length;
	// Textual step position so a failure is never conveyed by ring color alone.
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
			icon: <Loader2 className="size-4 animate-spin text-blue-600 dark:text-blue-400" />,
			text: `Running… ${count} step${count === 1 ? "" : "s"} done`,
			cls: "text-blue-700 dark:text-blue-300",
		},
		completed: {
			icon: <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />,
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

export function TestRunControl({
	objectType,
	triggerType,
	sampleRecords,
	execution,
	isRunning,
	isStartingTest,
	hasActiveRun,
	onStartTest,
	onCancel,
}: TestRunControlProps) {
	const [open, setOpen] = useState(false);
	const [recordId, setRecordId] = useState<string | undefined>(undefined);

	const needsRecord = !!objectType && triggerType !== "scheduled";

	// Default to the most recent record until the user picks one (derived, so
	// no setState-in-effect churn). A pick made under a previous object type is
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

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button intent="secondary" size="sm" isPending={isStartingTest}>
					{isRunning ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<FlaskConical className="size-4" />
					)}
					Test run
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 space-y-3 p-4">
				<div className="space-y-1">
					<h3 className="text-sm font-semibold">Test run</h3>
					<p className="text-xs text-muted-foreground">
						A dry run against sample data — no records are changed and no
						messages are sent.
					</p>
				</div>

				{needsRecord && (
					<div className="space-y-1.5">
						<label
							htmlFor="test-run-record"
							className="text-xs font-medium text-muted-foreground"
						>
							Sample {OBJECT_LABEL[objectType!] ?? "record"}
						</label>
						{sampleRecords.length > 0 ? (
							<Select value={effectiveRecordId} onValueChange={setRecordId}>
								<SelectTrigger id="test-run-record" className="w-full">
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
								No {OBJECT_LABEL[objectType!] ?? "record"}s yet — the test will
								run without a record.
							</p>
						)}
					</div>
				)}

				{hasActiveRun && <StatusLine execution={execution} />}

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
			</PopoverContent>
		</Popover>
	);
}
