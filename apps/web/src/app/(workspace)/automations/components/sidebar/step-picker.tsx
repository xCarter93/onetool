"use client";

import React, { useState } from "react";
import {
	GitBranch,
	Play,
	Database,
	Repeat,
	CircleStop,
	Search,
	X,
	ListTodo,
	Bell,
	MessagesSquare,
	Timer,
	CalendarClock,
	Sigma,
	Clock3,
	SkipForward,
	type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type StepGroupItem = {
	type: string;
	label: string;
	icon: LucideIcon;
	color: string;
	/** Selects the action variant when type is "action". */
	actionType?: string;
	comingSoon?: boolean;
};

type StepGroup = {
	label: string;
	items: StepGroupItem[];
};

export const STEP_GROUPS: StepGroup[] = [
	{
		label: "Logic",
		items: [
			{
				type: "condition",
				label: "Condition",
				icon: GitBranch,
				color: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
			},
		],
	},
	{
		label: "Records",
		items: [
			{
				type: "action",
				label: "Update Record",
				icon: Play,
				color: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
			},
			{
				type: "action",
				actionType: "create_task",
				label: "Create Task",
				icon: ListTodo,
				color: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
			},
			{
				type: "fetch_records",
				label: "Find Records",
				icon: Database,
				color: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
			},
		],
	},
	{
		label: "Communication",
		items: [
			{
				type: "action",
				actionType: "send_notification",
				label: "Send Notification",
				icon: Bell,
				color: "bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400",
			},
			{
				type: "action",
				actionType: "send_team_message",
				label: "Send Team Message",
				icon: MessagesSquare,
				color: "bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400",
			},
		],
	},
	{
		label: "Utilities",
		items: [
			{
				type: "loop",
				label: "Loop",
				icon: Repeat,
				color: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400",
			},
			{
				type: "aggregate",
				label: "Aggregate",
				icon: Sigma,
				color: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400",
			},
			{
				type: "adjust_time",
				label: "Adjust time",
				icon: Clock3,
				color: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400",
			},
			{
				type: "delay",
				label: "Delay",
				icon: Timer,
				color: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400",
			},
			{
				type: "delay_until",
				label: "Delay until",
				icon: CalendarClock,
				color: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400",
			},
		],
	},
	{
		label: "Flow",
		items: [
			{
				type: "end",
				label: "End",
				icon: CircleStop,
				color: "bg-muted text-muted-foreground",
			},
			{
				type: "next_item",
				label: "Next item",
				icon: SkipForward,
				color: "bg-muted text-muted-foreground",
			},
		],
	},
];

interface StepPickerProps {
	onSelect: (stepType: string, actionType?: string) => void;
	onClose?: () => void;
	/** True when inserting inside a loop body — offers "Next item" and hides "End" (invalid there). */
	inLoop?: boolean;
}

export function StepPicker({ onSelect, onClose, inLoop = false }: StepPickerProps) {
	const [search, setSearch] = useState("");
	const lowerSearch = search.toLowerCase();

	const filteredGroups = STEP_GROUPS.map((group) => ({
		...group,
		items: group.items.filter((item) => {
			if (item.type === "next_item" && !inLoop) return false;
			if (item.type === "end" && inLoop) return false;
			return item.label.toLowerCase().includes(lowerSearch);
		}),
	})).filter((group) => group.items.length > 0);

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="relative">
				<h2 className="text-base font-semibold">Add a step</h2>
				<p className="text-sm text-muted-foreground mt-0.5">
					Choose what happens next
				</p>
				{onClose && (
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={onClose}
						className="absolute top-0 right-0"
						aria-label="Close sidebar"
					>
						<X className="h-4 w-4" />
					</Button>
				)}
			</div>

			{/* Search */}
			<div className="relative mt-4">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search steps..."
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
										key={`${item.type}-${item.actionType ?? ""}-${item.label}`}
										type="button"
										disabled={item.comingSoon}
										onClick={() => !item.comingSoon && onSelect(item.type, item.actionType)}
										className={cn(
											"w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left",
											item.comingSoon
												? "opacity-50 cursor-not-allowed"
												: "hover:bg-accent"
										)}
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
										{item.comingSoon && (
											<span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
												Soon
											</span>
										)}
									</button>
								);
							})}
						</div>
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
