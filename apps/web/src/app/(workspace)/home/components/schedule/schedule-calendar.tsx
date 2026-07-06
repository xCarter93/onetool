"use client";

import { type ComponentProps, type HTMLAttributes } from "react";
import { format, isToday } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayButton, type CalendarWeek } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { MONTHS, YEARS } from "./schedule-data";

export function ScheduleCalendar({
	month,
	onMonthChange,
	selected,
	onSelect,
	datesWithEvents,
}: {
	month: Date;
	onMonthChange: (date: Date) => void;
	selected?: Date;
	onSelect: (date: Date | undefined) => void;
	datesWithEvents: Set<string>;
}) {
	const stepMonth = (delta: number) => {
		const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
		if (
			next.getFullYear() < YEARS[0] ||
			next.getFullYear() > YEARS[YEARS.length - 1]
		)
			return;
		onMonthChange(next);
	};

	const handleMonthSelect = (value: string) => {
		const i = MONTHS.indexOf(value);
		if (i >= 0) onMonthChange(new Date(month.getFullYear(), i, 1));
	};

	const handleYearSelect = (value: string) => {
		const y = parseInt(value, 10);
		if (!Number.isNaN(y)) onMonthChange(new Date(y, month.getMonth(), 1));
	};

	return (
		<div className="flex select-none flex-col gap-4">
			{/* Header: prev · month · year · next */}
			<div className="flex w-full items-center justify-between gap-1.5">
				<button
					type="button"
					aria-label="Previous month"
					onClick={() => stepMonth(-1)}
					className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
				>
					<ChevronLeftIcon className="size-4" aria-hidden />
				</button>

				<Select
					value={MONTHS[month.getMonth()]}
					onValueChange={handleMonthSelect}
				>
					<SelectTrigger size="sm" className="min-w-0 flex-1">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{MONTHS.map((m) => (
							<SelectItem key={m} value={m}>
								{m}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={String(month.getFullYear())}
					onValueChange={handleYearSelect}
				>
					<SelectTrigger size="sm" className="w-[84px] shrink-0">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{YEARS.map((y) => (
							<SelectItem key={y} value={String(y)}>
								{y}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<button
					type="button"
					aria-label="Next month"
					onClick={() => stepMonth(1)}
					className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
				>
					<ChevronRightIcon className="size-4" aria-hidden />
				</button>
			</div>

			<Calendar
				mode="single"
				selected={selected}
				onSelect={onSelect}
				month={month}
				onMonthChange={onMonthChange}
				showOutsideDays
				hideNavigation
				className="w-full bg-transparent p-0 [--cell-size:--spacing(9)]"
				formatters={{
					formatWeekdayName: (date) =>
						date.toLocaleString("en-US", { weekday: "short" }).toUpperCase(),
				}}
				classNames={{
					month_caption: "hidden",
					nav: "hidden",
					weekdays: "flex gap-1",
					weekday:
						"flex-1 flex items-center justify-center h-8 text-[0.65rem] font-medium text-muted-foreground",
					week: "flex gap-1 mt-1",
					day: "flex-1 aspect-square p-0 flex items-center justify-center",
					day_button: cn(
						"bg-muted/40 hover:bg-muted rounded-md items-center justify-center",
						"data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:hover:bg-primary data-[selected-single=true]:hover:text-primary-foreground!"
					),
					outside: "opacity-40",
					disabled: "opacity-40",
					today: "rounded-md",
				}}
				components={{
					Week: ({
						week,
						className: weekClassName,
						...weekProps
					}: { week: CalendarWeek } & HTMLAttributes<HTMLTableRowElement>) => {
						const isCurrentWeek = week.days.some((d) => isToday(d.date));
						return (
							<tr
								className={cn(
									weekClassName,
									isCurrentWeek &&
										"rounded-lg bg-primary/[0.04] ring-1 ring-primary/60"
								)}
								{...weekProps}
							/>
						);
					},
					DayButton: ({
						children,
						modifiers,
						day,
						className: dayClassName,
						...props
					}: ComponentProps<typeof DayButton>) => {
						const dateKey = format(day.date, "yyyy-MM-dd");
						const hasEvents = !modifiers.outside && datesWithEvents.has(dateKey);
						return (
							<CalendarDayButton
								day={day}
								modifiers={modifiers}
								className={cn(
									dayClassName,
									modifiers.today &&
										!modifiers.selected &&
										"ring-1 ring-inset ring-primary/50"
								)}
								{...props}
							>
								{hasEvents ? (
									<span
										className="bg-primary in-data-[selected-single=true]:bg-primary-foreground! size-1 rounded-full"
										aria-hidden
									/>
								) : (
									<span className="size-1" aria-hidden />
								)}
								{children}
							</CalendarDayButton>
						);
					},
				}}
			/>
		</div>
	);
}
