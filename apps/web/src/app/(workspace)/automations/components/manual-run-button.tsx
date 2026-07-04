"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Play, Loader2 } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
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
import { useToast } from "@/hooks/use-toast";

type ObjectType = "client" | "project" | "quote" | "invoice" | "task";

interface ManualRunButtonProps {
	automationId: Id<"workflowAutomations">;
	automationName: string;
	/** Published trigger object type, if the automation is record-scoped. */
	objectType?: ObjectType;
	/** Published trigger type — scheduled runs execute record-less. */
	triggerType?: string;
}

/**
 * Run a published automation on demand against a chosen record. Real effects
 * (production mode) — distinct from the editor's dry test run.
 */
export function ManualRunButton({
	automationId,
	automationName,
	objectType,
	triggerType,
}: ManualRunButtonProps) {
	const toast = useToast();
	const [open, setOpen] = useState(false);
	const [recordId, setRecordId] = useState<string | undefined>(undefined);
	const [isRunning, setIsRunning] = useState(false);

	const needsRecord = !!objectType && triggerType !== "scheduled";

	const startManualRun = useMutation(api.automationExecutor.startManualRun);
	const sampleRecords = useQuery(
		api.automationExecutor.getSampleRecords,
		open && needsRecord ? { automationId } : "skip"
	);
	const records = useMemo(() => sampleRecords ?? [], [sampleRecords]);
	// Query in flight (enabled but unresolved) — distinct from "resolved empty".
	const recordsLoading = needsRecord && open && sampleRecords === undefined;

	// Default to the most recent record until the user picks one.
	const effectiveRecordId = recordId ?? records[0]?.entityId;
	const selected = records.find((r) => r.entityId === effectiveRecordId);

	const run = async () => {
		setIsRunning(true);
		try {
			await startManualRun({
				automationId,
				record:
					needsRecord && selected
						? { entityType: selected.entityType, entityId: selected.entityId }
						: undefined,
			});
			toast.success("Run started", `"${automationName}" is running now.`);
			setOpen(false);
		} catch (error) {
			toast.error(
				"Couldn't start run",
				error instanceof Error ? error.message : "Please try again."
			);
		} finally {
			setIsRunning(false);
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					intent="outline"
					size="sq-sm"
					aria-label={`Run ${automationName} now`}
				>
					<Play className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 space-y-3 p-4">
				<div className="space-y-1">
					<h3 className="text-sm font-semibold">Run now</h3>
					<p className="text-xs text-muted-foreground">
						Runs the published automation with real effects.
					</p>
				</div>

				{needsRecord && (
					<div className="space-y-1.5">
						<label
							htmlFor="manual-run-record"
							className="text-xs font-medium text-muted-foreground"
						>
							Record
						</label>
						{recordsLoading ? (
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<Loader2 className="size-3.5 animate-spin" />
								Loading records…
							</div>
						) : records.length > 0 ? (
							<Select value={effectiveRecordId} onValueChange={setRecordId}>
								<SelectTrigger id="manual-run-record" className="w-full">
									<SelectValue placeholder="Pick a record" />
								</SelectTrigger>
								<SelectContent>
									{records.map((record) => (
										<SelectItem key={record.entityId} value={record.entityId}>
											{record.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<p className="text-xs text-muted-foreground">
								No records available to run against yet.
							</p>
						)}
					</div>
				)}

				<Button
					intent="primary"
					size="sm"
					className="w-full"
					onPress={run}
					isPending={isRunning}
					isDisabled={needsRecord && records.length === 0}
				>
					{isRunning ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Play className="size-4" />
					)}
					Run now
				</Button>
			</PopoverContent>
		</Popover>
	);
}
