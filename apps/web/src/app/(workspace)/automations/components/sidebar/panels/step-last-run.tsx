"use client";

import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { StatusBadge, type StatusRole } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { formatDuration } from "../../../lib/run-format";
import { RUN_STATUS_META, type NodeRunResult } from "../../../lib/run-status";

const STATUS_ROLE: Record<NodeRunResult["status"], StatusRole> = {
	running: "info",
	success: "success",
	failed: "danger",
	skipped: "neutral",
};

function FactRow({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-4 text-sm">
			<dt className="min-w-0 text-muted-foreground">{label}</dt>
			<dd className="min-w-0 text-right font-medium break-words tabular-nums">{value}</dd>
		</div>
	);
}

interface StepLastRunProps {
	result: NodeRunResult;
	onViewInDebug: () => void;
}

/** What the selected step did in the run currently shown on the canvas. */
export function StepLastRun({ result, onViewInDebug }: StepLastRunProps) {
	const { status, durationMs, recordsProcessed, loop, error } = result;
	const { icon: Icon, label } = RUN_STATUS_META[status];

	return (
		<section aria-labelledby="step-last-run" className="mb-3 mt-1 flex flex-col gap-3 border-b border-border pb-4">
			<h3 id="step-last-run" className="text-sm font-semibold">
				Last run
			</h3>
			<dl className="flex flex-col gap-2">
				<FactRow
					label="Status"
					value={
						<StatusBadge role={STATUS_ROLE[status]}>
							{Icon && <Icon aria-hidden />}
							{label}
						</StatusBadge>
					}
				/>
				{durationMs !== undefined && <FactRow label="Duration" value={formatDuration(durationMs)} />}
				{recordsProcessed !== undefined && (
					<FactRow label="Records processed" value={recordsProcessed.toLocaleString()} />
				)}
				{loop && (
					<>
						<FactRow label="Items" value={loop.total.toLocaleString()} />
						<FactRow label="Succeeded" value={loop.succeeded.toLocaleString()} />
						{loop.failed > 0 && <FactRow label="Failed" value={loop.failed.toLocaleString()} />}
						{loop.skipped > 0 && <FactRow label="Skipped" value={loop.skipped.toLocaleString()} />}
					</>
				)}
			</dl>
			{error && (
				<p className="rounded-md bg-danger-soft px-2.5 py-2 text-xs break-words text-danger-foreground">
					{error}
				</p>
			)}
			<Button variant="outline" size="sm" className="self-start" onClick={onViewInDebug}>
				<FlaskConical />
				View in debug panel
			</Button>
		</section>
	);
}
