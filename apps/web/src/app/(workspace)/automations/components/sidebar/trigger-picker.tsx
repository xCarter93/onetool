"use client";

import React, { useState } from "react";
import { RefreshCw, Plus, Edit, Clock, Search, Check, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRIGGER_TYPE_OPTIONS, type TriggerType } from "../../lib/node-types";

const TRIGGER_ICONS: Record<TriggerType, LucideIcon> = {
	status_changed: RefreshCw,
	record_created: Plus,
	record_updated: Edit,
	scheduled: Clock,
};

const TRIGGER_COLOR =
	"bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400";

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

	const filteredOptions = TRIGGER_TYPE_OPTIONS.filter((option) =>
		option.label.toLowerCase().includes(lowerSearch)
	);

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

			{/* List */}
			<div className="space-y-0.5">
				{filteredOptions.map((option) => {
					const Icon = TRIGGER_ICONS[option.value];
					return (
						<button
							key={option.value}
							type="button"
							disabled={option.comingSoon}
							onClick={() => !option.comingSoon && onSelect(option.value)}
							className={cn(
								"w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left",
								option.comingSoon
									? "opacity-50 cursor-not-allowed"
									: "hover:bg-accent"
							)}
						>
							<div
								className={cn(
									"w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
									TRIGGER_COLOR
								)}
							>
								<Icon className="h-4 w-4" />
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-sm">{option.label}</div>
								<div className="text-xs text-muted-foreground truncate">
									{option.description}
								</div>
							</div>
							{option.comingSoon ? (
								<span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
									Soon
								</span>
							) : (
								currentTriggerType === option.value && (
									<Check className="h-4 w-4 text-primary shrink-0" />
								)
							)}
						</button>
					);
				})}

				{filteredOptions.length === 0 && (
					<div className="text-sm text-muted-foreground text-center py-4">
						No triggers match your search
					</div>
				)}
			</div>
		</div>
	);
}
