"use client";

import { useState, useEffect, useRef } from "react";
import { CalendarEvent } from "@/types/calendar";
import { isToday } from "date-fns";
import {
	formatTime,
	getEventColor,
	isEventOnDate,
	layoutTimedDayEvents,
	parseTimeToMinutes,
} from "@/lib/calendar-utils";
import { CalendarEventIcon } from "./calendar-event-icon";
import { CalendarEventBar } from "./calendar-event-bar";
import { CalendarDetailSidebar } from "./calendar-detail-sidebar";
import { EmptyState } from "@/components/domain/empty-state";
import { cn } from "@/lib/utils";

interface CalendarDayViewProps {
	date: Date;
	events: CalendarEvent[];
	selectedEventId?: string | null;
}

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;
const HOUR_HEIGHT = 80; // px per hour
const GRID_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;
// Gridline hours, including the closing 10 PM line
const HOURS = Array.from(
	{ length: DAY_END_HOUR - DAY_START_HOUR + 1 },
	(_, i) => i + DAY_START_HOUR
);

function formatHourLabel(hour: number): string {
	const period = hour >= 12 ? "PM" : "AM";
	return `${hour % 12 || 12} ${period}`;
}

function minutesSinceGridStart(date: Date): number {
	return (
		date.getHours() * 60 + date.getMinutes() - DAY_START_HOUR * 60
	);
}

export function CalendarDayView({
	date,
	events,
	selectedEventId,
}: CalendarDayViewProps) {
	const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
		null
	);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	// Minute-precise "now" for the current-time indicator
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const interval = setInterval(() => setNow(new Date()), 60_000);
		return () => clearInterval(interval);
	}, []);

	// Filter events for this specific day
	const dayEvents = events.filter((event) => isEventOnDate(event, date));

	// Separate projects and tasks
	const projects = dayEvents.filter((e) => e.type === "project");
	const tasks = dayEvents.filter((e) => e.type === "task");

	const timedLayouts = layoutTimedDayEvents(tasks, {
		dayStartHour: DAY_START_HOUR,
		dayEndHour: DAY_END_HOUR,
		hourHeight: HOUR_HEIGHT,
	});
	const unscheduledTasks = tasks.filter(
		(t) => parseTimeToMinutes(t.startTime) === null
	);

	const nowOffset = isToday(date)
		? (minutesSinceGridStart(now) / 60) * HOUR_HEIGHT
		: null;
	const showNowLine =
		nowOffset !== null && nowOffset >= 0 && nowOffset <= GRID_HEIGHT;

	// Center the view on the current time (or the first task) on mount
	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;
		const target = isToday(date)
			? (minutesSinceGridStart(new Date()) / 60) * HOUR_HEIGHT
			: null;
		if (target !== null && target >= 0 && target <= GRID_HEIGHT) {
			container.scrollTo({
				top: Math.max(0, target - container.clientHeight / 2),
				behavior: "smooth",
			});
		}
	}, [date]);

	// Sync selected event from navigation. Resolution is retried each render until
	// the event appears in dayEvents (events may load after the id arrives); the
	// `resolvedEventId` guard stops once matched and won't clobber a user click.
	const [prevSelectedEventId, setPrevSelectedEventId] =
		useState(selectedEventId);
	const [resolvedEventId, setResolvedEventId] = useState<string | null>(null);
	if (selectedEventId !== prevSelectedEventId) {
		setPrevSelectedEventId(selectedEventId);
		setResolvedEventId(null);
		// Drop stale details until the new target resolves from dayEvents.
		setSelectedEvent(null);
	}
	if (selectedEventId && resolvedEventId !== selectedEventId) {
		const event = dayEvents.find((e) => e.id === selectedEventId);
		if (event) {
			setResolvedEventId(selectedEventId);
			setSelectedEvent(event);
		}
	}

	const handleEventClick = (event: CalendarEvent) => {
		setSelectedEvent(event);
	};

	return (
		<div className="flex h-full gap-4 flex-col lg:flex-row">
			{/* Main Calendar Area */}
			<div className="flex-1 overflow-hidden flex flex-col min-w-0 min-h-0">
				{/* Active Projects Section */}
				{projects.length > 0 && (
					<div className="border-b border-border bg-muted/30 px-4 py-3">
						<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
							Active Projects
						</h3>
						<div className="flex flex-wrap gap-2">
							{projects.map((project) => (
								<div key={project.id} className="flex-1 min-w-[200px]">
									<CalendarEventBar
										event={project}
										onClick={() => handleEventClick(project)}
									/>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Unscheduled tasks (no start time) */}
				{unscheduledTasks.length > 0 && (
					<div className="border-b border-border px-4 py-3">
						<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
							Unscheduled
						</h3>
						<div className="flex flex-wrap gap-2">
							{unscheduledTasks.map((task) => (
								<button
									key={task.id}
									type="button"
									onClick={() => handleEventClick(task)}
									className={cn(
										"flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-left transition-shadow hover:shadow-md",
										selectedEvent?.id === task.id
											? "ring-2 ring-primary border-transparent"
											: "border-border"
									)}
								>
									<CalendarEventIcon event={task} size="sm" />
									<span className="text-sm font-medium text-foreground truncate max-w-48">
										{task.title}
									</span>
									{task.clientName && (
										<span className="text-xs text-muted-foreground truncate max-w-40">
											{task.clientName}
										</span>
									)}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Timeline */}
				{dayEvents.length > 0 ? (
					<div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
						<div className="flex py-3 pr-4">
							{/* Hour gutter */}
							<div
								className="relative w-16 shrink-0"
								style={{ height: GRID_HEIGHT }}
							>
								{HOURS.map((hour) => (
									<div
										key={hour}
										className="absolute right-3 -translate-y-1/2 text-xs font-medium whitespace-nowrap text-muted-foreground"
										style={{ top: (hour - DAY_START_HOUR) * HOUR_HEIGHT }}
									>
										{formatHourLabel(hour)}
									</div>
								))}
							</div>

							{/* Events column */}
							<div
								className="relative flex-1 min-w-0"
								style={{ height: GRID_HEIGHT }}
							>
								{HOURS.map((hour) => (
									<div
										key={hour}
										data-hour={hour}
										className="absolute left-0 right-0 border-t border-border"
										style={{ top: (hour - DAY_START_HOUR) * HOUR_HEIGHT }}
									/>
								))}

								{timedLayouts.map(({ event, top, height, left, width }) => {
									const colors = getEventColor(event.type, event.status);
									const compact = height < 56;
									return (
										<button
											key={event.id}
											type="button"
											onClick={() => handleEventClick(event)}
											className={cn(
												"absolute overflow-hidden rounded-lg border px-2.5 py-1.5 text-left transition-shadow hover:shadow-md",
												colors.bg,
												colors.hover,
												selectedEvent?.id === event.id
													? "ring-2 ring-primary border-transparent"
													: colors.border
											)}
											style={{
												top: top + 1,
												height: height - 2,
												left: `${left}%`,
												width: `calc(${width}% - 4px)`,
											}}
										>
											<div
												className={cn(
													"min-w-0",
													compact && "flex items-baseline gap-2"
												)}
											>
												<div className="text-sm font-medium text-foreground truncate">
													{event.title}
												</div>
												<div className="text-xs text-muted-foreground truncate">
													{event.startTime && formatTime(event.startTime)}
													{event.endTime &&
														` – ${formatTime(event.endTime)}`}
												</div>
												{!compact && event.clientName && (
													<div className="text-xs text-muted-foreground truncate mt-0.5">
														{event.clientName}
													</div>
												)}
											</div>
										</button>
									);
								})}

								{/* Current time indicator */}
								{showNowLine && (
									<div
										className="absolute left-0 right-0 h-0.5 bg-primary pointer-events-none z-10"
										style={{ top: nowOffset }}
									>
										<div className="absolute -left-1 -top-[3px] w-2 h-2 bg-primary rounded-full" />
									</div>
								)}
							</div>
						</div>
					</div>
				) : (
					<div className="flex-1 flex items-center justify-center">
						<EmptyState
							illustration="all-caught-up"
							title="No events scheduled"
							description="Enjoy your free day!"
							size="md"
						/>
					</div>
				)}
			</div>

			{/* Detail Panel - Hidden on mobile, shown on large screens */}
			<div className="hidden lg:block lg:w-80 xl:w-96 border-l border-border bg-background overflow-hidden shrink-0">
				<CalendarDetailSidebar event={selectedEvent} currentDate={date} />
			</div>

			{/* Mobile Detail Panel - Shows below timeline on mobile when event is selected */}
			{selectedEvent && (
				<div className="lg:hidden border-t border-border bg-background overflow-y-auto max-h-96">
					<CalendarDetailSidebar event={selectedEvent} currentDate={date} />
				</div>
			)}
		</div>
	);
}
