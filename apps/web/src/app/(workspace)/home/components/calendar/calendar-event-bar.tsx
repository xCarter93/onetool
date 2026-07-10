"use client";

import React from "react";
import { CalendarEvent } from "@/types/calendar";
import { getEventColor } from "@/lib/calendar-utils";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ClipboardList, RotateCw, CheckCircle2, XCircle } from "lucide-react";

interface CalendarEventBarProps {
	event: CalendarEvent;
	style?: React.CSSProperties;
	onClick?: () => void;
	isMultiDay?: boolean;
}

export function CalendarEventBar({
	event,
	style,
	onClick,
	isMultiDay = false,
}: CalendarEventBarProps) {
	const colors = getEventColor(event.type, event.status);

	const getStatusIcon = () => {
		if (event.type === "project") {
			switch (event.status) {
				case "planned":
					return <ClipboardList className="w-3 h-3" />;
				case "in-progress":
					return <RotateCw className="w-3 h-3" />;
				case "completed":
					return <CheckCircle2 className="w-3 h-3" />;
				case "cancelled":
					return <XCircle className="w-3 h-3" />;
				default:
					return null;
			}
		}
		return null;
	};

	const tooltipContent = (
		<div className="space-y-1">
			<div className="font-semibold">{event.title}</div>
			<div className="text-xs text-muted-foreground">
				Client: {event.clientName}
			</div>
			{event.type === "project" && (
				<>
					<div className="text-xs">
						{format(event.startDate, "MMM d")}
						{event.endDate && ` - ${format(event.endDate, "MMM d, yyyy")}`}
					</div>
					<div className="text-xs capitalize">Status: {event.status}</div>
				</>
			)}
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
								border rounded px-2 py-1 text-xs font-medium
								truncate cursor-pointer transition-colors
								shadow-sm
								${isMultiDay ? "min-h-[28px]" : "h-full"}
							`}
							style={style}
							onClick={onClick}
						/>
					}
				>
					<div className="flex items-center gap-1">
						{getStatusIcon()}
						<span className="truncate flex-1">{event.title}</span>
					</div>
				</TooltipTrigger>
				<TooltipContent side="top" className="max-w-sm">
					{tooltipContent}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
