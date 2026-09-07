import { formatCalendarDate } from "@/lib/dates";

const STATE_LABELS: Record<string, string> = {
	active: "Active",
	paused: "Paused",
	ended: "Ended",
	skipped: "Skipped",
	planned: "Planned",
	"in-progress": "In Progress",
	completed: "Completed",
	cancelled: "Cancelled",
};

export function stateLabel(value: string): string {
	return STATE_LABELS[value] ?? value;
}

export function formatVisitDate(timestamp?: number): string {
	return timestamp ? formatCalendarDate(timestamp) : "Not scheduled";
}
