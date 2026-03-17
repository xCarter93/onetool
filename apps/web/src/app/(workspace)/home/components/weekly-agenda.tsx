"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	format,
	addWeeks,
	startOfWeek,
	differenceInDays,
	startOfDay,
	isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import {
	getWeekDays,
	getViewDateRange,
	getEventColor,
} from "@/lib/calendar-utils";
import type { CalendarEvent } from "@/types/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface WeeklyAgendaProps {
	onEventClick?: (date: Date) => void;
}

const MAX_VISIBLE_EVENTS = 4;

export function WeeklyAgenda({ onEventClick }: WeeklyAgendaProps) {
	const [currentDate, setCurrentDate] = useState(new Date());

	// Calculate date range for data fetching (same pattern as CalendarContainer)
	const dateRange = useMemo(
		() => getViewDateRange(currentDate, "week"),
		[currentDate]
	);

	const startDateUTC = useMemo(() => {
		const d = dateRange.start;
		return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
	}, [dateRange.start]);

	const endDateUTC = useMemo(() => {
		const d = dateRange.end;
		return Date.UTC(
			d.getFullYear(),
			d.getMonth(),
			d.getDate(),
			23,
			59,
			59,
			999
		);
	}, [dateRange.end]);

	const calendarData = useQuery(api.calendar.getCalendarEvents, {
		startDate: startDateUTC,
		endDate: endDateUTC,
	});

	// Convert UTC-to-local (same pattern as CalendarContainer)
	const events: CalendarEvent[] = useMemo(() => {
		if (!calendarData) return [];

		const projectEvents: CalendarEvent[] = calendarData.projects.map((p) => {
			const startDate = new Date(p.startDate);
			const startDateLocal = new Date(
				startDate.getUTCFullYear(),
				startDate.getUTCMonth(),
				startDate.getUTCDate()
			);

			let endDateLocal;
			if (p.endDate) {
				const endDate = new Date(p.endDate);
				endDateLocal = new Date(
					endDate.getUTCFullYear(),
					endDate.getUTCMonth(),
					endDate.getUTCDate()
				);
			}

			return {
				id: p.id,
				type: "project" as const,
				title: p.title,
				description: p.description,
				startDate: startDateLocal,
				endDate: endDateLocal,
				status: p.status,
				clientId: p.clientId,
				clientName: p.clientName,
				assignedUserIds: p.assignedUserIds,
			};
		});

		const taskEvents: CalendarEvent[] = calendarData.tasks.map((t) => {
			const startDate = new Date(t.startDate);
			const startDateLocal = new Date(
				startDate.getUTCFullYear(),
				startDate.getUTCMonth(),
				startDate.getUTCDate()
			);

			return {
				id: t.id,
				type: "task" as const,
				title: t.title,
				description: t.description,
				startDate: startDateLocal,
				startTime: t.startTime,
				endTime: t.endTime,
				status: t.status,
				clientId: t.clientId,
				clientName: t.clientName,
				assignedUserIds: t.assigneeUserId ? [t.assigneeUserId] : undefined,
				projectId: t.projectId,
			};
		});

		return [...projectEvents, ...taskEvents];
	}, [calendarData]);

	// Week navigation
	const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
	const weekStart = weekDays[0];
	const weekEnd = weekDays[6];
	const dateRangeString = `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d")}`;

	const handlePrevWeek = () =>
		setCurrentDate((prev) => addWeeks(prev, -1));
	const handleNextWeek = () =>
		setCurrentDate((prev) => addWeeks(prev, 1));

	// Calculate grid position for an event
	const getEventGridPosition = (event: CalendarEvent) => {
		const eventStart = startOfDay(event.startDate);
		const eventEnd = startOfDay(event.endDate ?? event.startDate);
		const weekStartDay = startOfWeek(currentDate);

		const startCol = Math.max(0, differenceInDays(eventStart, weekStartDay));
		const endCol = Math.min(
			6,
			differenceInDays(eventEnd, weekStartDay)
		);
		const colSpan = endCol - startCol + 1;

		// Determine if event is clipped on left or right edge
		const clippedLeft = differenceInDays(eventStart, weekStartDay) < 0;
		const clippedRight =
			differenceInDays(eventEnd, weekStartDay) > 6;

		return { startCol: startCol + 1, colSpan, clippedLeft, clippedRight };
	};

	const isLoading = calendarData === undefined;
	const hiddenCount = Math.max(0, events.length - MAX_VISIBLE_EVENTS);
	const visibleEvents = events.slice(0, MAX_VISIBLE_EVENTS);

	return (
		<div className="space-y-3">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						This Week
					</h3>
					<p className="text-xs text-muted-foreground mt-0.5">
						{dateRangeString}
					</p>
				</div>
				<div className="flex items-center gap-1">
					<button
						aria-label="Previous week"
						onClick={handlePrevWeek}
						className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors"
					>
						<ChevronLeft className="h-4 w-4 text-muted-foreground" />
					</button>
					<button
						aria-label="Next week"
						onClick={handleNextWeek}
						className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors"
					>
						<ChevronRight className="h-4 w-4 text-muted-foreground" />
					</button>
				</div>
			</div>

			{/* Content */}
			<div className="border border-border rounded-lg p-4 min-h-[360px]">
				{/* Day columns header */}
				<div className="grid grid-cols-7 gap-0 mb-3">
					{weekDays.map((day) => {
						const today = isToday(day);
						return (
							<div
								key={day.toISOString()}
								className={cn(
									"text-center pb-2",
									today && "border-b-2 border-primary"
								)}
							>
								<span
									className={cn(
										"text-[11px] uppercase tracking-wide",
										today
											? "text-primary font-medium"
											: "text-muted-foreground"
									)}
								>
									{format(day, "EEE")}
								</span>
								<span
									className={cn(
										"block text-sm",
										today
											? "text-primary font-medium"
											: "text-foreground"
									)}
								>
									{format(day, "d")}
								</span>
							</div>
						);
					})}
				</div>

				{/* Loading state */}
				{isLoading && (
					<div className="space-y-2 mt-4">
						<Skeleton className="h-8 w-[60%] rounded-md" />
						<Skeleton className="h-8 w-[40%] rounded-md" />
						<Skeleton className="h-8 w-[75%] rounded-md" />
						<Skeleton className="h-8 w-[50%] rounded-md" />
					</div>
				)}

				{/* Empty state */}
				{!isLoading && events.length === 0 && (
					<div className="flex flex-col items-center justify-center py-12 gap-2">
						<CalendarDays className="h-8 w-8 text-muted-foreground" />
						<p className="text-sm font-medium">No events this week</p>
						<p className="text-xs text-muted-foreground">
							Nothing scheduled for {dateRangeString}.
						</p>
					</div>
				)}

				{/* Event rows (Gantt-lite bars) */}
				{!isLoading && events.length > 0 && (
					<div className="space-y-1.5">
						{visibleEvents.map((event) => {
							const { startCol, colSpan, clippedLeft, clippedRight } =
								getEventGridPosition(event);
							const colors = getEventColor(event.type, event.status);

							return (
								<div
									key={String(event.id)}
									className="grid grid-cols-7 gap-0"
								>
									<div
										className={cn(
											"rounded-md px-2 py-1 cursor-pointer border transition-colors duration-150",
											colors.bg,
											colors.border,
											colors.text,
											colors.hover,
											clippedLeft && "rounded-l-none",
											clippedRight && "rounded-r-none"
										)}
										style={{
											gridColumnStart: startCol,
											gridColumnEnd: `span ${colSpan}`,
										}}
										onClick={() => onEventClick?.(event.startDate)}
									>
										<p className="text-xs font-medium truncate">
											{event.title}
										</p>
										<p className="text-xs opacity-70 truncate">
											{event.clientName}
										</p>
									</div>
								</div>
							);
						})}

						{/* Overflow button */}
						{hiddenCount > 0 && (
							<button
								className="text-xs text-primary hover:underline mt-1"
								onClick={() => onEventClick?.(new Date())}
							>
								+{hiddenCount} more
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
