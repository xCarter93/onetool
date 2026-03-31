"use client";

import React, { useState } from "react";
import {
	Zap,
	FileText,
	RefreshCw,
	Mail,
	Clock,
	type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";

type TriggerGroupItem = {
	type: string;
	label: string;
	icon: LucideIcon;
};

type TriggerGroup = {
	label: string;
	items: TriggerGroupItem[];
};

const TRIGGER_GROUPS: TriggerGroup[] = [
	{
		label: "Status Changes",
		items: [{ type: "status_changed", label: "Status changed", icon: Zap }],
	},
	{
		label: "Record Events",
		items: [
			{ type: "record_created", label: "Record created", icon: FileText },
			{ type: "record_updated", label: "Record updated", icon: RefreshCw },
		],
	},
	{
		label: "Communication",
		items: [{ type: "email_received", label: "Email received", icon: Mail }],
	},
	{
		label: "Schedule",
		items: [{ type: "scheduled", label: "Recurring schedule", icon: Clock }],
	},
];

interface TriggerPickerProps {
	onSelect: (triggerType: string) => void;
}

export function TriggerPicker({ onSelect }: TriggerPickerProps) {
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
			<Input
				placeholder="Search..."
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				className="w-full"
			/>

			<div className="space-y-6">
				{filteredGroups.map((group) => (
					<div key={group.label} className="space-y-1">
						<div className="text-xs font-semibold uppercase text-muted-foreground px-4 mb-2">
							{group.label}
						</div>
						{group.items.map((item) => {
							const Icon = item.icon;
							return (
								<button
									key={item.type}
									type="button"
									className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-accent transition-colors"
									onClick={() => onSelect(item.type)}
								>
									<div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
										<Icon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
									</div>
									<span className="text-sm font-medium">{item.label}</span>
								</button>
							);
						})}
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
