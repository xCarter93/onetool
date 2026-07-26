import type { FunctionReturnType } from "convex/server";
import { addDays } from "date-fns";
import type { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { CalendarEvent } from "@/components/reui/event-calendar/event-calendar-types";
import { utcMidnightMsToLocalDate } from "@/lib/dates";

/**
 * The two "calendars" on the home calendar. Events carry their kind as
 * resourceId so the rail's visibility checkboxes and color-by-kind both key
 * off the same field (mirrors the ReUI block's color-by-calendar contract).
 */
export interface EventKind {
	id: "project" | "task";
	name: string;
	color: string;
}

export const EVENT_KINDS: EventKind[] = [
	{ id: "project", name: "Projects", color: "var(--color-blue-500)" },
	{ id: "task", name: "Tasks", color: "var(--color-emerald-500)" },
];

export const KIND_BY_ID = new Map(EVENT_KINDS.map((k) => [k.id, k]));

/** How far ahead the rail's Up Next agenda looks. Shared with the fetch
 *  window so the agenda never outruns the loaded data. */
export const AGENDA_DAYS = 60;

export interface HomeEventData {
	kind: "project" | "task";
	status: string;
	description?: string;
	clientId?: Id<"clients">;
	clientName: string;
	/** Task's parent project (when it has one). */
	projectId?: Id<"projects">;
	assigneeIds: Id<"users">[];
}

export type HomeCalendarEvent = CalendarEvent<HomeEventData>;

type CalendarQueryResult = FunctionReturnType<
	typeof api.calendar.getCalendarEvents
>;

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" onto a local day; null when missing or malformed. */
function timeOnDay(day: Date, time: string | undefined): Date | null {
	if (!time) return null;
	const match = TIME_RE.exec(time);
	if (!match) return null;
	const result = new Date(day);
	result.setHours(Number(match[1]), Number(match[2]), 0, 0);
	return result;
}

const DEFAULT_TASK_MINUTES = 60;

/**
 * Convex calendar rows → ReUI CalendarEvents. Stored days are UTC-midnight
 * numbers rendered as local days (the app-wide convention in lib/dates.ts);
 * all-day ends are exclusive, so spans get +1 day.
 */
export function mapCalendarEvents(
	data: CalendarQueryResult
): HomeCalendarEvent[] {
	const projectColor = KIND_BY_ID.get("project")!.color;
	const taskColor = KIND_BY_ID.get("task")!.color;
	const events: HomeCalendarEvent[] = [];

	for (const project of data.projects) {
		const start = utcMidnightMsToLocalDate(project.startDate);
		const lastDay = utcMidnightMsToLocalDate(
			project.endDate ?? project.startDate
		);
		events.push({
			id: project.id,
			title: project.title,
			start,
			end: addDays(lastDay < start ? start : lastDay, 1),
			allDay: true,
			resourceId: "project",
			color: projectColor,
			data: {
				kind: "project",
				status: project.status,
				description: project.description,
				clientId: project.clientId,
				clientName: project.clientName,
				assigneeIds: project.assignedUserIds ?? [],
			},
		});
	}

	for (const task of data.tasks) {
		const day = utcMidnightMsToLocalDate(task.startDate);
		const start = timeOnDay(day, task.startTime);
		const end = start ? timeOnDay(day, task.endTime) : null;
		events.push({
			id: task.id,
			title: task.title,
			start: start ?? day,
			end: start
				? end && end > start
					? end
					: new Date(start.getTime() + DEFAULT_TASK_MINUTES * 60_000)
				: addDays(day, 1),
			allDay: !start,
			resourceId: "task",
			color: taskColor,
			data: {
				kind: "task",
				status: task.status,
				description: task.description,
				clientId: task.clientId,
				clientName: task.clientName,
				projectId: task.projectId,
				assigneeIds: task.assigneeUserId ? [task.assigneeUserId] : [],
			},
		});
	}

	return events;
}
