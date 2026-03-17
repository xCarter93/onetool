"use client";

import React from "react";
import { CalendarEvent } from "@/types/calendar";
import {
	format,
	startOfMonth,
	endOfMonth,
	eachDayOfInterval,
	startOfWeek,
	endOfWeek,
	isSameMonth,
	isToday,
	isSameDay,
} from "date-fns";
import { formatTime } from "@/lib/calendar-utils";
import { StyledButton } from "@/components/ui/styled/styled-button";
import {
	ExternalLink,
	Calendar,
	Clock,
	User,
	Briefcase,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface CalendarDetailSidebarProps {
	event: CalendarEvent | null;
	currentDate?: Date;
	onDateSelect?: (date: Date) => void;
}

export function CalendarDetailSidebar({
	event,
	currentDate = new Date(),
	onDateSelect,
}: CalendarDetailSidebarProps) {
	const router = useRouter();
	const [miniCalendarDate, setMiniCalendarDate] = React.useState(currentDate);

	const handleViewFullDetails = () => {
		if (!event) return;

		if (event.type === "project") {
			router.push(`/projects/${event.id}`);
		} else {
			// For tasks, we'll navigate to the tasks page
			// You might want to add task detail page later
			router.push(`/tasks`);
		}
	};

	// Mini calendar logic
	const monthStart = startOfMonth(miniCalendarDate);
	const monthEnd = endOfMonth(miniCalendarDate);
	const calendarStart = startOfWeek(monthStart);
	const calendarEnd = endOfWeek(monthEnd);
	const calendarDays = eachDayOfInterval({
		start: calendarStart,
		end: calendarEnd,
	});

	const handlePrevMonth = () => {
		const newDate = new Date(miniCalendarDate);
		newDate.setMonth(newDate.getMonth() - 1);
		setMiniCalendarDate(newDate);
	};

	const handleNextMonth = () => {
		const newDate = new Date(miniCalendarDate);
		newDate.setMonth(newDate.getMonth() + 1);
		setMiniCalendarDate(newDate);
	};

	return (
		<div className="h-full overflow-y-auto flex flex-col">
			{/* Mini Calendar */}
			<div className="border-b border-border p-4">
				<div className="flex items-center justify-between mb-3">
					<h3 className="text-sm font-semibold text-foreground">
						{format(miniCalendarDate, "MMMM yyyy")}
					</h3>
					<div className="flex gap-1">
						<button
							onClick={handlePrevMonth}
							className="p-1 hover:bg-muted rounded transition-colors"
						>
							<ChevronLeft className="w-4 h-4" />
						</button>
						<button
							onClick={handleNextMonth}
							className="p-1 hover:bg-muted rounded transition-colors"
						>
							<ChevronRight className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* Day labels */}
				<div className="grid grid-cols-7 gap-1 mb-1">
					{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
						<div
							key={day}
							className="text-center text-xs font-medium text-muted-foreground"
						>
							{day}
						</div>
					))}
				</div>

				{/* Calendar grid */}
				<div className="grid grid-cols-7 gap-1">
					{calendarDays.map((day, idx) => {
						const isCurrentMonth = isSameMonth(day, miniCalendarDate);
						const isCurrentDay = isToday(day);
						const isSelected =
							event && event.type === "task" && isSameDay(day, event.startDate);

						return (
							<button
								key={idx}
								onClick={() => onDateSelect?.(day)}
								className={`
									aspect-square text-xs rounded flex items-center justify-center
									transition-colors
									${!isCurrentMonth ? "text-muted-foreground/40" : "text-foreground"}
									${isCurrentDay ? "bg-primary text-primary-foreground font-semibold" : ""}
									${isSelected && !isCurrentDay ? "bg-primary/20 ring-1 ring-primary" : ""}
									${isCurrentMonth && !isCurrentDay && !isSelected ? "hover:bg-muted" : ""}
								`}
							>
								{format(day, "d")}
							</button>
						);
					})}
				</div>
			</div>

			{/* Event details or empty state */}
			{!event ? (
				<div className="flex-1 flex items-center justify-center p-8">
					<div className="text-center">
						<Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
						<p className="text-sm text-muted-foreground">
							Select an event to view details
						</p>
					</div>
				</div>
			) : (
				<div className="flex-1 p-6 space-y-6">
					{/* Header */}
					<div className="flex items-start justify-between">
						<div className="flex-1">
							<div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
								{event.type === "project" ? (
									<Briefcase className="w-4 h-4" />
								) : (
									<Clock className="w-4 h-4" />
								)}
								<span className="capitalize">{event.type}</span>
							</div>
							<h2 className="text-2xl font-semibold text-foreground">
								{event.title}
							</h2>
						</div>
					</div>

					{/* Status Badge */}
					<div className="flex items-center gap-2">
						<div
							className={`
							px-3 py-1 rounded-full text-xs font-medium
							${
								event.status === "completed"
									? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
									: event.status === "in-progress"
										? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
										: event.status === "planned"
											? "bg-muted text-muted-foreground"
											: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
							}
						`}
					>
						{event.status.replace("-", " ")}
					</div>
				</div>

				{/* Details */}
					<div className="space-y-4">
						{/* Client */}
						<div className="flex items-start gap-3">
							<Briefcase className="w-5 h-5 text-muted-foreground mt-0.5" />
							<div>
								<div className="text-sm font-medium text-foreground">
									Client
								</div>
								<div className="text-sm text-muted-foreground">
									{event.clientName}
								</div>
							</div>
						</div>

						{/* Dates */}
						<div className="flex items-start gap-3">
							<Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
							<div>
								<div className="text-sm font-medium text-foreground">
									{event.type === "project" ? "Project Timeline" : "Date"}
								</div>
								<div className="text-sm text-muted-foreground">
									{format(event.startDate, "MMM d, yyyy")}
									{event.endDate &&
										` - ${format(event.endDate, "MMM d, yyyy")}`}
								</div>
								{event.startTime && (
									<div className="text-sm text-muted-foreground mt-1">
										{formatTime(event.startTime)}
										{event.endTime && ` - ${formatTime(event.endTime)}`}
									</div>
								)}
							</div>
						</div>

						{/* Assigned Users (if any) */}
						{event.assignedUserIds && event.assignedUserIds.length > 0 && (
							<div className="flex items-start gap-3">
								<User className="w-5 h-5 text-muted-foreground mt-0.5" />
								<div>
									<div className="text-sm font-medium text-foreground">
										Assigned Team
									</div>
									<div className="text-sm text-muted-foreground">
										{event.assignedUserIds.length} team member
										{event.assignedUserIds.length > 1 ? "s" : ""}
									</div>
								</div>
							</div>
						)}

						{/* Description */}
						{event.description && (
							<div className="pt-4 border-t border-border">
								<div className="text-sm font-medium text-foreground mb-2">
									Description
								</div>
								<div className="text-sm text-muted-foreground whitespace-pre-wrap">
									{event.description}
								</div>
							</div>
						)}
					</div>

					{/* Actions */}
					<div className="pt-6 border-t border-border">
						<StyledButton
							intent="primary"
							size="lg"
							onClick={handleViewFullDetails}
							icon={<ExternalLink className="w-4 h-4" />}
							className="w-full justify-center"
							showArrow={false}
						>
							View Full Details
						</StyledButton>
					</div>
				</div>
			)}
		</div>
	);
}
