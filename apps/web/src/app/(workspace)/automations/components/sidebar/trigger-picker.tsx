"use client";

import React, { useState } from "react";
import { RefreshCw, Plus, Edit, Clock, Search, Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { TRIGGER_TYPE_OPTIONS, type TriggerType } from "../../lib/node-types";
import { STEP_FAMILY_STYLE } from "../../lib/step-family";

const TRIGGER_ICONS: Record<TriggerType, LucideIcon> = {
	status_changed: RefreshCw,
	record_created: Plus,
	record_updated: Edit,
	scheduled: Clock,
};

const TRIGGER_COLOR =
	STEP_FAMILY_STYLE.trigger.band;

interface TriggerPickerProps {
	onSelect: (triggerType: string) => void;
	currentTriggerType?: string;
}

export function TriggerPicker({
	onSelect,
	currentTriggerType,
}: TriggerPickerProps) {
	const [search, setSearch] = useState("");
	const lowerSearch = search.toLowerCase();

	const filteredOptions = TRIGGER_TYPE_OPTIONS.filter((option) =>
		option.label.toLowerCase().includes(lowerSearch)
	);

	return (
		<div className="space-y-4">
			{/* Search */}
			<div className="relative">
				<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="search"
					placeholder="Search triggers..."
					aria-label="Search triggers"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="pl-8"
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
								<span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
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
