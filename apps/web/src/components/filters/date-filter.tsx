"use client";

import * as React from "react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

interface DateFilterValueProps {
	/** Filter values — a single ["yyyy-MM-dd"] string. */
	values: unknown[];
	onChange: (values: unknown[]) => void;
	placeholder?: string;
}

const toDate = (value: unknown): Date | undefined =>
	typeof value === "string" && value ? new Date(value) : undefined;

/**
 * Single-date filter value control: a calendar popover that commits the picked
 * day on select as ["yyyy-MM-dd"]. Pair with `before`/`after`/`is` operators.
 * Attach via a field's `customRenderer`; match rows with `matchesDateFilter`.
 */
export function DateFilterValue({
	values,
	onChange,
	placeholder = "Pick a date",
}: DateFilterValueProps) {
	const [open, setOpen] = React.useState(false);
	const selected = toDate(values?.[0]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				className={cn(
					"flex items-center gap-1.5 outline-none",
					!selected && "text-muted-foreground"
				)}
			>
				{selected ? format(selected, "LLL d, y") : placeholder}
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
				<Calendar
					autoFocus
					mode="single"
					defaultMonth={selected}
					selected={selected}
					onSelect={(date) => {
						if (date) onChange([format(date, "yyyy-MM-dd")]);
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}

/**
 * Row matcher for a single-date filter. `recordTs` is the row's date as an epoch
 * ms timestamp; `isoDay` is the picked "yyyy-MM-dd". Compares against the local
 * calendar day. Rows with no date are excluded while a date filter is active.
 */
export function matchesDateFilter(
	recordTs: number | null | undefined,
	operator: string,
	isoDay: unknown
): boolean {
	if (recordTs == null) return false;
	if (typeof isoDay !== "string" || !isoDay) return true;
	const [y, m, d] = isoDay.split("-").map(Number);
	if (!y || !m || !d) return true;
	const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
	const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
	switch (operator) {
		case "before":
			return recordTs < dayStart;
		case "after":
			return recordTs > dayEnd;
		case "is":
			return recordTs >= dayStart && recordTs <= dayEnd;
		default:
			return true;
	}
}
