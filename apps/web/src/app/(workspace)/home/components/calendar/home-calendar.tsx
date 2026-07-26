"use client";

import {
	useCallback,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
	addDays,
	differenceInCalendarDays,
	format,
	isSameDay,
	setHours,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subDays,
	subMinutes,
} from "date-fns";
import { CheckIcon, ListFilterIcon, PlusIcon } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	EventCalendar,
	type EventCalendarRenderEventProps,
} from "@/components/reui/event-calendar/event-calendar";
import { EventCalendarContent } from "@/components/reui/event-calendar/event-calendar-content";
import { EVENT_CALENDAR_FADE_TRUNCATE } from "@/components/reui/event-calendar/event-calendar-event";
import {
	EventCalendarNav,
	EventCalendarToolbar,
} from "@/components/reui/event-calendar/event-calendar-nav";
import type {
	CalendarView,
	EventCalendarProposedUpdate,
	EventCalendarRangeInfo,
	EventCalendarSlotDraft,
	EventCalendarSlotInfo,
} from "@/components/reui/event-calendar/event-calendar-types";
import { usePublishScreenContext } from "@/components/assistant/use-screen-context";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { localDateToUtcMidnightMs } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { TaskSheet } from "@/components/shared/task-sheet";
import { AssigneeStack, type OrgUser } from "./assignee-stack";
import {
	AGENDA_DAYS,
	EVENT_KINDS,
	mapCalendarEvents,
	type HomeEventData,
} from "./calendar-events";
import { CalendarRail } from "./calendar-rail";
import { CalendarEventSheet, type HomeOccurrence } from "./event-sheet";

const VIEW_STORAGE_KEY = "home-calendar-view";
const HIDDEN_STORAGE_KEY = "home-calendar-hidden";
const VIEWS: CalendarView[] = ["month", "week", "day", "agenda"];

/** Matches the primitive's default i18n viewShortcuts hints (M/W/D/A). */
const VIEW_BY_SHORTCUT: Record<string, CalendarView> = {
	m: "month",
	w: "week",
	d: "day",
	a: "agenda",
};

/** Quick-add lands on a working hour, never midnight. */
const QUICK_ADD_HOUR = 9;

const emptySubscribe = () => () => {};

type TaskSheetState =
	| { mode: "create"; date: Date; startTime?: string; endTime?: string }
	| { mode: "edit"; taskId: Id<"tasks"> };

interface DayRange {
	start: Date;
	end: Date;
	/** UTC-midnight ms window matching the app's stored-day convention. */
	startMs: number;
	endMs: number;
}

/**
 * The full home calendar, built on the ReUI event-calendar primitive. Data is
 * the org's projects (all-day spans) and tasks (timed or all-day); drags and
 * resizes commit through the real update mutations with an optimistic
 * override so chips don't snap back while Convex catches up.
 */
export function HomeCalendar() {
	const router = useRouter();
	const toast = useToast();
	const { can } = usePermissions();
	const canEditTasks = can("tasks", "modify");
	const canEditProjects = can("projects", "modify");

	const [date, setDate] = useState(() => new Date());
	const [view, setView] = useState<CalendarView>("week");
	const [hidden, setHidden] = useState<Set<string>>(() => new Set());
	const [range, setRange] = useState<DayRange | null>(null);
	const [selected, setSelected] = useState<HomeOccurrence | null>(null);
	const [taskSheet, setTaskSheet] = useState<TaskSheetState | null>(null);
	const [overrides, setOverrides] = useState<
		Map<string, { start: Date; end: Date; allDay: boolean; commit: number }>
	>(() => new Map());
	// Monotonic tag so a stale mutation failure can't clear a newer override
	// for the same event.
	const commitSeq = useRef(0);

	// The rail's browsed mini-calendar month, lifted here so the fetch window
	// can cover it (busy dots need data for the month on screen, not just the
	// grid's range). Pulled back to the workspace date's month during render
	// whenever that date lands in another month.
	const [railMonth, setRailMonth] = useState(() => startOfMonth(new Date()));
	const dateMonth = startOfMonth(date);
	const [syncedMonth, setSyncedMonth] = useState(dateMonth);
	if (dateMonth.getTime() !== syncedMonth.getTime()) {
		setSyncedMonth(dateMonth);
		setRailMonth(dateMonth);
	}

	// Restore persisted view + kind filters once after hydration (localStorage
	// is unavailable during SSR); render-time guard, not an effect.
	const hydrated = useSyncExternalStore(
		emptySubscribe,
		() => true,
		() => false
	);
	const [storageLoaded, setStorageLoaded] = useState(false);
	if (hydrated && !storageLoaded) {
		setStorageLoaded(true);
		const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
		if (savedView && (VIEWS as string[]).includes(savedView)) {
			setView(savedView as CalendarView);
		}
		try {
			const savedHidden = JSON.parse(
				localStorage.getItem(HIDDEN_STORAGE_KEY) ?? "[]"
			);
			if (Array.isArray(savedHidden)) {
				setHidden(new Set(savedHidden.filter((id) => typeof id === "string")));
			}
		} catch {
			// Ignore corrupted storage.
		}
	}

	const handleViewChange = useCallback((next: CalendarView) => {
		setView(next);
		localStorage.setItem(VIEW_STORAGE_KEY, next);
	}, []);

	const toggleKind = useCallback((id: string) => {
		setHidden((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...next]));
			return next;
		});
	}, []);

	// The grid tells us which days it renders; fetch exactly that window.
	const handleRangeChange = useCallback((info: EventCalendarRangeInfo) => {
		setRange((prev) => {
			const startMs = localDateToUtcMidnightMs(info.range.start);
			const endMs = localDateToUtcMidnightMs(info.range.end) - 1;
			if (prev && prev.startMs === startMs && prev.endMs === endMs) return prev;
			return { start: info.range.start, end: info.range.end, startMs, endMs };
		});
	}, []);

	// Fetch the union of everything on screen: the grid's visible range, the
	// rail's browsed 6-week mini-calendar grid, and Up Next's look-ahead — a
	// week/day view alone would starve the rail of events outside its window.
	const queryRange = useMemo(() => {
		if (!range) return null;
		const today = startOfDay(new Date());
		const railStart = startOfWeek(railMonth);
		return {
			startMs: Math.min(
				range.startMs,
				localDateToUtcMidnightMs(today),
				localDateToUtcMidnightMs(railStart)
			),
			endMs: Math.max(
				range.endMs,
				localDateToUtcMidnightMs(addDays(today, AGENDA_DAYS)) - 1,
				localDateToUtcMidnightMs(addDays(railStart, 42)) - 1
			),
		};
	}, [range, railMonth]);

	const calendarData = useQuery(
		api.calendar.getCalendarEvents,
		queryRange
			? { startDate: queryRange.startMs, endDate: queryRange.endMs }
			: "skip"
	);
	const orgUsers = useQuery(api.users.listByOrg, {});
	const usersById = useMemo(
		() =>
			new Map<Id<"users">, OrgUser>(
				(orgUsers ?? []).map((user) => [user._id, user])
			),
		[orgUsers]
	);

	const updateTask = useMutation(api.tasks.update);
	const updateProject = useMutation(api.projects.update);

	// Assistant screen context: view + visible range + selection (IDs only).
	usePublishScreenContext(() => ({
		calendarView: view,
		visibleRange: range
			? {
					start: format(range.start, "yyyy-MM-dd"),
					end: format(range.end, "yyyy-MM-dd"),
				}
			: null,
		selectedEventId: selected?.eventId ?? null,
	}));

	const mapped = useMemo(
		() => (calendarData ? mapCalendarEvents(calendarData) : []),
		[calendarData]
	);

	// Drop an optimistic override once the server row reflects it (or the row
	// disappeared). Render-time previous-value pattern, not an effect.
	const [prevMapped, setPrevMapped] = useState(mapped);
	if (prevMapped !== mapped) {
		setPrevMapped(mapped);
		setOverrides((prev) => {
			if (prev.size === 0) return prev;
			const next = new Map(prev);
			for (const [id, override] of prev) {
				const event = mapped.find((entry) => entry.id === id);
				if (
					!event ||
					(event.start.getTime() === override.start.getTime() &&
						event.end.getTime() === override.end.getTime() &&
						(event.allDay ?? false) === override.allDay)
				) {
					next.delete(id);
				}
			}
			return next.size === prev.size ? prev : next;
		});
	}

	const events = useMemo(() => {
		const withOverrides = mapped.map((event) => {
			const override = overrides.get(event.id);
			const merged = override
				? {
						...event,
						start: override.start,
						end: override.end,
						allDay: override.allDay,
					}
				: event;
			const kind = merged.data!.kind;
			const editable = kind === "task" ? canEditTasks : canEditProjects;
			return {
				...merged,
				draggable: editable,
				// A dateless task renders all-day but is still a single day; only
				// timed tasks and project spans have a meaningful edge to drag.
				resizable: editable && !(kind === "task" && merged.allDay),
			};
		});
		return withOverrides.filter(
			(event) => !event.resourceId || !hidden.has(event.resourceId)
		);
	}, [mapped, overrides, hidden, canEditTasks, canEditProjects]);

	const applyOverride = useCallback(
		(id: string, start: Date, end: Date, allDay: boolean): number => {
			const commit = ++commitSeq.current;
			setOverrides((prev) =>
				new Map(prev).set(id, { start, end, allDay, commit })
			);
			return commit;
		},
		[]
	);

	/** Clears only the override the failed commit painted — a newer reschedule
	 *  of the same event keeps its own pending position. */
	const clearOverride = useCallback((id: string, commit: number) => {
		setOverrides((prev) => {
			const entry = prev.get(id);
			if (!entry || entry.commit !== commit) return prev;
			const next = new Map(prev);
			next.delete(id);
			return next;
		});
	}, []);

	/** Live drag feedback (invalid cursor) — cheap mirror of the commit gate. */
	const canDropEvent = useCallback(
		(update: EventCalendarProposedUpdate<HomeEventData>) => {
			const kind = update.event.data?.kind;
			if (kind === "task") {
				if (!canEditTasks) return false;
				// Times can be added (all-day → timed) but never cleared — the
				// schema has no way to unset them on a drop into the all-day lane.
				return !update.allDay || (update.event.allDay ?? false);
			}
			return canEditProjects && update.allDay;
		},
		[canEditTasks, canEditProjects]
	);

	/** Commit gate: validate, paint optimistically, persist via mutation. */
	const handleEventUpdate = useCallback(
		(update: EventCalendarProposedUpdate<HomeEventData>) => {
			const { event, start, end, allDay } = update;
			const data = event.data!;

			if (data.kind === "task") {
				if (!canEditTasks) return false;
				// Times can be added (all-day → timed) but never cleared.
				if (allDay && !(event.allDay ?? false)) {
					toast.info(
						"Tasks with times stay in the time grid — drop it on a time slot."
					);
					return false;
				}
				const id = event.id as Id<"tasks">;
				const dateMs = localDateToUtcMidnightMs(start);
				const isResize =
					update.source === "resize-start" || update.source === "resize-end";
				if (allDay) {
					// A single-day event: moving changes only the day.
					if (differenceInCalendarDays(end, start) > 1) {
						toast.info("Tasks are single-day.");
						return false;
					}
					const commit = applyOverride(event.id, start, end, allDay);
					updateTask({ id, date: dateMs })
						.then(() => {
							toast.success(
								`"${event.title}" moved to ${format(start, "EEE, MMM d")}.`
							);
						})
						.catch((error) => {
							clearOverride(event.id, commit);
							toast.error(
								errorMessage(error, "Couldn't reschedule the task.")
							);
						});
					return true;
				}
				// Dropping a day task onto a time slot gives it a default hour —
				// the drag proposal keeps the 24h duration, which no task wants.
				const wasAllDay = event.allDay ?? false;
				const effectiveEnd = wasAllDay
					? new Date(start.getTime() + 60 * 60_000)
					: end;
				// Timed tasks live within one calendar day ("HH:MM" columns).
				const endsAtMidnight =
					differenceInCalendarDays(effectiveEnd, start) === 1 &&
					effectiveEnd.getTime() === startOfDay(effectiveEnd).getTime();
				if (!isSameDay(start, effectiveEnd) && !endsAtMidnight) {
					toast.info("Tasks stay within a single day.");
					return false;
				}
				// A midnight end is stored as 23:59; clamp the painted end to the
				// same instant or the optimistic override never matches the server
				// row and sticks forever.
				const clampedEnd = endsAtMidnight
					? subMinutes(effectiveEnd, 1)
					: effectiveEnd;
				const commit = applyOverride(event.id, start, clampedEnd, false);
				updateTask({
					id,
					date: dateMs,
					startTime: format(start, "HH:mm"),
					endTime: format(clampedEnd, "HH:mm"),
				})
					.then(() => {
						const times = `${format(start, "h:mm a")} – ${endsAtMidnight ? "midnight" : format(clampedEnd, "h:mm a")}`;
						toast.success(
							isResize
								? `"${event.title}" now runs ${times}.`
								: `"${event.title}" moved to ${format(start, "EEE, MMM d")}, ${times}.`
						);
					})
					.catch((error) => {
						clearOverride(event.id, commit);
						toast.error(errorMessage(error, "Couldn't reschedule the task."));
					});
				// Accept-with-adjustment so the grid paints the clamped end, not
				// the dragged 24h block or a bar spilling into the next day.
				if (wasAllDay) return { end: clampedEnd, allDay: false };
				return endsAtMidnight ? { end: clampedEnd } : true;
			}

			// Projects: whole-day spans only.
			if (!canEditProjects) return false;
			if (!allDay) {
				toast.info("Projects span whole days.");
				return false;
			}
			const lastDay = subDays(end, 1);
			const commit = applyOverride(event.id, start, end, allDay);
			updateProject({
				id: event.id as Id<"projects">,
				startDate: localDateToUtcMidnightMs(start),
				endDate: localDateToUtcMidnightMs(lastDay < start ? start : lastDay),
			})
				.then(() => {
					const span =
						differenceInCalendarDays(lastDay, start) > 0
							? `${format(start, "MMM d")} – ${format(lastDay, "MMM d")}`
							: format(start, "EEE, MMM d");
					toast.success(
						update.source === "resize-end"
							? `"${event.title}" now ends ${format(lastDay, "EEE, MMM d")}.`
							: update.source === "resize-start"
								? `"${event.title}" now starts ${format(start, "EEE, MMM d")}.`
								: `"${event.title}" moved to ${span}.`
					);
				})
				.catch((error) => {
					clearOverride(event.id, commit);
					toast.error(errorMessage(error, "Couldn't reschedule the project."));
				});
			return true;
		},
		[
			canEditTasks,
			canEditProjects,
			applyOverride,
			clearOverride,
			updateTask,
			updateProject,
			toast,
		]
	);

	// ---- Sheets -------------------------------------------------------------
	const openView = useCallback((occurrence: HomeOccurrence) => {
		setSelected(occurrence);
	}, []);

	const closeView = useCallback((open: boolean) => {
		if (!open) setSelected(null);
	}, []);

	const openCreate = useCallback(
		(start: Date, allDay: boolean, end?: Date) => {
			if (!canEditTasks) return;
			setTaskSheet({
				mode: "create",
				date: startOfDay(start),
				startTime: allDay ? undefined : format(start, "HH:mm"),
				endTime:
					allDay || !end || !isSameDay(start, end)
						? undefined
						: format(end, "HH:mm"),
			});
		},
		[canEditTasks]
	);

	const openEditTask = useCallback((taskId: Id<"tasks">) => {
		setSelected(null);
		setTaskSheet({ mode: "edit", taskId });
	}, []);

	const openProject = useCallback(
		(projectId: Id<"projects">) => {
			router.push(`/projects/${projectId}`);
		},
		[router]
	);

	const editingTask = useQuery(
		api.tasks.get,
		taskSheet?.mode === "edit" ? { id: taskSheet.taskId } : "skip"
	);

	// ---- Chip content (the headless render contract) ------------------------
	const renderEvent = useCallback(
		({ occurrence, segment, view }: EventCalendarRenderEventProps<HomeEventData>) => {
			const event = occurrence.event;
			const assignees = event.data?.assigneeIds ?? [];
			// strictly > 24h => a cross-day bar (matches the primitive)
			const isBar =
				occurrence.allDay ||
				occurrence.end.getTime() - occurrence.start.getTime() >
					24 * 60 * 60 * 1000;
			const timedBlock =
				!isBar && (view === "week" || view === "day" || view === "days");
			const stacked =
				timedBlock && (segment.endMin ?? 0) - (segment.startMin ?? 0) >= 45;
			return (
				<>
					{!timedBlock && (
						<span
							aria-hidden="true"
							className="size-1.5 shrink-0 rounded-full bg-(--ec-event-color)"
						/>
					)}
					<span
						className={cn(
							"font-medium",
							stacked ? EVENT_CALENDAR_FADE_TRUNCATE : "truncate"
						)}
					>
						{event.title}
					</span>
					{!occurrence.allDay &&
						segment.isStart &&
						(view === "month" ? (
							<span className="text-muted-foreground shrink-0 text-xs">
								{format(occurrence.start, "h:mm a")}
							</span>
						) : (
							<span
								className={cn(
									"text-muted-foreground hidden @[8rem]:inline",
									stacked ? EVENT_CALENDAR_FADE_TRUNCATE : "truncate"
								)}
							>
								{format(occurrence.start, "h:mm a")} –{" "}
								{format(occurrence.end, "h:mm a")}
							</span>
						))}
					{assignees.length > 0 && segment.isStart && (
						<span
							className={cn(
								"hidden shrink-0 @[9rem]:flex",
								view === "day"
									? "mt-0.5"
									: stacked
										? "absolute end-1 top-1"
										: "ms-auto"
							)}
						>
							<AssigneeStack
								ids={assignees}
								usersById={usersById}
								max={3}
								size="size-4"
							/>
						</span>
					)}
				</>
			);
		},
		[usersById]
	);

	// Agenda rows replace the whole row, so the time column is ours to draw.
	const renderAgendaEvent = useCallback(
		({ occurrence }: EventCalendarRenderEventProps<HomeEventData>) => {
			const event = occurrence.event;
			const assignees = event.data?.assigneeIds ?? [];
			const clientName = event.data?.clientName;
			return (
				<>
					<span className="text-muted-foreground w-40 shrink-0 truncate tabular-nums">
						{occurrence.allDay
							? "All day"
							: `${format(occurrence.start, "h:mm a")} – ${format(occurrence.end, "h:mm a")}`}
					</span>
					<span
						aria-hidden="true"
						className="size-2 shrink-0 rounded-full bg-(--ec-event-color)"
					/>
					<span className="truncate text-sm font-medium">{event.title}</span>
					{clientName && (
						<span className="text-muted-foreground hidden min-w-0 truncate text-xs @[32rem]:inline">
							{clientName}
						</span>
					)}
					{assignees.length > 0 && (
						<span className="ms-auto hidden shrink-0 @[26rem]:flex">
							<AssigneeStack
								ids={assignees}
								usersById={usersById}
								max={4}
								size="size-5"
							/>
						</span>
					)}
				</>
			);
		},
		[usersById]
	);

	// The nav's view-switcher menu advertises these keys; honor them here with
	// focus-within scope (the primitive renders the hints but ships no
	// listener). Portaled sheets don't bubble into this container.
	const handleShortcuts = useCallback(
		(keyEvent: React.KeyboardEvent<HTMLDivElement>) => {
			if (keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey) return;
			const target = keyEvent.target as HTMLElement;
			if (target.closest("input, textarea, select, [contenteditable=true]"))
				return;
			const next = VIEW_BY_SHORTCUT[keyEvent.key.toLowerCase()];
			if (next) {
				keyEvent.preventDefault();
				handleViewChange(next);
			}
		},
		[handleViewChange]
	);

	return (
		<div
			className="bg-background flex h-full w-full min-w-0 flex-row"
			onKeyDown={handleShortcuts}
		>
			<CalendarRail
				className="hidden w-72 shrink-0 flex-col border-e lg:flex"
				date={date}
				onDateChange={setDate}
				month={railMonth}
				onMonthChange={setRailMonth}
				events={events}
				hidden={hidden}
				onToggleKind={toggleKind}
				onOpenOccurrence={openView}
			/>
			<EventCalendar
				events={events}
				date={date}
				onDateChange={setDate}
				view={view}
				onViewChange={handleViewChange}
				views={VIEWS}
				navButtonSize="default"
				nowIndicator
				scrollToHour={7}
				snapDuration={15}
				scrollMode="contained"
				scrollbars="custom"
				showDayAddButton={canEditTasks}
				loading={range !== null && calendarData === undefined}
				onRangeChange={handleRangeChange}
				onEventClick={openView}
				onSlotClick={
					canEditTasks
						? (slot: EventCalendarSlotInfo) =>
								openCreate(slot.date, slot.allDay, slot.end)
						: undefined
				}
				onSelectSlot={
					canEditTasks
						? (slot: EventCalendarSlotDraft) =>
								openCreate(slot.start, slot.allDay, slot.end)
						: undefined
				}
				onEventUpdate={handleEventUpdate}
				canDropEvent={canDropEvent}
				renderEvent={renderEvent}
				renderAgendaEvent={renderAgendaEvent}
				className="min-w-0 flex-1"
			>
				{/* The primitive's nav carries px-2 py-2; the row only needs matching
				    right padding so Today aligns with the grid's weekday labels. */}
				<div className="flex flex-wrap items-center gap-2 pe-2">
					<EventCalendarNav className="min-w-0 flex-1" showViewSwitcher />
					<EventCalendarToolbar className="gap-2">
						{/* The rail owns the kind filters at lg+; this menu is the
						    mobile host. */}
						<div className="lg:hidden">
							<DropdownMenu>
								<DropdownMenuTrigger
									aria-label="Filter calendar"
									render={<Button variant="outline" size="icon" />}
								>
									<ListFilterIcon className="size-4" aria-hidden="true" />
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{EVENT_KINDS.map((kind) => {
										const on = !hidden.has(kind.id);
										return (
											<DropdownMenuItem
												key={kind.id}
												closeOnClick={false}
												onClick={() => toggleKind(kind.id)}
											>
												<span
													aria-hidden="true"
													className="size-2.5 shrink-0 rounded-full"
													style={{ backgroundColor: kind.color }}
												/>
												<span className="flex-1">{kind.name}</span>
												{on && (
													<CheckIcon
														className="size-4"
														aria-hidden="true"
													/>
												)}
											</DropdownMenuItem>
										);
									})}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
						{canEditTasks && (
							<Button
								onClick={() =>
									openCreate(setHours(startOfDay(date), QUICK_ADD_HOUR), false)
								}
							>
								<PlusIcon className="size-4" aria-hidden="true" />
								New task
							</Button>
						)}
					</EventCalendarToolbar>
				</div>
				<EventCalendarContent />
			</EventCalendar>

			<CalendarEventSheet
				occurrence={selected}
				usersById={usersById}
				canEditTask={canEditTasks}
				onOpenChange={closeView}
				onEditTask={openEditTask}
				onOpenProject={openProject}
			/>

			{taskSheet?.mode === "create" && (
				<TaskSheet
					mode="create"
					isOpen
					onOpenChange={(open) => !open && setTaskSheet(null)}
					initialValues={{
						date: taskSheet.date,
						startTime: taskSheet.startTime,
						endTime: taskSheet.endTime,
					}}
				/>
			)}
			{taskSheet?.mode === "edit" && editingTask && (
				<TaskSheet
					mode="edit"
					isOpen
					task={editingTask}
					onOpenChange={(open) => !open && setTaskSheet(null)}
				/>
			)}
		</div>
	);
}

function errorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message) {
		// Convex wraps thrown messages; keep the human part.
		const match = error.message.match(/Uncaught Error: ([^\n]+)/);
		return match?.[1] ?? fallback;
	}
	return fallback;
}
