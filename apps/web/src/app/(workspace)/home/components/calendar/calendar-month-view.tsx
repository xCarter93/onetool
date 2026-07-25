"use client";

import React from "react";
import { CalendarEvent } from "@/types/calendar";
import { format } from "date-fns";
import { getMonthDays, isEventOnDate } from "@/lib/calendar-utils";
import { CalendarEventBar } from "./calendar-event-bar";

interface CalendarMonthViewProps {
	date: Date;
	events: CalendarEvent[];
	onDayClick: (date: Date, eventId?: string) => void;
}

export function CalendarMonthView({
	date,
	events,
	onDayClick,
}: CalendarMonthViewProps) {
	const monthDays = getMonthDays(date);

	const handleEventClick = (event: CalendarEvent, eventDate: Date) => {
		// Navigate to day view with the event selected
		onDayClick(eventDate, event.id as string);
	};

	const handleDayClick = (day: Date) => {
		onDayClick(day);
	};

	// Group days into weeks (7 days each)
	const weeks: (typeof monthDays)[] = [];
	for (let i = 0; i < monthDays.length; i += 7) {
		weeks.push(monthDays.slice(i, i + 7));
	}

	return (
		<div className="flex h-full flex-col">
			{/* Day Labels */}
			<div className="grid grid-cols-7 border-b border-border bg-muted/30">
				{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
					<div
						key={day}
						className="border-r border-border last:border-r-0 p-2 text-center text-xs font-medium text-muted-foreground"
					>
						{day}
					</div>
				))}
			</div>

			{/* Calendar Grid */}
			{/* Rows keep a floor height and the grid scrolls when a dense month
			    can't fit, instead of clipping the last row */}
			<div
				className="flex-1 min-h-0 overflow-y-auto grid grid-cols-7"
				style={{
					gridTemplateRows: `repeat(${weeks.length}, minmax(8rem, 1fr))`,
				}}
			>
				{weeks.map((week, weekIndex) => (
					<React.Fragment key={weekIndex}>
						{week.map((dayCell) => {
							const dayEvents = events.filter((event) =>
								isEventOnDate(event, dayCell.date)
							);
							const projects = dayEvents.filter((e) => e.type === "project");
							const tasks = dayEvents
								.filter((e) => e.type === "task")
								.sort((a, b) =>
									(a.startTime ?? "99").localeCompare(b.startTime ?? "99")
								);

							// Fixed row budget per cell so height never grows with volume
							const MAX_VISIBLE = 3;
							const visibleEvents = [...projects, ...tasks].slice(
								0,
								MAX_VISIBLE
							);
							const hiddenCount = dayEvents.length - visibleEvents.length;

							return (
								<div
									key={dayCell.date.toString()}
									className={`
											border-r border-b last:border-r-0
											border-border
											p-2 cursor-pointer
											hover:bg-muted/50 transition-colors
											flex flex-col min-h-0 overflow-hidden
											${dayCell.isToday ? "bg-primary/5" : ""}
											${!dayCell.isCurrentMonth ? "bg-muted/20" : ""}
										`}
									onClick={() => handleDayClick(dayCell.date)}
								>
									{/* Day Number */}
									<div className="flex items-center justify-between mb-1">
										<span
											className={`
													text-sm font-medium
													${
														dayCell.isToday
															? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
															: dayCell.isCurrentMonth
																? "text-foreground"
																: "text-muted-foreground"
													}
												`}
										>
											{format(dayCell.date, "d")}
										</span>
										{dayEvents.length > 0 && (
											<span className="text-xs text-muted-foreground">
												{dayEvents.length}
											</span>
										)}
									</div>

									{/* Events — uniform single-line chips, capped at MAX_VISIBLE */}
									<div className="space-y-1">
										{visibleEvents.map((event) => (
											<div
												key={event.id}
												onClick={(e) => {
													e.stopPropagation();
													handleEventClick(event, dayCell.date);
												}}
											>
												<CalendarEventBar event={event} compact />
											</div>
										))}

										{/* More Indicator — cell click opens the day view */}
										{hiddenCount > 0 && (
											<div className="text-[11px] font-medium text-muted-foreground hover:text-foreground mt-0.5">
												+{hiddenCount} more
											</div>
										)}
									</div>
								</div>
							);
						})}
					</React.Fragment>
				))}
			</div>
		</div>
	);
}
