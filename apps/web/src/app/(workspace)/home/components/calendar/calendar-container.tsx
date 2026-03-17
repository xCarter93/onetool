"use client";

import React, { useState, useMemo } from "react";
import { CalendarView, CalendarEvent } from "@/types/calendar";
import { getViewDateRange } from "@/lib/calendar-utils";
import { CalendarMonthView } from "./calendar-month-view";
import { CalendarWeekView } from "./calendar-week-view";
import { CalendarDayView } from "./calendar-day-view";
import { ButtonGroup } from "@/components/ui/button-group";
import {
	ChevronLeft,
	ChevronRight,
	Calendar,
	CalendarDays,
	CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addMonths, addWeeks, addDays } from "date-fns";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { motion } from "motion/react";

export function CalendarContainer() {
	const [currentDate, setCurrentDate] = useState(new Date());
	const [view, setView] = useState<CalendarView>("month");
	const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

	// Calculate date range for data fetching based on current view
	const dateRange = useMemo(
		() => getViewDateRange(currentDate, view),
		[currentDate, view]
	);

	// Convert date range to UTC midnight timestamps to match how tasks are stored
	const startDateUTC = useMemo(() => {
		const d = dateRange.start;
		return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
	}, [dateRange.start]);

	const endDateUTC = useMemo(() => {
		const d = dateRange.end;
		return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
	}, [dateRange.end]);

	// Fetch calendar events for the current date range
	const calendarData = useQuery(api.calendar.getCalendarEvents, {
		startDate: startDateUTC,
		endDate: endDateUTC,
	});

	// Combine and normalize events
	const events: CalendarEvent[] = useMemo(() => {
		if (!calendarData) return [];

		const projectEvents: CalendarEvent[] = calendarData.projects.map((p) => {
			// Convert UTC timestamp to Date object representing the local date
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
			// Convert UTC timestamp to Date object representing the local date
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

	// Navigation handlers
	const handlePrevious = () => {
		switch (view) {
			case "month":
				setCurrentDate((prev) => addMonths(prev, -1));
				break;
			case "week":
				setCurrentDate((prev) => addWeeks(prev, -1));
				break;
			case "day":
				setCurrentDate((prev) => addDays(prev, -1));
				break;
		}
	};

	const handleNext = () => {
		switch (view) {
			case "month":
				setCurrentDate((prev) => addMonths(prev, 1));
				break;
			case "week":
				setCurrentDate((prev) => addWeeks(prev, 1));
				break;
			case "day":
				setCurrentDate((prev) => addDays(prev, 1));
				break;
		}
	};

	const handleToday = () => {
		setCurrentDate(new Date());
	};

	const handleDayClick = (date: Date, eventId?: string) => {
		setCurrentDate(date);
		setView("day");
		if (eventId) {
			setSelectedEventId(eventId);
		}
	};

	// Format title based on view
	const getTitle = () => {
		switch (view) {
			case "month":
				return format(currentDate, "MMMM yyyy");
			case "week":
				return `Week of ${format(currentDate, "MMM d, yyyy")}`;
			case "day":
				return format(currentDate, "EEEE, MMMM d, yyyy");
		}
	};

	const navButtonClass =
		"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm";

	return (
		<div className="flex flex-col h-full">
			{/* Calendar Header */}
			<div className="border-b border-border bg-background px-4 py-4">
				<div className="flex items-center justify-between">
					{/* Title and Navigation */}
					<div className="flex items-center gap-4">
						<h1 className="text-2xl font-semibold text-foreground">{getTitle()}</h1>
						<ButtonGroup>
							<button
								onClick={handlePrevious}
								aria-label="Previous"
								className={cn(
									navButtonClass,
									"text-muted-foreground hover:text-foreground bg-card hover:bg-muted ring-border hover:ring-border"
								)}
							>
								<ChevronLeft className="w-4 h-4" />
							</button>
							<button
								onClick={handleToday}
								className={cn(
									navButtonClass,
									"text-muted-foreground hover:text-foreground bg-card hover:bg-muted ring-border hover:ring-border"
								)}
							>
								Today
							</button>
							<button
								onClick={handleNext}
								aria-label="Next"
								className={cn(
									navButtonClass,
									"text-muted-foreground hover:text-foreground bg-card hover:bg-muted ring-border hover:ring-border"
								)}
							>
								<ChevronRight className="w-4 h-4" />
							</button>
						</ButtonGroup>
					</div>

					{/* View Switcher */}
					<ButtonGroup>
						<button
							onClick={() => setView("month")}
							className={cn(
								navButtonClass,
								view === "month"
									? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
									: "text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted ring-transparent hover:ring-border"
							)}
						>
							<CalendarRange className="w-4 h-4" />
							Month
						</button>
						<button
							onClick={() => setView("week")}
							className={cn(
								navButtonClass,
								view === "week"
									? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
									: "text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted ring-transparent hover:ring-border"
							)}
						>
							<CalendarDays className="w-4 h-4" />
							Week
						</button>
						<button
							onClick={() => setView("day")}
							className={cn(
								navButtonClass,
								view === "day"
									? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
									: "text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted ring-transparent hover:ring-border"
							)}
						>
							<Calendar className="w-4 h-4" />
							Day
						</button>
					</ButtonGroup>
				</div>

				{/* Stats */}
				{!calendarData ? (
					<div className="mt-2 text-sm text-muted-foreground">Loading...</div>
				) : (
					<div className="mt-2 text-sm text-muted-foreground">
						{calendarData.projects.length} project
						{calendarData.projects.length !== 1 ? "s" : ""},{" "}
						{calendarData.tasks.length} task
						{calendarData.tasks.length !== 1 ? "s" : ""}
					</div>
				)}
			</div>

			{/* Calendar View */}
			<div className="flex-1 overflow-hidden">
				<motion.div
					key={view}
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3 }}
					className="h-full"
				>
					{view === "month" && (
						<CalendarMonthView
							date={currentDate}
							events={events}
							onDayClick={handleDayClick}
						/>
					)}
					{view === "week" && (
						<CalendarWeekView
							date={currentDate}
							events={events}
							onDayClick={handleDayClick}
						/>
					)}
					{view === "day" && (
						<CalendarDayView
							date={currentDate}
							events={events}
							selectedEventId={selectedEventId}
						/>
					)}
				</motion.div>
			</div>
		</div>
	);
}
