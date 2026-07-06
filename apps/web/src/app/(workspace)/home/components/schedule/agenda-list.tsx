import { format } from "date-fns";
import { CalendarDays } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { CalendarEvent } from "@/types/calendar";
import { EventCard } from "./event-card";
import {
	FILTER_ITEMS,
	matchesFilter,
	sortEvents,
	type ScheduleFilter,
} from "./schedule-data";

export function AgendaList({
	selectedDate,
	events,
	filter,
	onFilterChange,
	onEventClick,
}: {
	selectedDate?: Date;
	events: CalendarEvent[];
	filter: ScheduleFilter;
	onFilterChange: (filter: ScheduleFilter) => void;
	onEventClick?: (date: Date) => void;
}) {
	const visible = sortEvents(events.filter((e) => matchesFilter(e, filter)));
	const heading = selectedDate
		? format(selectedDate, "EEEE, MMMM d")
		: "All events";

	return (
		<div className="flex h-full flex-col gap-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
				<div className="min-w-0">
					<h3 className="text-sm font-semibold text-foreground">{heading}</h3>
					<p className="text-xs text-muted-foreground">
						{visible.length > 0
							? `${visible.length} ${visible.length === 1 ? "item" : "items"}`
							: "Nothing scheduled"}
					</p>
				</div>
				<Select
					value={filter}
					onValueChange={(v) => onFilterChange(v as ScheduleFilter)}
				>
					<SelectTrigger size="sm" className="w-auto min-w-[120px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{FILTER_ITEMS.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<ScrollArea className="-mr-3 max-h-[340px] min-h-[280px] grow pr-3">
				{visible.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
						<span className="flex size-10 items-center justify-center rounded-full bg-muted">
							<CalendarDays
								className="size-5 text-muted-foreground"
								aria-hidden
							/>
						</span>
						<div className="space-y-1">
							<p className="text-sm font-medium text-foreground">
								Nothing scheduled
							</p>
							<p className="text-xs text-muted-foreground">
								{selectedDate
									? "No projects or tasks on this day."
									: "Try a different filter."}
							</p>
						</div>
					</div>
				) : (
					<ul className="space-y-2.5">
						{visible.map((event) => (
							<li key={String(event.id)}>
								<EventCard
									event={event}
									onClick={
										onEventClick
											? () => onEventClick(event.startDate)
											: undefined
									}
								/>
							</li>
						))}
					</ul>
				)}
			</ScrollArea>
		</div>
	);
}
