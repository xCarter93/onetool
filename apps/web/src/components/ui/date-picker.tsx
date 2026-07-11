"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
	value?: Date;
	onChange?: (date: Date | undefined) => void;
	placeholder?: string;
	/** Disables the trigger button. */
	disabled?: boolean;
	/** react-day-picker matcher for un-selectable days. */
	disabledDates?: React.ComponentProps<typeof Calendar>["disabled"];
	formatDate?: (date: Date) => string;
	align?: "start" | "center" | "end";
	className?: string;
	id?: string;
	/** Controlled popover state (e.g. auto-open on edit-mode entry). When
	 * controlled, selecting a date does NOT auto-close — the owner decides. */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

function defaultFormatDate(date: Date): string {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

/**
 * The standard single-date field: outline button trigger + calendar popover.
 * Use this for every date field instead of composing Popover + Calendar ad hoc.
 */
function DatePicker({
	value,
	onChange,
	placeholder = "Select date",
	disabled = false,
	disabledDates,
	formatDate = defaultFormatDate,
	align = "start",
	className,
	id,
	open,
	onOpenChange,
}: DatePickerProps) {
	const [internalOpen, setInternalOpen] = React.useState(false);
	const isControlled = open !== undefined;

	const handleOpenChange = (next: boolean) => {
		if (!isControlled) setInternalOpen(next);
		onOpenChange?.(next);
	};

	return (
		<Popover open={isControlled ? open : internalOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger
				disabled={disabled}
				render={
					<Button
						variant="outline"
						id={id}
						className={cn(
							"w-full justify-start text-left font-normal",
							!value && "text-muted-foreground",
							className
						)}
					/>
				}
			>
				<CalendarIcon className="mr-2 h-4 w-4" />
				{value ? formatDate(value) : placeholder}
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align={align}>
				<Calendar
					mode="single"
					selected={value}
					onSelect={(date) => {
						onChange?.(date);
						if (!isControlled) setInternalOpen(false);
					}}
					disabled={disabledDates}
				/>
			</PopoverContent>
		</Popover>
	);
}

export { DatePicker };
export type { DatePickerProps };
