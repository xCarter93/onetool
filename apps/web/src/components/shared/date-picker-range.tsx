"use client";

import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { StyledButton } from "@/components/ui/styled/styled-button";
import {
	endOfMonth,
	endOfWeek,
	endOfYear,
	format,
	startOfDay,
	startOfMonth,
	startOfWeek,
	startOfYear,
	subDays,
	subMonths,
	subWeeks,
	subYears,
} from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

type Preset = {
	label: string;
	getRange: () => DateRange | undefined;
};

type DatePickerRangeProps = {
	value?: DateRange;
	onChange?: (range: DateRange | undefined, preset?: string) => void;
	presets?: Preset[];
	align?: "start" | "center" | "end";
	showArrow?: boolean;
};

const defaultPresets: Preset[] = [
	{
		label: "Today",
		getRange: () => {
			const today = startOfDay(new Date());
			return { from: today, to: today };
		},
	},
	{
		label: "Yesterday",
		getRange: () => {
			const day = startOfDay(subDays(new Date(), 1));
			return { from: day, to: day };
		},
	},
	{
		label: "This week",
		getRange: () => {
			const now = new Date();
			return {
				from: startOfWeek(now, { weekStartsOn: 0 }),
				to: endOfWeek(now, { weekStartsOn: 0 }),
			};
		},
	},
	{
		label: "Last week",
		getRange: () => {
			const lastWeek = subWeeks(new Date(), 1);
			return {
				from: startOfWeek(lastWeek, { weekStartsOn: 0 }),
				to: endOfWeek(lastWeek, { weekStartsOn: 0 }),
			};
		},
	},
	{
		label: "This month",
		getRange: () => {
			const now = new Date();
			return { from: startOfMonth(now), to: endOfMonth(now) };
		},
	},
	{
		label: "Last month",
		getRange: () => {
			const lastMonth = subMonths(new Date(), 1);
			return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
		},
	},
	{
		label: "This year",
		getRange: () => {
			const now = new Date();
			return { from: startOfYear(now), to: endOfYear(now) };
		},
	},
	{
		label: "Last year",
		getRange: () => {
			const lastYear = subYears(new Date(), 1);
			return { from: startOfYear(lastYear), to: endOfYear(lastYear) };
		},
	},
	{
		label: "All time",
		getRange: () => ({ from: undefined, to: undefined }),
	},
];

const normalizeRange = (range?: DateRange | null): DateRange | undefined => {
	if (!range) return undefined;
	const from = range.from ? startOfDay(range.from) : undefined;
	const to = range.to ? startOfDay(range.to) : undefined;
	if (!from && !to) return undefined;
	return { from, to };
};

// Find the preset whose range matches a controlled value, if any
const findMatchingPreset = (
	value: DateRange | undefined,
	presets: Preset[]
): string | undefined => {
	if (value === undefined) return undefined;
	const normalizedValue = normalizeRange(value);
	if (!normalizedValue) return undefined;
	const matchingPreset = presets.find((preset) => {
		const presetRange = normalizeRange(preset.getRange());
		return (
			presetRange?.from?.getTime() === normalizedValue.from?.getTime() &&
			presetRange?.to?.getTime() === normalizedValue.to?.getTime()
		);
	});
	return matchingPreset?.label;
};

export default function DatePickerRange({
	value,
	onChange,
	presets = defaultPresets,
	align = "start",
	showArrow = true,
}: DatePickerRangeProps) {
	const defaultPresetRange = useMemo<DateRange | undefined>(
		() => presets.find((preset) => preset.label === "This month")?.getRange(),
		[presets]
	);

	// Capture the initial default range once (stable across renders)
	const [defaultRange] = useState<DateRange | undefined>(
		() => value ?? defaultPresetRange
	);

	const [isPopoverOpen, setIsPopoverOpen] = useState(false);
	const [draftRange, setDraftRange] = useState<DateRange | undefined>(
		normalizeRange(defaultRange)
	);
	const [activePreset, setActivePreset] = useState<string | undefined>(
		undefined
	);
	const [committedPreset, setCommittedPreset] = useState<string | undefined>(
		() => (value !== undefined ? findMatchingPreset(value, presets) : undefined)
	);

	const committedRange = useMemo(
		() => normalizeRange(value ?? defaultRange),
		[value, defaultRange]
	);

	// Sync draft when the committed range changes
	const [prevCommittedRange, setPrevCommittedRange] = useState(committedRange);
	if (committedRange !== prevCommittedRange) {
		setPrevCommittedRange(committedRange);
		setDraftRange(committedRange);
	}

	// In controlled mode, recompute the committed preset from value/presets
	const [prevValue, setPrevValue] = useState(value);
	const [prevPresets, setPrevPresets] = useState(presets);
	if (value !== prevValue || presets !== prevPresets) {
		setPrevValue(value);
		setPrevPresets(presets);
		if (value !== undefined) {
			setCommittedPreset(findMatchingPreset(value, presets));
		}
	}

	// When the popover closes, discard any unapplied draft edits
	const [prevPopoverOpen, setPrevPopoverOpen] = useState(isPopoverOpen);
	if (isPopoverOpen !== prevPopoverOpen) {
		setPrevPopoverOpen(isPopoverOpen);
		if (!isPopoverOpen) {
			setDraftRange(committedRange);
			setActivePreset(committedPreset);
		}
	}

	const handleSelect = (selected: DateRange | undefined) => {
		setDraftRange(normalizeRange(selected));
		setActivePreset(undefined);
	};

	const applyRange = (range?: DateRange, presetLabel?: string) => {
		const normalized = normalizeRange(range);
		setCommittedPreset(presetLabel);
		setActivePreset(presetLabel);
		onChange?.(normalized, presetLabel);
		setIsPopoverOpen(false);
	};

	const handleApply = () => applyRange(draftRange, activePreset);

	const handleReset = () => {
		const resetRange = normalizeRange(defaultRange);
		setDraftRange(resetRange);
		setActivePreset(undefined);
		setCommittedPreset(undefined);
		onChange?.(resetRange, undefined);
		setIsPopoverOpen(false);
	};

	const handlePresetClick = (preset: Preset) => {
		const nextRange = normalizeRange(preset.getRange());
		setDraftRange(nextRange);
		setActivePreset(preset.label);
	};

	const displayLabel = useMemo(() => {
		if (committedPreset) return committedPreset;
		const from = committedRange?.from;
		const to = committedRange?.to;
		if (from && to) {
			return `${format(from, "LLL d, yyyy")} - ${format(to, "LLL d, yyyy")}`;
		}
		if (from) {
			return format(from, "LLL d, yyyy");
		}
		return "Pick a date range";
	}, [committedPreset, committedRange]);

	return (
		<Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
			<PopoverTrigger asChild>
				<StyledButton
					type="button"
					intent="outline"
					showArrow={showArrow}
					className="inline-flex w-full min-w-[260px] items-center justify-between gap-2"
				>
					<div className="flex items-center gap-2">
						<CalendarIcon className="size-4" />
						<span className="text-sm font-medium">{displayLabel}</span>
					</div>
				</StyledButton>
			</PopoverTrigger>
			<PopoverContent
				className="w-auto max-w-[780px] rounded-lg border border-border bg-background p-0 text-foreground shadow-lg"
				style={{ backgroundColor: "var(--background)" }}
				align={align}
				side="bottom"
				sideOffset={8}
			>
				<div className="flex flex-col gap-3 sm:flex-row">
					<div className="w-full min-w-[200px] border-b border-border/60 bg-muted/30 p-3 sm:w-48 sm:border-b-0 sm:border-r">
						<div className="space-y-1">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Quick ranges
							</p>
							<div className="flex flex-col gap-1">
								{presets.map((preset) => (
									<button
										key={preset.label}
										type="button"
										onClick={() => handlePresetClick(preset)}
										className={cn(
											"flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
											activePreset === preset.label
												? "bg-primary/10 text-primary"
												: "text-foreground"
										)}
									>
										<span>{preset.label}</span>
									</button>
								))}
							</div>
						</div>
					</div>

					<div className="flex flex-col gap-3 p-3">
						<Calendar
							autoFocus
							mode="range"
							defaultMonth={draftRange?.from ?? new Date()}
							showOutsideDays={false}
							selected={draftRange}
							onSelect={handleSelect}
							numberOfMonths={2}
						/>

						<div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
							<div className="text-sm text-muted-foreground">
								{draftRange?.from
									? `${format(draftRange.from, "LLL d, yyyy")} ${
											draftRange?.to
												? `— ${format(draftRange.to, "LLL d, yyyy")}`
												: ""
										}`
									: "No dates selected"}
							</div>
							<div className="flex items-center justify-end gap-1.5">
								<StyledButton intent="outline" onClick={handleReset}>
									Reset
								</StyledButton>
								<StyledButton intent="primary" onClick={handleApply}>
									Apply
								</StyledButton>
							</div>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
