"use client";

import React, { useState, useEffect, useRef } from "react";
import { CalendarEvent } from "@/types/calendar";
import { format, isToday } from "date-fns";
import { formatTime, isEventOnDate } from "@/lib/calendar-utils";
import { CalendarEventIcon } from "./calendar-event-icon";
import { CalendarEventBar } from "./calendar-event-bar";
import { CalendarDetailSidebar } from "./calendar-detail-sidebar";
import { Calendar as CalendarIcon } from "lucide-react";

interface CalendarDayViewProps {
	date: Date;
	events: CalendarEvent[];
	selectedEventId?: string | null;
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6 AM to 10 PM

export function CalendarDayView({
	date,
	events,
	selectedEventId,
}: CalendarDayViewProps) {
	const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
		null
	);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	// Filter events for this specific day
	const dayEvents = events.filter((event) => isEventOnDate(event, date));

	// Separate projects and tasks
	const projects = dayEvents.filter((e) => e.type === "project");
	const tasks = dayEvents.filter((e) => e.type === "task");

	// Group tasks by hour
	const tasksByHour: { [hour: number]: CalendarEvent[] } = {};
	tasks.forEach((task) => {
		if (task.startTime) {
			const hour = parseInt(task.startTime.split(":")[0]);
			if (!tasksByHour[hour]) {
				tasksByHour[hour] = [];
			}
			tasksByHour[hour].push(task);
		} else {
			// Tasks without time go to 9 AM slot
			if (!tasksByHour[9]) {
				tasksByHour[9] = [];
			}
			tasksByHour[9].push(task);
		}
	});

	// Scroll to current hour on mount
	useEffect(() => {
		if (isToday(date) && scrollContainerRef.current) {
			const currentHour = new Date().getHours();
			const hourElement = scrollContainerRef.current.querySelector(
				`[data-hour="${currentHour}"]`
			);
			if (hourElement) {
				hourElement.scrollIntoView({ block: "center", behavior: "smooth" });
			}
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
				{/* Header */}
				<div className="border-b border-border bg-background px-4 py-3">
					<div className="flex items-center justify-between">
						<div>
							<h2 className="text-lg font-semibold text-foreground">
								{format(date, "EEEE, MMMM d, yyyy")}
							</h2>
							{isToday(date) && (
								<span className="text-xs text-muted-foreground">Today</span>
							)}
						</div>
						<div className="text-sm text-muted-foreground">
							{projects.length} project{projects.length !== 1 ? "s" : ""},{" "}
							{tasks.length} task{tasks.length !== 1 ? "s" : ""}
						</div>
					</div>
				</div>

				{/* Active Projects Section */}
				{projects.length > 0 && (
					<div className="border-b border-border bg-muted/30 px-4 py-3">
						<h3 className="text-sm font-medium text-muted-foreground mb-2">
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

				{/* Timeline */}
				<div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
					<div className="relative">
						{HOURS.map((hour) => {
							const tasksAtHour = tasksByHour[hour] || [];
							const isCurrentHour =
								isToday(date) && new Date().getHours() === hour;

							return (
								<div
									key={hour}
									data-hour={hour}
									className={`
										border-b border-border
										${isCurrentHour ? "bg-primary/5" : ""}
									`}
								>
									<div className="flex">
										{/* Time Label */}
										<div className="w-20 shrink-0 p-3 text-right">
											<span
												className={`
													text-sm font-medium
													${isCurrentHour ? "text-primary" : "text-muted-foreground"}
												`}
											>
												{formatTime(`${hour}:00`)}
											</span>
										</div>

										{/* Events Column */}
										<div className="flex-1 min-h-[80px] p-3 relative">
											{tasksAtHour.length > 0 ? (
												<div className="flex flex-wrap gap-2">
													{tasksAtHour.map((task) => (
														<div
															key={task.id}
															className="flex items-start gap-2 bg-background rounded-lg p-2 border border-border hover:shadow-md transition-shadow"
															onClick={() => handleEventClick(task)}
														>
															<CalendarEventIcon event={task} size="md" />
															<div className="flex-1 min-w-0">
																<div className="text-sm font-medium text-foreground truncate">
																	{task.title}
																</div>
																<div className="text-xs text-muted-foreground">
																	{task.clientName}
																</div>
																{task.startTime && task.endTime && (
																	<div className="text-xs text-muted-foreground mt-1">
																		{formatTime(task.startTime)} -{" "}
																		{formatTime(task.endTime)}
																	</div>
																)}
															</div>
														</div>
													))}
												</div>
											) : (
												<div className="h-full flex items-center justify-center text-xs text-muted-foreground/50">
													{/* Empty slot */}
												</div>
											)}

											{/* Current time indicator */}
											{isCurrentHour && isToday(date) && (
												<div className="absolute left-0 right-0 top-1/2 h-0.5 bg-primary pointer-events-none">
													<div className="absolute -left-1 -top-1 w-2 h-2 bg-primary rounded-full" />
												</div>
											)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				{/* Empty State */}
				{dayEvents.length === 0 && (
					<div className="flex-1 flex items-center justify-center p-8">
						<div className="text-center">
							<CalendarIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
							<div className="text-sm font-medium text-muted-foreground">
								No events scheduled
							</div>
							<div className="text-xs text-muted-foreground mt-1">
								Enjoy your free day!
							</div>
						</div>
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
