import { useMemo } from "react";
import { addDays, format, startOfDay, startOfWeek, subDays } from "date-fns";
import { DayButton } from "react-day-picker";
import { getDayKey } from "@/components/reui/event-calendar/event-calendar-lib";
import { expandRecurrence } from "@/components/reui/event-calendar/event-calendar-recurrence";
import type { EventCalendarOccurrence } from "@/components/reui/event-calendar/event-calendar-types";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
	AGENDA_DAYS,
	EVENT_KINDS,
	type HomeCalendarEvent,
	type HomeEventData,
} from "./calendar-events";

// The calendar primitive resolves this same default when no timeZone prop is
// passed; matching it keeps the rail's dots aligned with the grid's days.
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * The calendar's left rail: a mini month picker sharing the workspace date
 * (dots mark days with visible events), an Up Next agenda, and per-kind
 * visibility toggles (Projects / Tasks).
 */
export function CalendarRail({
	date,
	onDateChange,
	month,
	onMonthChange,
	events,
	hidden,
	onToggleKind,
	onOpenOccurrence,
	className,
}: {
	date: Date;
	onDateChange: (date: Date) => void;
	/** Browsed mini-calendar month — owned by the parent so the fetch window
	 *  can cover it. */
	month: Date;
	onMonthChange: (month: Date) => void;
	events: HomeCalendarEvent[];
	hidden: Set<string>;
	onToggleKind: (id: string) => void;
	onOpenOccurrence: (occurrence: EventCalendarOccurrence<HomeEventData>) => void;
	className?: string;
}) {
	// The 6-week grid actually on screen — dots must describe the month the
	// user is looking at, not the month the workspace date happens to be in.
	const monthRange = useMemo(() => {
		const start = startOfWeek(month);
		return { start, end: addDays(start, 42) };
	}, [month]);

	// Days carrying at least one visible event; a multi-day project span marks
	// each of its days.
	const busyDays = useMemo(() => {
		const set = new Set<string>();
		for (const event of events) {
			for (const occurrence of expandRecurrence(event, monthRange, {
				timeZone: TIME_ZONE,
			})) {
				// All-day ends are exclusive, so step back for the inclusive last day.
				const last = occurrence.allDay
					? subDays(occurrence.end, 1)
					: occurrence.end;
				const lastDay = startOfDay(
					last < occurrence.start ? occurrence.start : last
				);
				for (
					let cursor = startOfDay(occurrence.start);
					cursor <= lastDay;
					cursor = addDays(cursor, 1)
				) {
					set.add(getDayKey(cursor, TIME_ZONE));
				}
			}
		}
		return set;
	}, [events, monthRange]);

	// Up Next: the soonest upcoming occurrences from now on.
	const upcoming = useMemo(() => {
		const now = new Date();
		const from = startOfDay(now);
		const range = { start: from, end: addDays(from, AGENDA_DAYS) };
		return events
			.flatMap((event) => expandRecurrence(event, range, { timeZone: TIME_ZONE }))
			.filter((occurrence) => occurrence.end >= now)
			.sort((a, b) => a.start.getTime() - b.start.getTime())
			.slice(0, 4);
	}, [events]);

	return (
		<aside className={className}>
			<ScrollArea className="min-h-0 flex-1">
				{/* pt-2 matches the nav's py-2 so the mini calendar's month caption
				    sits on the same baseline as the toolbar's Today / title row. */}
				<div className="flex flex-col gap-4 px-4 pt-2 pb-4">
					{/* Mini month picker. Paging it only browses (the grid stays put);
					    selecting a day is the one write to the workspace date. */}
					<Calendar
						mode="single"
						required
						selected={date}
						month={month}
						onMonthChange={onMonthChange}
						onSelect={(next) => next && onDateChange(next)}
						buttonVariant="ghost"
						className="w-full bg-transparent p-0 [--cell-size:--spacing(8)]"
						components={{
							DayButton: ({
								day,
								modifiers,
								children,
								...props
							}: React.ComponentProps<typeof DayButton>) => {
								const busy =
									!modifiers.outside &&
									busyDays.has(getDayKey(day.date, TIME_ZONE));
								return (
									<CalendarDayButton day={day} modifiers={modifiers} {...props}>
										{children}
										{/* Reserve the dot slot on every day so numbers stay
										    aligned; color it only when the day has an event. */}
										<span
											aria-hidden="true"
											className={cn(
												"size-1 rounded-full",
												busy
													? "bg-primary in-data-[selected-single=true]:bg-primary-foreground"
													: "bg-transparent"
											)}
										/>
									</CalendarDayButton>
								);
							},
						}}
					/>

					{/* Up Next */}
					<section className="flex flex-col gap-0.5">
						<SectionLabel>Up Next</SectionLabel>
						{upcoming.length > 0 ? (
							upcoming.map((occurrence) => (
								<button
									key={occurrence.key}
									type="button"
									onClick={() => onOpenOccurrence(occurrence)}
									className="hover:bg-accent focus-visible:ring-ring flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2"
								>
									<span className="flex items-center gap-2">
										<span
											aria-hidden="true"
											className="size-2 shrink-0 rounded-full"
											style={{ backgroundColor: occurrence.event.color }}
										/>
										<span className="min-w-0 flex-1 truncate text-sm font-medium">
											{occurrence.event.title}
										</span>
									</span>
									<span className="text-muted-foreground flex items-center gap-1.5 ps-4 text-xs">
										<span>{format(occurrence.start, "EEE, MMM d")}</span>
										<Dot />
										<span>
											{occurrence.allDay
												? "All day"
												: format(occurrence.start, "h:mm a")}
										</span>
									</span>
								</button>
							))
						) : (
							<p className="text-muted-foreground px-2 text-xs">
								Nothing scheduled.
							</p>
						)}
					</section>

					{/* Kind visibility */}
					<section className="flex flex-col gap-0.5">
						<SectionLabel>Show on calendar</SectionLabel>
						{EVENT_KINDS.map((kind) => {
							const on = !hidden.has(kind.id);
							return (
								<div
									key={kind.id}
									className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1"
								>
									<Checkbox
										checked={on}
										onCheckedChange={() => onToggleKind(kind.id)}
										aria-label={kind.name}
										className="**:text-white!"
										style={
											on
												? {
														backgroundColor: kind.color,
														borderColor: kind.color,
													}
												: undefined
										}
									/>
									<span className="min-w-0 flex-1 truncate text-sm">
										{kind.name}
									</span>
								</div>
							);
						})}
					</section>
				</div>
			</ScrollArea>
		</aside>
	);
}

/** Inline dot separator between two rendered segments. */
function Dot() {
	return (
		<span
			aria-hidden="true"
			className="bg-muted-foreground/40 size-1 shrink-0 rounded-full"
		/>
	);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<span className="text-muted-foreground mb-1.5 px-2 text-xs font-medium">
			{children}
		</span>
	);
}
