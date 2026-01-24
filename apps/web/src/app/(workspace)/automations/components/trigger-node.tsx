"use client";

import React from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface TriggerNodeProps {
	trigger: TriggerConfig;
	onClick?: () => void;
}

export function TriggerNode({ trigger, onClick }: TriggerNodeProps) {
	const statusOptions = STATUS_OPTIONS[trigger.objectType] || [];
	const objectLabel =
		OBJECT_TYPES.find((t) => t.value === trigger.objectType)?.label ||
		trigger.objectType;
	const toStatusLabel =
		statusOptions.find((s) => s.value === trigger.toStatus)?.label ||
		trigger.toStatus;

	return (
		<div className="flex flex-col items-center">
			<button
				onClick={onClick}
				className={cn(
					"group relative flex items-center gap-3 px-5 py-4 rounded-2xl",
					"bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40",
					"border-2 border-amber-200 dark:border-amber-800",
					"shadow-lg shadow-amber-100/50 dark:shadow-amber-900/20",
					"hover:shadow-xl hover:shadow-amber-200/50 dark:hover:shadow-amber-800/30",
					"hover:border-amber-300 dark:hover:border-amber-700",
					"transition-all duration-200 cursor-pointer",
					"min-w-[280px]"
				)}
			>
				{/* Icon */}
				<div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md">
					<Zap className="h-5 w-5 text-white" />
				</div>

				{/* Content */}
				<div className="flex-1 text-left">
					<div className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
						Trigger
					</div>
					<div className="text-sm font-semibold text-foreground">
						When {objectLabel} → {toStatusLabel}
					</div>
				</div>

				{/* Glow effect on hover */}
				<div className="absolute inset-0 rounded-2xl bg-amber-400/0 group-hover:bg-amber-400/5 transition-colors duration-200" />
			</button>
		</div>
	);
}

export { STATUS_OPTIONS, OBJECT_TYPES };

