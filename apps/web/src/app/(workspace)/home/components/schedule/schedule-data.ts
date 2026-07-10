import { format } from "date-fns";
import type { CalendarEvent } from "@/types/calendar";
import { formatTime } from "@/lib/calendar-utils";

/** Agenda filter — our data splits cleanly into projects vs tasks. */
export type ScheduleFilter = "all" | "project" | "task";

export const FILTER_ITEMS: Array<{ label: string; value: ScheduleFilter }> = [
	{ label: "All", value: "all" },
	{ label: "Projects", value: "project" },
	{ label: "Tasks", value: "task" },
];

export function matchesFilter(event: CalendarEvent, filter: ScheduleFilter) {
	return filter === "all" || event.type === filter;
}

/** "in-progress" -> "In progress". */
export function statusLabel(status: string): string {
	const words = status.split(/[-_ ]+/).filter(Boolean);
	if (words.length === 0) return status;
	return words
		.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(" ");
}

/** Task -> its time window; project -> its date span. */
export function formatEventWhen(event: CalendarEvent): string {
	if (event.type === "task") {
		if (!event.startTime) return "All day";
		const start = formatTime(event.startTime);
		return event.endTime ? `${start} – ${formatTime(event.endTime)}` : start;
	}
	const start = format(event.startDate, "MMM d");
	if (event.endDate && event.endDate.getTime() !== event.startDate.getTime()) {
		return `${start} – ${format(event.endDate, "MMM d")}`;
	}
	return start;
}

/** Timed tasks first (by time), then everything else alphabetically. */
export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
	return [...events].sort((a, b) => {
		const ta = a.type === "task" && a.startTime ? a.startTime : "";
		const tb = b.type === "task" && b.startTime ? b.startTime : "";
		if (ta && tb) return ta.localeCompare(tb);
		if (ta) return -1;
		if (tb) return 1;
		return a.title.localeCompare(b.title);
	});
}

export const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const CURRENT_YEAR = new Date().getFullYear();
export const YEARS = Array.from({ length: 21 }, (_, i) => CURRENT_YEAR - 10 + i);
