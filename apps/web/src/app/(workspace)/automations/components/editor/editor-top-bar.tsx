"use client";

import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TestRunControl } from "./test-run-control";
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

interface EditorTopBarProps {
	name: string;
	description: string;
	status: "draft" | "active" | "paused";
	isSaving: boolean;
	// Test-run controller
	objectType?: "client" | "project" | "quote" | "invoice" | "task";
	triggerType?: string;
	sampleRecords: SampleRecord[];
	execution: ExecutionLike;
	isRunning: boolean;
	isStartingTest: boolean;
	hasActiveRun: boolean;
	onStartTest: (record?: RunRecordRef) => void;
	onCancelTest: () => void;
	onBack: () => void;
	onNameChange: (value: string) => void;
	onDescriptionChange: (value: string) => void;
	onSave: () => void;
}

const STATUS_BADGE: Record<
	EditorTopBarProps["status"],
	{ label: string; variant: "outline" | "success" | "warning" }
> = {
	draft: { label: "Draft", variant: "outline" },
	active: { label: "Active", variant: "success" },
	paused: { label: "Paused", variant: "warning" },
};

export function EditorTopBar({
	name,
	description,
	status,
	isSaving,
	objectType,
	triggerType,
	sampleRecords,
	execution,
	isRunning,
	isStartingTest,
	hasActiveRun,
	onStartTest,
	onCancelTest,
	onBack,
	onNameChange,
	onDescriptionChange,
	onSave,
}: EditorTopBarProps) {
	const badge = STATUS_BADGE[status];

	return (
		<div className="flex h-16 items-center gap-3 border-b border-border bg-background px-6">
			<Button
				intent="outline"
				size="sq-md"
				onPress={onBack}
				aria-label="Back to automations"
			>
				<ArrowLeft className="h-4 w-4" />
			</Button>
			<div className="flex min-w-0 flex-col justify-center">
				<input
					value={name}
					onChange={(event) => onNameChange(event.target.value)}
					placeholder="Automation name"
					aria-label="Automation name"
					className="w-64 border-none bg-transparent text-lg font-semibold outline-none focus-visible:ring-0"
				/>
				<input
					value={description}
					onChange={(event) => onDescriptionChange(event.target.value)}
					placeholder="Add a description..."
					aria-label="Automation description"
					className="w-64 border-none bg-transparent text-xs text-muted-foreground outline-none focus-visible:ring-0"
				/>
			</div>
			<Badge variant={badge.variant} className="ml-1 shrink-0">
				{badge.label}
			</Badge>

			<div className="ml-auto flex items-center gap-2">
				<TestRunControl
					objectType={objectType}
					triggerType={triggerType}
					sampleRecords={sampleRecords}
					execution={execution}
					isRunning={isRunning}
					isStartingTest={isStartingTest}
					hasActiveRun={hasActiveRun}
					onStartTest={onStartTest}
					onCancel={onCancelTest}
				/>
				<Button intent="outline" onPress={onSave} isPending={isSaving}>
					<Save className="h-4 w-4" />
					Save
				</Button>
			</div>
		</div>
	);
}
