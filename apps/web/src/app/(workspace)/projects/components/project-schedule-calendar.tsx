"use client";

import { useCallback, useMemo, useState } from "react";
import { addDays, format, isAfter, isBefore, isSameDay } from "date-fns";
import { CheckCircle2, CircleDollarSign, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import {
	EventCalendar,
	type EventCalendarRenderEventProps,
} from "@/components/reui/event-calendar/event-calendar";
import { EventCalendarContent } from "@/components/reui/event-calendar/event-calendar-content";
import { EventCalendarNav } from "@/components/reui/event-calendar/event-calendar-nav";
import type {
	CalendarEvent,
	EventCalendarOccurrence,
} from "@/components/reui/event-calendar/event-calendar-types";
import { TaskSheet } from "@/components/shared/task-sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePermissions } from "@/hooks/use-permissions";
import { utcMidnightMsToLocalDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/money";

// Matches the home calendar's task kind color (home/components/calendar/calendar-events.ts).
const TASK_COLOR = "var(--color-emerald-500)";

interface MilestoneStyle {
	chip: string;
	icon: string;
}

// Tinted micro-chip treatment so milestones read against the range tint.
const MILESTONE_SENT: MilestoneStyle = {
	chip: "bg-info/15 dark:bg-info/25",
	icon: "text-info-foreground dark:text-info",
};
const MILESTONE_DONE: MilestoneStyle = {
	chip: "bg-success/15 dark:bg-success/25",
	icon: "text-success-foreground dark:text-success",
};

interface Milestone {
	key: string;
	label: string;
	/** Epoch ms of the milestone instant. */
	when: number;
	amount?: number;
	icon: LucideIcon;
	style: MilestoneStyle;
}

function MilestoneChip({
	label,
	icon: Icon,
	style,
	detail,
}: {
	label: string;
	icon: LucideIcon;
	style: MilestoneStyle;
	detail?: React.ReactNode;
}) {
	const chip = (
		<span
			className={`inline-flex size-4 shrink-0 items-center justify-center rounded-sm ${style.chip}`}
		>
			<Icon aria-hidden="true" className={`size-3 ${style.icon}`} />
			{label && <span className="sr-only">{label}</span>}
		</span>
	);
	if (!detail) return chip;
	return (
		<TooltipProvider delay={300}>
			<Tooltip>
				<TooltipTrigger render={chip} />
				<TooltipContent side="top">{detail}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

const READ_ONLY_INTERACTIONS = {
	drag: false,
	resize: false,
	selectSlot: false,
};

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
const DAY_KEY_FORMAT = "yyyy-MM-dd";

interface ProjectScheduleCalendarProps {
	startDate?: number;
	endDate?: number;
	tasks: Doc<"tasks">[] | undefined;
	quotes: Doc<"quotes">[] | undefined;
	invoices: Doc<"invoices">[] | undefined;
}

export function ProjectScheduleCalendar({
	startDate,
	endDate,
	tasks,
	quotes,
	invoices,
}: ProjectScheduleCalendarProps) {
	const { can } = usePermissions();
	const [editingTask, setEditingTask] = useState<Doc<"tasks"> | null>(null);

	const rangeStart = startDate ? utcMidnightMsToLocalDate(startDate) : null;
	const rangeEnd = endDate ? utcMidnightMsToLocalDate(endDate) : rangeStart;

	const events = useMemo(() => {
		const result: CalendarEvent[] = [];
		for (const task of tasks ?? []) {
			const day = utcMidnightMsToLocalDate(task.date);
			const start = timeOnDay(day, task.startTime);
			const end = start ? timeOnDay(day, task.endTime) : null;
			result.push({
				id: task._id,
				title: task.title,
				start: start ?? day,
				end: start
					? end && end > start
						? end
						: new Date(start.getTime() + DEFAULT_TASK_MINUTES * 60_000)
					: addDays(day, 1),
				allDay: !start,
				color: TASK_COLOR,
				readOnly: true,
			});
		}
		return result;
	}, [tasks]);

	// Milestone timestamps are real instants (epoch ms), bucketed by local day.
	const milestonesByDay = useMemo(() => {
		const byDay = new Map<string, Milestone[]>();
		const add = (ms: number, milestone: Milestone) => {
			const dayKey = format(new Date(ms), DAY_KEY_FORMAT);
			const list = byDay.get(dayKey) ?? [];
			list.push(milestone);
			byDay.set(dayKey, list);
		};
		for (const quote of quotes ?? []) {
			const name = quote.quoteNumber || quote.title || "Quote";
			if (quote.firstSentAt)
				add(quote.firstSentAt, {
					key: `${quote._id}-sent`,
					label: `${name} sent`,
					when: quote.firstSentAt,
					amount: quote.total,
					icon: Send,
					style: MILESTONE_SENT,
				});
			if (quote.approvedAt)
				add(quote.approvedAt, {
					key: `${quote._id}-approved`,
					label: `${name} approved`,
					when: quote.approvedAt,
					amount: quote.total,
					icon: CheckCircle2,
					style: MILESTONE_DONE,
				});
		}
		for (const invoice of invoices ?? []) {
			const name = invoice.invoiceNumber || "Invoice";
			if (invoice.firstSentAt)
				add(invoice.firstSentAt, {
					key: `${invoice._id}-sent`,
					label: `${name} sent`,
					when: invoice.firstSentAt,
					amount: invoice.total,
					icon: Send,
					style: MILESTONE_SENT,
				});
			if (invoice.paidAt)
				add(invoice.paidAt, {
					key: `${invoice._id}-paid`,
					label: `${name} paid`,
					when: invoice.paidAt,
					amount: invoice.total,
					icon: CircleDollarSign,
					style: MILESTONE_DONE,
				});
		}
		return byDay;
	}, [quotes, invoices]);

	// Open on today when it falls inside the project range (or no range is
	// set); otherwise open on the project start month.
	const [initialDate] = useState(() => {
		const today = new Date();
		if (!rangeStart) return today;
		if (isBefore(today, rangeStart)) return rangeStart;
		if (rangeEnd && isAfter(today, addDays(rangeEnd, 1))) return rangeStart;
		return today;
	});

	const dayClassName = useCallback(
		(day: Date) => {
			if (!rangeStart || !rangeEnd) return undefined;
			if (isSameDay(day, rangeStart) || isSameDay(day, rangeEnd))
				return "bg-primary/20";
			if (isAfter(day, rangeStart) && isBefore(day, rangeEnd))
				return "bg-primary/10";
			return undefined;
		},
		// rangeStart/rangeEnd are derived Dates; key on the stored numbers.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[startDate, endDate]
	);

	const renderEvent = useCallback(
		({ occurrence, segment }: EventCalendarRenderEventProps) => (
			<>
				<span
					aria-hidden="true"
					className="size-1.5 shrink-0 rounded-full bg-(--ec-event-color)"
				/>
				<span className="truncate font-medium">{occurrence.event.title}</span>
				{!occurrence.allDay && segment.isStart && (
					<span className="text-muted-foreground shrink-0 text-xs">
						{format(occurrence.start, "h:mm a")}
					</span>
				)}
			</>
		),
		[]
	);

	const canEditTasks = can("tasks", "modify");

	const handleEventClick = useCallback(
		(occurrence: EventCalendarOccurrence) => {
			if (!canEditTasks) return;
			const task = tasks?.find((t) => t._id === occurrence.event.id);
			if (task) setEditingTask(task);
		},
		[tasks, canEditTasks]
	);

	const hasMilestones = milestonesByDay.size > 0;

	return (
		<div className="rounded-xl border border-border bg-card">
			<EventCalendar
				events={events}
				defaultDate={initialDate}
				views={["month"]}
				defaultView="month"
				scrollMode="page"
				fixedWeeks={false}
				maxEventsPerCell={3}
				interactions={READ_ONLY_INTERACTIONS}
				// tasks stays undefined forever when the viewer lacks tasks access
				// (the page skips the query), so gate loading on the permission.
				loading={can("tasks") && tasks === undefined}
				eventTooltip={{ delay: 300 }}
				dayClassName={dayClassName}
				onEventClick={handleEventClick}
				renderMonthCell={({ day, defaultContent }) => {
					const items = milestonesByDay.get(format(day, DAY_KEY_FORMAT));
					if (!items?.length) return defaultContent;
					return (
						<>
							{defaultContent}
							<div className="flex shrink-0 flex-wrap items-center gap-1 px-1.5 pb-1">
								{items.map((milestone) => (
									<MilestoneChip
										key={milestone.key}
										label={milestone.label}
										icon={milestone.icon}
										style={milestone.style}
										detail={
											<div className="flex flex-col gap-0.5">
												<span className="font-medium">{milestone.label}</span>
												<span className="text-muted-foreground">
													{format(new Date(milestone.when), "MMM d, h:mm a")}
													{milestone.amount != null && (
														<> · {formatCurrency(milestone.amount)}</>
													)}
												</span>
											</div>
										}
									/>
								))}
							</div>
						</>
					);
				}}
				renderEvent={renderEvent}
				// Compact rows: override the primitive's 8rem page-mode minimum.
				className="[--ec-month-row-min-h:4.5rem]"
			>
				<EventCalendarNav showViewSwitcher={false} />
				<EventCalendarContent />
			</EventCalendar>

			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground">
				{rangeStart && (
					<span className="inline-flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="size-2 rounded-full bg-primary/60"
						/>
						Project range
					</span>
				)}
				<span className="inline-flex items-center gap-1.5">
					<span
						aria-hidden="true"
						className="size-2 rounded-full"
						style={{ backgroundColor: TASK_COLOR }}
					/>
					Tasks
				</span>
				{hasMilestones && (
					<>
						<span className="inline-flex items-center gap-1.5">
							<MilestoneChip label="" icon={Send} style={MILESTONE_SENT} />
							Sent
						</span>
						<span className="inline-flex items-center gap-1.5">
							<MilestoneChip
								label=""
								icon={CheckCircle2}
								style={MILESTONE_DONE}
							/>
							Approved
						</span>
						<span className="inline-flex items-center gap-1.5">
							<MilestoneChip
								label=""
								icon={CircleDollarSign}
								style={MILESTONE_DONE}
							/>
							Paid
						</span>
					</>
				)}
			</div>

			{editingTask && (
				<TaskSheet
					mode="edit"
					isOpen
					task={editingTask}
					onOpenChange={(open) => !open && setEditingTask(null)}
				/>
			)}
		</div>
	);
}
