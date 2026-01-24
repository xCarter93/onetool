"use client";

import React, { useState } from "react";
import { Zap, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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
	onChange: (trigger: TriggerConfig) => void;
}

export function TriggerNode({ trigger, onChange }: TriggerNodeProps) {
	const [isOpen, setIsOpen] = useState(false);
	const statusOptions = STATUS_OPTIONS[trigger.objectType] || [];
	const objectLabel =
		OBJECT_TYPES.find((t) => t.value === trigger.objectType)?.label ||
		trigger.objectType;
	const toStatusLabel =
		statusOptions.find((s) => s.value === trigger.toStatus)?.label ||
		trigger.toStatus;

	const handleObjectTypeChange = (value: string) => {
		const newType = value as TriggerConfig["objectType"];
		const newStatusOptions = STATUS_OPTIONS[newType] || [];
		onChange({
			objectType: newType,
			fromStatus: undefined,
			toStatus: newStatusOptions[0]?.value || "",
		});
	};

	return (
		<div className="flex flex-col items-center">
			<Popover open={isOpen} onOpenChange={setIsOpen}>
				<PopoverTrigger asChild>
					<button
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

						{/* Chevron */}
						<ChevronDown
							className={cn(
								"h-4 w-4 text-amber-500 transition-transform duration-200",
								isOpen && "rotate-180"
							)}
						/>

						{/* Glow effect on hover */}
						<div className="absolute inset-0 rounded-2xl bg-amber-400/0 group-hover:bg-amber-400/5 transition-colors duration-200" />
					</button>
				</PopoverTrigger>

				<PopoverContent className="w-80 p-4" align="center">
					<div className="space-y-4">
						<div className="flex items-center gap-2 pb-2 border-b">
							<div className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/50">
								<Zap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
							</div>
							<span className="font-medium text-sm">Configure Trigger</span>
						</div>

						<div className="space-y-3">
							<div className="space-y-1.5">
								<Label className="text-xs text-muted-foreground">
									When this object
								</Label>
								<Select
									value={trigger.objectType}
									onValueChange={handleObjectTypeChange}
								>
									<SelectTrigger className="h-9">
										<SelectValue />
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

							<div className="space-y-1.5">
								<Label className="text-xs text-muted-foreground">
									Changes from
								</Label>
								<Select
									value={trigger.fromStatus || "any"}
									onValueChange={(value) =>
										onChange({
											...trigger,
											fromStatus: value === "any" ? undefined : value,
										})
									}
								>
									<SelectTrigger className="h-9">
										<SelectValue />
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

							<div className="space-y-1.5">
								<Label className="text-xs text-muted-foreground">To</Label>
								<Select
									value={trigger.toStatus}
									onValueChange={(value) =>
										onChange({ ...trigger, toStatus: value })
									}
								>
									<SelectTrigger className="h-9">
										<SelectValue />
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

						<Button
							className="w-full mt-2"
							size="sm"
							onPress={() => setIsOpen(false)}
						>
							<Check className="h-4 w-4 mr-1.5" />
							Done
						</Button>
					</div>
				</PopoverContent>
			</Popover>

			{/* Connector line going down */}
			<div className="w-0.5 h-8 bg-border" />
		</div>
	);
}

export { STATUS_OPTIONS, OBJECT_TYPES };

