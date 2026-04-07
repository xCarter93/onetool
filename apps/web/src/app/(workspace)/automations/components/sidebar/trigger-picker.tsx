"use client";

import React, { useState } from "react";
import {
	RefreshCw,
	Plus,
	Edit,
	Clock,
	Mail,
	Search,
	Check,
	X,
	type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TriggerGroupItem = {
	type: string;
	label: string;
	icon: LucideIcon;
	color: string;
};

type TriggerGroup = {
	label: string;
	items: TriggerGroupItem[];
};

const TRIGGER_GROUPS: TriggerGroup[] = [
	{
		label: "Records",
		items: [
			{
				type: "status_changed",
				label: "Status Changed",
				icon: RefreshCw,
				color: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
			},
			{
				type: "record_created",
				label: "Record Created",
				icon: Plus,
				color: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
			},
			{
				type: "record_updated",
				label: "Record Updated",
				icon: Edit,
				color: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
			},
		],
	},
	{
		label: "Scheduling",
		items: [
			{
				type: "scheduled",
				label: "Scheduled",
				icon: Clock,
				color: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
			},
		],
	},
	{
		label: "Communication",
		items: [
			{
				type: "email_received",
				label: "Email Received",
				icon: Mail,
				color: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
			},
		],
	},
];

interface TriggerPickerProps {
	onSelect: (triggerType: string) => void;
	currentTriggerType?: string;
	onClose?: () => void;
}

export function TriggerPicker({
	onSelect,
	currentTriggerType,
	onClose,
}: TriggerPickerProps) {
	const [search, setSearch] = useState("");
	const lowerSearch = search.toLowerCase();

	const filteredGroups = TRIGGER_GROUPS.map((group) => ({
		...group,
		items: group.items.filter((item) =>
			item.label.toLowerCase().includes(lowerSearch)
		),
	})).filter((group) => group.items.length > 0);

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="relative">
				<h2 className="text-base font-semibold">Change trigger</h2>
				<p className="text-sm text-muted-foreground mt-0.5">
					Pick an event to start this workflow
				</p>
				{onClose && (
					<button
						type="button"
						onClick={onClose}
						className="absolute top-0 right-0 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
						aria-label="Close sidebar"
					>
						<X className="h-4 w-4" />
					</button>
				)}
			</div>

			{/* Search */}
			<div className="relative mt-4">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search triggers..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
				/>
			</div>

			{/* Grouped list */}
			<div className="space-y-6">
				{filteredGroups.map((group) => (
					<div key={group.label}>
						<div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
							{group.label}
						</div>
						<div className="space-y-0.5">
							{group.items.map((item) => {
								const Icon = item.icon;
								return (
									<button
										key={item.type}
										type="button"
										onClick={() => onSelect(item.type)}
										className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors text-left"
									>
										<div
											className={cn(
												"w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
												item.color
											)}
										>
											<Icon className="h-4 w-4" />
										</div>
										<span className="text-sm flex-1">
											{item.label}
										</span>
										{currentTriggerType === item.type && (
											<Check className="h-4 w-4 text-primary shrink-0" />
										)}
									</button>
								);
							})}
						</div>
					</div>
				))}

				{filteredGroups.length === 0 && (
					<div className="text-sm text-muted-foreground text-center py-4">
						No triggers match your search
					</div>
				)}
			</div>
		</div>
	);
}
