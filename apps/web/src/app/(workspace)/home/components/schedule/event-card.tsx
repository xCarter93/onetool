import { Briefcase, Building2, Clock, ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/reui/badge";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import type { CalendarEvent } from "@/types/calendar";
import {
	formatEventWhen,
	statusBadgeVariant,
	statusLabel,
} from "./schedule-data";

export function EventCard({
	event,
	onClick,
}: {
	event: CalendarEvent;
	onClick?: () => void;
}) {
	const TypeIcon = event.type === "project" ? Briefcase : ListChecks;
	const when = formatEventWhen(event);
	const interactive = Boolean(onClick);

	return (
		<Item
			variant="outline"
			size="sm"
			{...(interactive
				? {
						role: "button",
						tabIndex: 0,
						onClick,
						onKeyDown: (e: React.KeyboardEvent) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onClick?.();
							}
						},
					}
				: {})}
			className={cn(
				"items-start gap-3",
				interactive &&
					"cursor-pointer transition-colors hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
			)}
		>
			<ItemMedia variant="icon" className="text-muted-foreground">
				<TypeIcon />
			</ItemMedia>
			<ItemContent className="gap-1.5">
				<ItemTitle className="text-foreground">{event.title}</ItemTitle>
				<div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
					<Badge variant={statusBadgeVariant(event.status)} size="sm">
						{statusLabel(event.status)}
					</Badge>
					{when ? (
						<span className="flex items-center gap-1">
							<Clock className="size-3 shrink-0" aria-hidden />
							{when}
						</span>
					) : null}
					<span className="flex min-w-0 items-center gap-1">
						<Building2 className="size-3 shrink-0" aria-hidden />
						<span className="truncate">{event.clientName}</span>
					</span>
				</div>
			</ItemContent>
		</Item>
	);
}
