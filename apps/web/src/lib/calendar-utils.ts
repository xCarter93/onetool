import {
	startOfMonth,
	endOfMonth,
	startOfWeek,
	endOfWeek,
	eachDayOfInterval,
	format,
	isSameMonth,
	isToday,
	addDays,
	startOfDay,
	endOfDay,
	differenceInDays,
} from "date-fns";
import type {
	CalendarEvent,
	DateRange,
	EventPosition,
	GroupedEvents,
	CalendarDayCell,
} from "@/types/calendar";

/**
 * Get all days for a month view (including days from previous/next month to fill grid)
 */
export function getMonthDays(date: Date): CalendarDayCell[] {
	const monthStart = startOfMonth(date);
	const monthEnd = endOfMonth(date);
	const calendarStart = startOfWeek(monthStart);
	const calendarEnd = endOfWeek(monthEnd);

	const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

	return days.map((day) => ({
		date: day,
		isCurrentMonth: isSameMonth(day, date),
		isToday: isToday(day),
		events: [],
	}));
}

/**
 * Get 7 days for week view starting from the given date
 */
export function getWeekDays(date: Date): Date[] {
	const weekStart = startOfWeek(date);
	return eachDayOfInterval({
		start: weekStart,
		end: addDays(weekStart, 6),
	});
}

/**
 * Get the date range for the current view
 */
export function getViewDateRange(
	date: Date,
	view: "month" | "week" | "day"
): DateRange {
	switch (view) {
		case "month": {
			const monthStart = startOfMonth(date);
			const monthEnd = endOfMonth(date);
			return {
				start: startOfWeek(monthStart),
				end: endOfWeek(monthEnd),
			};
		}
		case "week": {
			const weekStart = startOfWeek(date);
			return {
				start: weekStart,
				end: endOfWeek(weekStart),
			};
		}
		case "day":
			return {
				start: startOfDay(date),
				end: endOfDay(date),
			};
	}
}

/**
 * Calculate the position and width of an event bar based on date range
 * Returns percentage values for positioning
 */
export function calculateEventPosition(
	eventStart: Date,
	eventEnd: Date,
	viewStart: Date,
	viewEnd: Date,
	totalDays: number
): EventPosition {
	const eventStartDay = startOfDay(eventStart);
	const eventEndDay = startOfDay(eventEnd);
	const viewStartDay = startOfDay(viewStart);
	const viewEndDay = startOfDay(viewEnd);

	// Clamp event to view range
	const displayStart =
		eventStartDay < viewStartDay ? viewStartDay : eventStartDay;
	const displayEnd = eventEndDay > viewEndDay ? viewEndDay : eventEndDay;

	// Calculate position as day offset from view start
	const startOffset = differenceInDays(displayStart, viewStartDay);
	const eventDays = differenceInDays(displayEnd, displayStart) + 1;

	const left = (startOffset / totalDays) * 100;
	const width = (eventDays / totalDays) * 100;

	return { left, width };
}

/**
 * Group events by date for easier rendering
 */
export function groupEventsByDay(events: CalendarEvent[]): GroupedEvents {
	const grouped: GroupedEvents = {};

	events.forEach((event) => {
		if (event.type === "task") {
			// Tasks have a single date
			const dateKey = format(event.startDate, "yyyy-MM-dd");
			if (!grouped[dateKey]) {
				grouped[dateKey] = [];
			}
			grouped[dateKey].push(event);
		} else {
			// Projects span multiple days
			const start = startOfDay(event.startDate);
			const end = event.endDate ? startOfDay(event.endDate) : start;
			const days = eachDayOfInterval({ start, end });

			days.forEach((day) => {
				const dateKey = format(day, "yyyy-MM-dd");
				if (!grouped[dateKey]) {
					grouped[dateKey] = [];
				}
				// Only add if not already added for this day
				if (!grouped[dateKey].find((e) => e.id === event.id)) {
					grouped[dateKey].push(event);
				}
			});
		}
	});

	return grouped;
}

/**
 * Check if an event falls within a date range
 */
export function isEventInRange(
	event: CalendarEvent,
	rangeStart: Date,
	rangeEnd: Date
): boolean {
	const eventStart = startOfDay(event.startDate);
	const eventEnd = event.endDate
		? startOfDay(event.endDate)
		: startOfDay(event.startDate);
	const rangeStartDay = startOfDay(rangeStart);
	const rangeEndDay = startOfDay(rangeEnd);

	// Event overlaps if:
	// - Event starts within range, OR
	// - Event ends within range, OR
	// - Event spans the entire range
	return (
		(eventStart >= rangeStartDay && eventStart <= rangeEndDay) ||
		(eventEnd >= rangeStartDay && eventEnd <= rangeEndDay) ||
		(eventStart <= rangeStartDay && eventEnd >= rangeEndDay)
	);
}

/**
 * Get color classes based on event type and status
 */
export function getEventColor(
	type: "project" | "task",
	status: string
): {
	bg: string;
	border: string;
	text: string;
	hover: string;
} {
	switch (status) {
		case "completed":
		case "approved":
			return {
				bg: "bg-success/10",
				border: "border-success/25",
				text: "text-success-foreground",
				hover: "hover:bg-success/15",
			};
		case "in-progress":
		case "pending":
			return {
				bg: "bg-warning/10",
				border: "border-warning/25",
				text: "text-warning-foreground",
				hover: "hover:bg-warning/15",
			};
		case "planned":
		case "scheduled":
		case "upcoming":
			return {
				bg: "bg-info/10",
				border: "border-info/25",
				text: "text-info-foreground",
				hover: "hover:bg-info/15",
			};
		case "cancelled":
		case "overdue":
			return {
				bg: "bg-destructive/10",
				border: "border-destructive/25",
				text: "text-destructive-foreground",
				hover: "hover:bg-destructive/15",
			};
		default:
			return {
				bg: "bg-muted",
				border: "border-border",
				text: "text-muted-foreground",
				hover: "hover:bg-muted/70",
			};
	}
}

/**
 * Parse an "HH:MM" time string into minutes since midnight.
 * Returns null for missing or malformed values (the field is free-form in the schema).
 */
export function parseTimeToMinutes(time?: string): number | null {
	if (!time) return null;
	const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) return null;
	return hours * 60 + minutes;
}

export interface TimedEventLayout {
	event: CalendarEvent;
	/** px from the top of the day grid */
	top: number;
	/** px */
	height: number;
	/** % from the left of the events column */
	left: number;
	/** % of the events column */
	width: number;
}

/**
 * Compute absolute positions for timed events in the day-view grid.
 * Events are clamped to the visible hour range (with a minimum display
 * duration so short tasks stay clickable); overlapping events split the
 * column into side-by-side lanes.
 */
export function layoutTimedDayEvents(
	events: CalendarEvent[],
	opts: { dayStartHour: number; dayEndHour: number; hourHeight: number }
): TimedEventLayout[] {
	const { dayStartHour, dayEndHour, hourHeight } = opts;
	const gridStart = dayStartHour * 60;
	const gridEnd = dayEndHour * 60;
	const MIN_DURATION = 30;

	const timed = events.flatMap((event) => {
		const start = parseTimeToMinutes(event.startTime);
		if (start === null) return [];
		const parsedEnd = parseTimeToMinutes(event.endTime);
		// Missing or inverted end time renders as a default one-hour block
		const end = parsedEnd !== null && parsedEnd > start ? parsedEnd : start + 60;
		const clampedStart = Math.min(
			Math.max(start, gridStart),
			gridEnd - MIN_DURATION
		);
		const clampedEnd = Math.min(
			Math.max(end, clampedStart + MIN_DURATION),
			gridEnd
		);
		return [{ event, start: clampedStart, end: clampedEnd }];
	});

	timed.sort((a, b) => a.start - b.start || b.end - a.end);

	// Greedy lane assignment within overlap clusters
	const layouts: TimedEventLayout[] = [];
	let cluster: { start: number; end: number; lane: number; event: CalendarEvent }[] = [];
	let clusterEnd = -1;

	const flushCluster = () => {
		if (cluster.length === 0) return;
		const laneCount = Math.max(...cluster.map((c) => c.lane)) + 1;
		const width = 100 / laneCount;
		for (const item of cluster) {
			layouts.push({
				event: item.event,
				top: ((item.start - gridStart) / 60) * hourHeight,
				height: ((item.end - item.start) / 60) * hourHeight,
				left: item.lane * width,
				width,
			});
		}
		cluster = [];
	};

	const laneEnds: number[] = [];
	for (const item of timed) {
		if (item.start >= clusterEnd) {
			flushCluster();
			laneEnds.length = 0;
		}
		let lane = laneEnds.findIndex((end) => end <= item.start);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(item.end);
		} else {
			laneEnds[lane] = item.end;
		}
		cluster.push({ ...item, lane });
		clusterEnd = Math.max(clusterEnd, item.end);
	}
	flushCluster();

	return layouts;
}

/**
 * Format time string to 12-hour format
 */
export function formatTime(time: string): string {
	const [hours, minutes] = time.split(":").map(Number);
	const period = hours >= 12 ? "PM" : "AM";
	const displayHours = hours % 12 || 12;
	return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

/**
 * Check if an event is happening on a specific date
 * Note: Events come with Date objects that represent local dates (from calendar-container)
 */
export function isEventOnDate(event: CalendarEvent, date: Date): boolean {
	// Normalize the check date to start of day for comparison
	const checkYear = date.getFullYear();
	const checkMonth = date.getMonth();
	const checkDay = date.getDate();

	if (event.type === "task") {
		// For tasks, check if the dates match (year, month, day)
		const eventYear = event.startDate.getFullYear();
		const eventMonth = event.startDate.getMonth();
		const eventDay = event.startDate.getDate();
		
		return (
			eventYear === checkYear &&
			eventMonth === checkMonth &&
			eventDay === checkDay
		);
	} else {
		// Project - check if date falls within project range
		const eventStartYear = event.startDate.getFullYear();
		const eventStartMonth = event.startDate.getMonth();
		const eventStartDay = event.startDate.getDate();

		// Create comparable timestamps at midnight
		const checkTimestamp = new Date(checkYear, checkMonth, checkDay).getTime();
		const startTimestamp = new Date(
			eventStartYear,
			eventStartMonth,
			eventStartDay
		).getTime();

		let endTimestamp = startTimestamp;
		if (event.endDate) {
			const eventEndYear = event.endDate.getFullYear();
			const eventEndMonth = event.endDate.getMonth();
			const eventEndDay = event.endDate.getDate();
			endTimestamp = new Date(
				eventEndYear,
				eventEndMonth,
				eventEndDay
			).getTime();
		}

		return checkTimestamp >= startTimestamp && checkTimestamp <= endTimestamp;
	}
}
