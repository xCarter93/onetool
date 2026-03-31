"use client";

import React, { useState } from "react";
import {
	GitBranch,
	Repeat,
	Play,
	Bell,
	PlusCircle,
	Search,
	Square,
	type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";

type StepGroupItem = {
	type: string;
	label: string;
	icon: LucideIcon;
	colorBg: string;
	colorText: string;
};

type StepGroup = {
	label: string;
	items: StepGroupItem[];
};

const STEP_GROUPS: StepGroup[] = [
	{
		label: "Logic",
		items: [
			{
				type: "condition",
				label: "Condition",
				icon: GitBranch,
				colorBg: "bg-purple-50 dark:bg-purple-950/40",
				colorText: "text-purple-600 dark:text-purple-400",
			},
			{
				type: "loop",
				label: "Loop",
				icon: Repeat,
				colorBg: "bg-orange-50 dark:bg-orange-950/40",
				colorText: "text-orange-600 dark:text-orange-400",
			},
		],
	},
	{
		label: "Actions",
		items: [
			{
				type: "action",
				label: "Update Record",
				icon: Play,
				colorBg: "bg-green-50 dark:bg-green-950/40",
				colorText: "text-green-600 dark:text-green-400",
			},
			{
				type: "send_notification",
				label: "Send Notification",
				icon: Bell,
				colorBg: "bg-green-50 dark:bg-green-950/40",
				colorText: "text-green-600 dark:text-green-400",
			},
			{
				type: "create_record",
				label: "Create Record",
				icon: PlusCircle,
				colorBg: "bg-green-50 dark:bg-green-950/40",
				colorText: "text-green-600 dark:text-green-400",
			},
		],
	},
	{
		label: "Data",
		items: [
			{
				type: "fetch_records",
				label: "Fetch Records",
				icon: Search,
				colorBg: "bg-blue-50 dark:bg-blue-950/40",
				colorText: "text-blue-600 dark:text-blue-400",
			},
		],
	},
	{
		label: "Flow",
		items: [
			{
				type: "end",
				label: "End",
				icon: Square,
				colorBg: "bg-red-50 dark:bg-red-950/40",
				colorText: "text-red-600 dark:text-red-400",
			},
		],
	},
];

interface StepPickerProps {
	onSelect: (stepType: string) => void;
}

export function StepPicker({ onSelect }: StepPickerProps) {
	const [search, setSearch] = useState("");
	const lowerSearch = search.toLowerCase();

	const filteredGroups = STEP_GROUPS.map((group) => ({
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
									<div
										className={`w-8 h-8 rounded-lg ${item.colorBg} flex items-center justify-center`}
									>
										<Icon className={`h-4 w-4 ${item.colorText}`} />
									</div>
									<span className="text-sm font-medium">{item.label}</span>
								</button>
							);
						})}
					</div>
				))}

				{filteredGroups.length === 0 && (
					<div className="text-sm text-muted-foreground text-center py-4">
						No steps match your search
					</div>
				)}
			</div>
		</div>
	);
}
