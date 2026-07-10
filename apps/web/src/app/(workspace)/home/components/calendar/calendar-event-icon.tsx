"use client";

import React from "react";
import { CalendarEvent } from "@/types/calendar";
import { getEventColor, formatTime } from "@/lib/calendar-utils";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle2, Circle, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface CalendarEventIconProps {
	event: CalendarEvent;
	onClick?: () => void;
	size?: "sm" | "md" | "lg";
}

export function CalendarEventIcon({
	event,
	onClick,
	size = "md",
}: CalendarEventIconProps) {
	const colors = getEventColor(event.type, event.status);

	const sizeClasses = {
		sm: "w-5 h-5 text-[10px]",
		md: "w-6 h-6 text-xs",
		lg: "w-8 h-8 text-sm",
	};

	const getStatusIcon = () => {
		switch (event.status) {
			case "completed":
				return <CheckCircle2 className="w-3 h-3" />;
			case "in-progress":
				return <Clock className="w-3 h-3" />;
			case "cancelled":
				return <Circle className="w-3 h-3" />;
			default:
				return <Circle className="w-3 h-3" />;
		}
	};

	const tooltipContent = (
		<div className="space-y-1">
			<div className="font-semibold">{event.title}</div>
			<div className="text-xs text-muted-foreground">
				Client: {event.clientName}
			</div>
			<div className="text-xs">
				{format(event.startDate, "MMM d, yyyy")}
				{event.startTime && ` at ${formatTime(event.startTime)}`}
				{event.endTime && ` - ${formatTime(event.endTime)}`}
			</div>
			<div className="text-xs capitalize">Status: {event.status}</div>
			{event.description && (
				<div className="text-xs mt-1 max-w-xs">
					{event.description.slice(0, 100)}
					{event.description.length > 100 && "..."}
				</div>
			)}
		</div>
	);

	return (
		<TooltipProvider delay={300}>
			<Tooltip>
				<TooltipTrigger
					render={
						<div
							className={`
								${colors.bg} ${colors.border} ${colors.text} ${colors.hover}
								${sizeClasses[size]}
								border-2 rounded-full
								flex items-center justify-center
								cursor-pointer transition-all
								shadow-sm hover:shadow-md
								hover:scale-110
							`}
							onClick={onClick}
						/>
					}
				>
					{getStatusIcon()}
				</TooltipTrigger>
				<TooltipContent side="top" className="max-w-sm">
					{tooltipContent}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
