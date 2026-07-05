"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { startOfDay } from "date-fns";

import { Frame, FramePanel } from "@/components/reui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import type { CalendarEvent } from "@/types/calendar";
import {
	getViewDateRange,
	groupEventsByDay,
	isEventOnDate,
} from "@/lib/calendar-utils";
import { ScheduleCalendar } from "./schedule-calendar";
import { AgendaList } from "./agenda-list";
import type { ScheduleFilter } from "./schedule-data";

export function SchedulePanel({
	onEventClick,
}: {
	onEventClick?: (date: Date) => void;
}) {
	const [month, setMonth] = useState<Date>(() => startOfDay(new Date()));
	const [selectedDate, setSelectedDate] = useState<Date | undefined>(() =>
		startOfDay(new Date())
	);
	const [filter, setFilter] = useState<ScheduleFilter>("all");

	// Navigating months realigns the selected day so the agenda never points at a
	// day outside the newly fetched month (keep it if still in range, else today
	// for the current month or the 1st otherwise).
	const handleMonthChange = useCallback((nextMonth: Date) => {
		setMonth(nextMonth);
		setSelectedDate((current) => {
			if (
				current &&
				current.getFullYear() === nextMonth.getFullYear() &&
				current.getMonth() === nextMonth.getMonth()
			) {
				return current;
			}
			const today = startOfDay(new Date());
			const isCurrentMonth =
				nextMonth.getFullYear() === today.getFullYear() &&
				nextMonth.getMonth() === today.getMonth();
			return isCurrentMonth
				? today
				: startOfDay(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1));
		});
	}, []);

	// Fetch the whole visible month grid (same UTC pattern as CalendarContainer).
	const range = useMemo(() => getViewDateRange(month, "month"), [month]);
	const startDateUTC = useMemo(() => {
		const d = range.start;
		return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
	}, [range.start]);
	const endDateUTC = useMemo(() => {
		const d = range.end;
		return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
	}, [range.end]);

	const calendarData = useQuery(api.calendar.getCalendarEvents, {
		startDate: startDateUTC,
		endDate: endDateUTC,
	});

	// UTC fields -> local calendar day (same normalization as the old WeeklyAgenda).
	const events: CalendarEvent[] = useMemo(() => {
		if (!calendarData) return [];

		const projectEvents: CalendarEvent[] = calendarData.projects.map((p) => {
			const s = new Date(p.startDate);
			const startDateLocal = new Date(
				s.getUTCFullYear(),
				s.getUTCMonth(),
				s.getUTCDate()
			);
			let endDateLocal: Date | undefined;
			if (p.endDate) {
				const e = new Date(p.endDate);
				endDateLocal = new Date(
					e.getUTCFullYear(),
					e.getUTCMonth(),
					e.getUTCDate()
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
			const s = new Date(t.startDate);
			const startDateLocal = new Date(
				s.getUTCFullYear(),
				s.getUTCMonth(),
				s.getUTCDate()
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

	const datesWithEvents = useMemo(
		() => new Set(Object.keys(groupEventsByDay(events))),
		[events]
	);

	const dayEvents = useMemo(
		() =>
			selectedDate
				? events.filter((e) => isEventOnDate(e, selectedDate))
				: events,
		[events, selectedDate]
	);

	const isLoading = calendarData === undefined;

	return (
		<Frame className="w-full">
			<FramePanel className="flex flex-col p-0! lg:flex-row">
				<div className="shrink-0 border-border p-4 lg:w-[360px] lg:border-r">
					<ScheduleCalendar
						month={month}
						onMonthChange={handleMonthChange}
						selected={selectedDate}
						onSelect={setSelectedDate}
						datesWithEvents={datesWithEvents}
					/>
				</div>
				<div className="min-w-0 flex-1 p-4">
					{isLoading ? (
						<div className="space-y-3">
							<Skeleton className="h-5 w-40 rounded-md" />
							<Skeleton className="h-16 w-full rounded-md" />
							<Skeleton className="h-16 w-full rounded-md" />
							<Skeleton className="h-16 w-full rounded-md" />
						</div>
					) : (
						<AgendaList
							selectedDate={selectedDate}
							events={dayEvents}
							filter={filter}
							onFilterChange={setFilter}
							onEventClick={onEventClick}
						/>
					)}
				</div>
			</FramePanel>
		</Frame>
	);
}
