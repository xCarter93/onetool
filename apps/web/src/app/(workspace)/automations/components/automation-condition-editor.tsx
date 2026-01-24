"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { WorkflowNode } from "./automation-node-card";

// Available fields per object type
const FIELD_OPTIONS: Record<
	string,
	{ value: string; label: string; type: "string" | "array" | "boolean" }[]
> = {
	client: [
		{ value: "status", label: "Status", type: "string" },
		{ value: "priorityLevel", label: "Priority Level", type: "string" },
		{ value: "clientType", label: "Client Type", type: "string" },
		{ value: "clientSize", label: "Client Size", type: "string" },
		{ value: "category", label: "Category", type: "string" },
		{ value: "leadSource", label: "Lead Source", type: "string" },
		{ value: "industry", label: "Industry", type: "string" },
		{ value: "emailOptIn", label: "Email Opt-In", type: "boolean" },
		{ value: "smsOptIn", label: "SMS Opt-In", type: "boolean" },
	],
	project: [
		{ value: "status", label: "Status", type: "string" },
		{ value: "projectType", label: "Project Type", type: "string" },
		{ value: "title", label: "Title", type: "string" },
	],
	quote: [
		{ value: "status", label: "Status", type: "string" },
		{ value: "title", label: "Title", type: "string" },
		{ value: "total", label: "Total", type: "string" },
	],
	invoice: [
		{ value: "status", label: "Status", type: "string" },
		{ value: "invoiceNumber", label: "Invoice Number", type: "string" },
		{ value: "total", label: "Total", type: "string" },
	],
	task: [
		{ value: "status", label: "Status", type: "string" },
		{ value: "priority", label: "Priority", type: "string" },
		{ value: "type", label: "Type", type: "string" },
		{ value: "title", label: "Title", type: "string" },
	],
};

const OPERATOR_OPTIONS = [
	{ value: "equals", label: "Equals" },
	{ value: "not_equals", label: "Does not equal" },
	{ value: "contains", label: "Contains" },
	{ value: "exists", label: "Exists (is not empty)" },
];

interface AutomationConditionEditorProps {
	condition: NonNullable<WorkflowNode["condition"]>;
	objectType: string;
	onChange: (condition: NonNullable<WorkflowNode["condition"]>) => void;
}

export function AutomationConditionEditor({
	condition,
	objectType,
	onChange,
}: AutomationConditionEditorProps) {
	const fieldOptions = FIELD_OPTIONS[objectType] || [];
	const showValueInput = condition.operator !== "exists";

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				Check a condition on the triggering object. If true, continue to the next
				step.
			</p>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div className="space-y-2">
					<Label htmlFor="field">Field</Label>
					<Select
						value={condition.field}
						onValueChange={(value) =>
							onChange({ ...condition, field: value })
						}
					>
						<SelectTrigger id="field">
							<SelectValue placeholder="Select field" />
						</SelectTrigger>
						<SelectContent>
							{fieldOptions.map((field) => (
								<SelectItem key={field.value} value={field.value}>
									{field.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="operator">Operator</Label>
					<Select
						value={condition.operator}
						onValueChange={(value) =>
							onChange({
								...condition,
								operator: value as NonNullable<
									WorkflowNode["condition"]
								>["operator"],
							})
						}
					>
						<SelectTrigger id="operator">
							<SelectValue placeholder="Select operator" />
						</SelectTrigger>
						<SelectContent>
							{OPERATOR_OPTIONS.map((op) => (
								<SelectItem key={op.value} value={op.value}>
									{op.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{showValueInput && (
					<div className="space-y-2">
						<Label htmlFor="value">Value</Label>
						<Input
							id="value"
							value={String(condition.value || "")}
							onChange={(e) =>
								onChange({ ...condition, value: e.target.value })
							}
							placeholder="Enter value"
						/>
					</div>
				)}
			</div>

			<div className="pt-2 px-4 py-3 bg-muted/50 rounded-lg">
				<p className="text-sm">
					<span className="text-muted-foreground">If the </span>
					<span className="font-medium text-foreground">
						{fieldOptions.find((f) => f.value === condition.field)?.label ||
							condition.field}
					</span>
					<span className="text-muted-foreground">
						{" "}
						{OPERATOR_OPTIONS.find((o) => o.value === condition.operator)?.label.toLowerCase() ||
							condition.operator}
					</span>
					{showValueInput && condition.value ? (
						<>
							<span className="text-muted-foreground"> </span>
							<span className="font-medium text-foreground">
								&quot;{String(condition.value)}&quot;
							</span>
						</>
					) : null}
					<span className="text-muted-foreground">, then continue...</span>
				</p>
			</div>
		</div>
	);
}

export { FIELD_OPTIONS };

