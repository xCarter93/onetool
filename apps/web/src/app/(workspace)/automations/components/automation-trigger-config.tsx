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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";

// Available object types and their statuses
const OBJECT_TYPES = [
	{ value: "client", label: "Client" },
	{ value: "project", label: "Project" },
	{ value: "quote", label: "Quote" },
	{ value: "invoice", label: "Invoice" },
	{ value: "task", label: "Task" },
] as const;

const STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
	client: [
		{ value: "lead", label: "Lead" },
		{ value: "prospect", label: "Prospect" },
		{ value: "active", label: "Active" },
		{ value: "inactive", label: "Inactive" },
		{ value: "archived", label: "Archived" },
	],
	project: [
		{ value: "planned", label: "Planned" },
		{ value: "in-progress", label: "In Progress" },
		{ value: "completed", label: "Completed" },
		{ value: "cancelled", label: "Cancelled" },
	],
	quote: [
		{ value: "draft", label: "Draft" },
		{ value: "sent", label: "Sent" },
		{ value: "approved", label: "Approved" },
		{ value: "declined", label: "Declined" },
		{ value: "expired", label: "Expired" },
	],
	invoice: [
		{ value: "draft", label: "Draft" },
		{ value: "sent", label: "Sent" },
		{ value: "paid", label: "Paid" },
		{ value: "overdue", label: "Overdue" },
		{ value: "cancelled", label: "Cancelled" },
	],
	task: [
		{ value: "pending", label: "Pending" },
		{ value: "in-progress", label: "In Progress" },
		{ value: "completed", label: "Completed" },
		{ value: "cancelled", label: "Cancelled" },
	],
};

export type TriggerConfig = {
	objectType: "client" | "project" | "quote" | "invoice" | "task";
	fromStatus?: string;
	toStatus: string;
};

interface AutomationTriggerConfigProps {
	trigger: TriggerConfig;
	onChange: (trigger: TriggerConfig) => void;
}

export function AutomationTriggerConfig({
	trigger,
	onChange,
}: AutomationTriggerConfigProps) {
	const statusOptions = STATUS_OPTIONS[trigger.objectType] || [];

	const handleObjectTypeChange = (value: string) => {
		const newType = value as TriggerConfig["objectType"];
		const newStatusOptions = STATUS_OPTIONS[newType] || [];
		onChange({
			objectType: newType,
			fromStatus: undefined,
			toStatus: newStatusOptions[0]?.value || "",
		});
	};

	const handleFromStatusChange = (value: string) => {
		onChange({
			...trigger,
			fromStatus: value === "any" ? undefined : value,
		});
	};

	const handleToStatusChange = (value: string) => {
		onChange({
			...trigger,
			toStatus: value,
		});
	};

	return (
		<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
			<div className="absolute inset-0 bg-linear-to-br from-amber-500/5 via-amber-500/2 to-transparent dark:from-amber-400/5 dark:via-amber-400/2 dark:to-transparent rounded-2xl" />
			<CardHeader className="relative z-10 pb-3">
				<CardTitle className="flex items-center gap-2 text-base">
					<div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30">
						<Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
					</div>
					Trigger
				</CardTitle>
			</CardHeader>
			<CardContent className="relative z-10 space-y-4">
				<p className="text-sm text-muted-foreground">
					Define when this automation should run
				</p>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div className="space-y-2">
						<Label htmlFor="objectType">When</Label>
						<Select
							value={trigger.objectType}
							onValueChange={handleObjectTypeChange}
						>
							<SelectTrigger id="objectType">
								<SelectValue placeholder="Select object type" />
							</SelectTrigger>
							<SelectContent>
								{OBJECT_TYPES.map((type) => (
									<SelectItem key={type.value} value={type.value}>
										{type.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="fromStatus">Changes from</Label>
						<Select
							value={trigger.fromStatus || "any"}
							onValueChange={handleFromStatusChange}
						>
							<SelectTrigger id="fromStatus">
								<SelectValue placeholder="Any status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="any">Any status</SelectItem>
								{statusOptions.map((status) => (
									<SelectItem key={status.value} value={status.value}>
										{status.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="toStatus">To</Label>
						<Select value={trigger.toStatus} onValueChange={handleToStatusChange}>
							<SelectTrigger id="toStatus">
								<SelectValue placeholder="Select target status" />
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
						<span className="text-muted-foreground">This automation will run when a </span>
						<span className="font-medium text-foreground">
							{OBJECT_TYPES.find((t) => t.value === trigger.objectType)?.label}
						</span>
						<span className="text-muted-foreground">
							{trigger.fromStatus ? (
								<>
									{" "}
									changes from{" "}
									<span className="font-medium text-foreground">
										{statusOptions.find((s) => s.value === trigger.fromStatus)
											?.label || trigger.fromStatus}
									</span>
								</>
							) : (
								" changes"
							)}
						</span>
						<span className="text-muted-foreground"> to </span>
						<span className="font-medium text-foreground">
							{statusOptions.find((s) => s.value === trigger.toStatus)?.label ||
								trigger.toStatus}
						</span>
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

export { STATUS_OPTIONS, OBJECT_TYPES };

