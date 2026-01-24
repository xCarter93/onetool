"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { WorkflowNode } from "./automation-node-card";
import { STATUS_OPTIONS } from "./automation-trigger-config";

// Available target types per trigger object type
const TARGET_OPTIONS: Record<
	string,
	{ value: string; label: string; type: string }[]
> = {
	client: [{ value: "self", label: "This Client", type: "client" }],
	project: [
		{ value: "self", label: "This Project", type: "project" },
		{ value: "client", label: "Related Client", type: "client" },
	],
	quote: [
		{ value: "self", label: "This Quote", type: "quote" },
		{ value: "project", label: "Related Project", type: "project" },
		{ value: "client", label: "Related Client", type: "client" },
	],
	invoice: [
		{ value: "self", label: "This Invoice", type: "invoice" },
		{ value: "project", label: "Related Project", type: "project" },
		{ value: "client", label: "Related Client", type: "client" },
		{ value: "quote", label: "Related Quote", type: "quote" },
	],
	task: [
		{ value: "self", label: "This Task", type: "task" },
		{ value: "project", label: "Related Project", type: "project" },
		{ value: "client", label: "Related Client", type: "client" },
	],
};

interface AutomationActionEditorProps {
	action: NonNullable<WorkflowNode["action"]>;
	triggerObjectType: string;
	onChange: (action: NonNullable<WorkflowNode["action"]>) => void;
}

export function AutomationActionEditor({
	action,
	triggerObjectType,
	onChange,
}: AutomationActionEditorProps) {
	const targetOptions = TARGET_OPTIONS[triggerObjectType] || [];

	// Get the actual object type for the selected target
	const selectedTarget = targetOptions.find(
		(t) => t.value === action.targetType
	);
	const targetObjectType = selectedTarget?.type || triggerObjectType;
	const statusOptions = STATUS_OPTIONS[targetObjectType] || [];

	const handleTargetChange = (value: string) => {
		const newTarget = targetOptions.find((t) => t.value === value);
		const newTargetType = newTarget?.type || triggerObjectType;
		const newStatusOptions = STATUS_OPTIONS[newTargetType] || [];

		onChange({
			...action,
			targetType: value as NonNullable<WorkflowNode["action"]>["targetType"],
			newStatus: newStatusOptions[0]?.value || "",
		});
	};

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				Update the status of an object when this automation runs
			</p>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="targetType">Update</Label>
					<Select
						value={action.targetType}
						onValueChange={handleTargetChange}
					>
						<SelectTrigger id="targetType">
							<SelectValue placeholder="Select target" />
						</SelectTrigger>
						<SelectContent>
							{targetOptions.map((target) => (
								<SelectItem key={target.value} value={target.value}>
									{target.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="newStatus">Set status to</Label>
					<Select
						value={action.newStatus}
						onValueChange={(value) =>
							onChange({ ...action, newStatus: value })
						}
					>
						<SelectTrigger id="newStatus">
							<SelectValue placeholder="Select new status" />
						</SelectTrigger>
						<SelectContent>
							{statusOptions.map((status) => (
								<SelectItem key={status.value} value={status.value}>
									{status.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="pt-2 px-4 py-3 bg-muted/50 rounded-lg">
				<p className="text-sm">
					<span className="text-muted-foreground">Set </span>
					<span className="font-medium text-foreground">
						{selectedTarget?.label || action.targetType}
					</span>
					<span className="text-muted-foreground"> status to </span>
					<span className="font-medium text-foreground">
						{statusOptions.find((s) => s.value === action.newStatus)?.label ||
							action.newStatus}
					</span>
				</p>
			</div>
		</div>
	);
}

export { TARGET_OPTIONS };

