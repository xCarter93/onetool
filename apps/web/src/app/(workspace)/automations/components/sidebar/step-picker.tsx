"use client";

import React, { useState } from "react";
import {
	GitBranch,
	Play,
	Database,
	Repeat,
	CircleStop,
	Search,
	ListTodo,
	FilePlus,
	Bell,
	Mail,
	MessagesSquare,
	Timer,
	CalendarClock,
	Sigma,
	Clock3,
	SkipForward,
	type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { STEP_FAMILY_STYLE, type StepFamily } from "../../lib/step-family";

const STEP_COLOR = Object.fromEntries(
	(Object.keys(STEP_FAMILY_STYLE) as StepFamily[]).map((family) => [
		family,
		STEP_FAMILY_STYLE[family].band,
	])
) as Record<StepFamily, string>;

export type StepGroupItem = {
	type: string;
	label: string;
	icon: LucideIcon;
	color: string;
	/** Selects the action variant when type is "action". */
	actionType?: string;
	comingSoon?: boolean;
	/** Set when the step can't work in this position; shown instead of enabling it. */
	disabledReason?: string;
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
				color: STEP_COLOR.logic,
			},
		],
	},
	{
		label: "Records",
		items: [
			{
				type: "action",
				actionType: "update_fields",
				label: "Update Record",
				icon: Play,
				color: STEP_COLOR.action,
			},
			{
				type: "action",
				actionType: "create_task",
				label: "Create Task",
				icon: ListTodo,
				color: STEP_COLOR.action,
			},
			{
				type: "action",
				actionType: "create_record",
				label: "Create Record",
				icon: FilePlus,
				color: STEP_COLOR.action,
			},
			{
				type: "fetch_records",
				label: "Find Records",
				icon: Database,
				color: STEP_COLOR.action,
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
				color: STEP_COLOR.action,
			},
			{
				type: "action",
				actionType: "send_team_message",
				label: "Send Team Message",
				icon: MessagesSquare,
				color: STEP_COLOR.action,
			},
			{
				type: "action",
				actionType: "send_email",
				label: "Send Email",
				icon: Mail,
				color: STEP_COLOR.action,
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
				color: STEP_COLOR.logic,
			},
			{
				type: "aggregate",
				label: "Aggregate",
				icon: Sigma,
				color: STEP_COLOR.logic,
			},
			{
				type: "adjust_time",
				label: "Adjust time",
				icon: Clock3,
				color: STEP_COLOR.logic,
			},
			{
				type: "delay",
				label: "Delay",
				icon: Timer,
				color: STEP_COLOR.logic,
			},
			{
				type: "delay_until",
				label: "Delay until",
				icon: CalendarClock,
				color: STEP_COLOR.logic,
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
				color: STEP_COLOR.flow,
			},
			{
				type: "next_item",
				label: "Next item",
				icon: SkipForward,
				color: STEP_COLOR.flow,
			},
		],
	},
];

interface StepPickerProps {
	onSelect: (stepType: string, actionType?: string) => void;
	/** True when inserting inside a loop body — offers "Next item" and hides "End" (invalid there). */
	inLoop?: boolean;
	/** The trigger's type. A scheduled run has no record, which rules some steps out. */
	triggerType?: string;
}

export function StepPicker({
	onSelect,
	inLoop = false,
	triggerType,
}: StepPickerProps) {
	const [search, setSearch] = useState("");
	const lowerSearch = search.toLowerCase();

	// A scheduled run has no triggering record, so outside a loop there is
	// nothing for "Update Record" to act on. Offering it anyway would let a user
	// build a step they cannot save and cannot fix in place — the panel has no
	// control for pointing it at another record.
	const noRecordInScope = triggerType === "scheduled" && !inLoop;

	const filteredGroups = STEP_GROUPS.map((group) => ({
		...group,
		items: group.items
			.filter((item) => {
				if (item.type === "next_item" && !inLoop) return false;
				if (item.type === "end" && inLoop) return false;
				return item.label.toLowerCase().includes(lowerSearch);
			})
			.map((item) =>
				noRecordInScope &&
				item.type === "action" &&
				(!item.actionType || item.actionType === "update_fields")
					? {
							...item,
							disabledReason: "Needs a record — add Find Records, then a Loop",
						}
					: item
			),
	})).filter((group) => group.items.length > 0);

	return (
		<div className="space-y-4">
			{/* Search */}
			<div className="relative">
				<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="search"
					placeholder="Search steps..."
					aria-label="Search steps"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="pl-8"
				/>
			</div>

			{/* Grouped list */}
			<div className="space-y-6">
				{filteredGroups.map((group) => (
					<div key={group.label}>
						<div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
							{group.label}
						</div>
						<div className="space-y-0.5">
							{group.items.map((item) => {
								const Icon = item.icon;
								const disabled =
									item.comingSoon || Boolean(item.disabledReason);
								return (
									<button
										key={`${item.type}-${item.actionType ?? ""}-${item.label}`}
										type="button"
										disabled={disabled}
										title={item.disabledReason}
										onClick={() => !disabled && onSelect(item.type, item.actionType)}
										className={cn(
											"w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left",
											disabled
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
											{item.disabledReason && (
												<span className="block text-xs text-muted-foreground">
													{item.disabledReason}
												</span>
											)}
										</span>
										{item.comingSoon && (
											<span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
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
