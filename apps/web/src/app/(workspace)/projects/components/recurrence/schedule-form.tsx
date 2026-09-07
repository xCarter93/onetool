"use client";

import { useId, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { validateRecurrenceRule } from "@onetool/backend/convex/lib/projectRecurrence";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DatePicker } from "@/components/ui/date-picker";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
	DEFAULT_RECURRENCE_FORM,
	MAX_DURATION_DAYS,
	applyMonthlyChoice,
	applyPreset,
	describeRecurrence,
	durationCountFromOffset,
	durationOffsetFromCount,
	formatVisitRange,
	monthlyChoice,
	monthlyChoiceOptions,
	recurrenceRuleToForm,
	serializeRecurrenceRule,
	validateDurationCount,
	validateRecurrenceForm,
	type RecurrenceFormValue,
	type RecurrencePreset,
	type RecurrenceRule,
} from "./rule";

const CADENCES = [
	["daily", "Every day"],
	["weekly", "Every week"],
	["biweekly", "Every 2 weeks"],
	["monthly", "Every month"],
	["yearly", "Every year"],
	["custom", "Custom…"],
] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const INTERVAL_UNITS = [
	["daily", "days"],
	["weekly", "weeks"],
	["monthly", "months"],
	["yearly", "years"],
] as const;
const ORDINALS = [
	[1, "First"],
	[2, "Second"],
	[3, "Third"],
	[4, "Fourth"],
	[5, "Fifth"],
	[-1, "Last"],
] as const;

function dateKey(date: Date): string {
	const year = date.getFullYear();
	return `${year}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value: string): Date | undefined {
	if (!value) return undefined;
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year, month - 1, day);
}

function toggle(values: number[], value: number): number[] {
	return values.includes(value)
		? values.filter((candidate) => candidate !== value)
		: [...values, value];
}

export function initialRecurrenceForm(startDate: number): RecurrenceFormValue {
	const date = new Date(startDate);
	return {
		...DEFAULT_RECURRENCE_FORM,
		weekdays: [date.getUTCDay()],
		monthDays: [date.getUTCDate()],
	};
}

export function RecurrenceScheduleForm({
	projectId,
	seriesId,
	startDate,
	initialRule,
	initialDurationOffset,
	onSubmit,
	isSubmitting,
	submitLabel = "Set up recurrence",
}: {
	projectId?: Id<"projects">;
	seriesId?: Id<"projectSeries">;
	startDate: number;
	initialRule?: RecurrenceRule;
	initialDurationOffset?: number;
	onSubmit: (
		rule: RecurrenceRule,
		durationOffset: number,
		expectedVersion?: number,
	) => Promise<void>;
	isSubmitting: boolean;
	submitLabel?: string;
}) {
	const [value, setValue] = useState(() => {
		const anchored = initialRecurrenceForm(startDate);
		if (!initialRule) return anchored;
		const fromRule = recurrenceRuleToForm(initialRule);
		return {
			...fromRule,
			weekdays: initialRule.weekdays ?? anchored.weekdays,
			monthDays: initialRule.monthDays ?? anchored.monthDays,
		};
	});
	const [durationCount, setDurationCount] = useState(() =>
		durationCountFromOffset(initialDurationOffset),
	);
	const rule = useMemo(() => serializeRecurrenceRule(value), [value]);
	const anchorDateKey = new Date(startDate).toISOString().slice(0, 10);
	const error =
		validateRecurrenceForm(value) ??
		validateRecurrenceRule(rule, anchorDateKey);
	const durationError = validateDurationCount(durationCount);
	const blocked = !!error || !!durationError;
	const setupPreview = useQuery(
		api.projectSeries.preview,
		blocked || !projectId ? "skip" : { projectId, rule, limit: 8 },
	);
	const changePreview = useQuery(
		api.projectSeries.previewScheduleChange,
		blocked || !seriesId
			? "skip"
			: {
					seriesId,
					rule,
					durationDays: durationOffsetFromCount(durationCount),
				},
	);
	const preview = seriesId ? changePreview?.dates : setupPreview;

	return (
		<form
			className="space-y-6"
			onSubmit={async (event) => {
				event.preventDefault();
				if (!blocked)
					await onSubmit(
						rule,
						durationOffsetFromCount(durationCount),
						changePreview?.revision,
					);
			}}
		>
			<RecurrenceScheduleFields
				value={value}
				onChange={setValue}
				anchorDateKey={anchorDateKey}
				durationCount={durationError ? 1 : durationCount}
				duration={{
					value: durationCount,
					onChange: setDurationCount,
					error: durationError,
				}}
				error={error}
				preview={preview}
				affectedPreview={changePreview}
				disabled={isSubmitting}
			/>
			<div className="flex justify-end border-t pt-4">
				<Button
					type="submit"
					disabled={blocked || preview === undefined || isSubmitting}
					className={cn(isSubmitting && "opacity-70")}
				>
					{isSubmitting ? "Updating..." : submitLabel}
				</Button>
			</div>
		</form>
	);
}

export function RecurrenceScheduleFields({
	value,
	onChange,
	anchorDateKey,
	durationCount,
	duration,
	error,
	preview,
	affectedPreview,
	disabled = false,
}: {
	value: RecurrenceFormValue;
	onChange: (value: RecurrenceFormValue) => void;
	anchorDateKey: string;
	durationCount: number;
	duration?: {
		value: number;
		onChange: (count: number) => void;
		error?: string | null;
	};
	error?: string | null;
	preview?: string[];
	affectedPreview?: { count: number; preserved: number };
	disabled?: boolean;
}) {
	const fieldId = useId();
	const usesMonthlyPattern =
		value.frequency === "monthly" || value.frequency === "yearly";
	const choice = monthlyChoice(value, anchorDateKey);
	const [moreOpen, setMoreOpen] = useState(
		() =>
			value.preset === "custom" || (usesMonthlyPattern && choice === "custom"),
	);
	const update = (patch: Partial<RecurrenceFormValue>) =>
		onChange({ ...value, ...patch });

	return (
		<fieldset className="space-y-6" disabled={disabled}>
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="text-muted-foreground">Repeats</span>
					<Select
						disabled={disabled}
						value={value.preset}
						onValueChange={(next) => {
							const preset = next as RecurrencePreset;
							if (preset === "custom") setMoreOpen(true);
							onChange(applyPreset(value, preset));
						}}
					>
						<SelectTrigger className="w-auto min-w-40" aria-label="Repeats">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CADENCES.map(([preset, label]) => (
								<SelectItem key={preset} value={preset}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{value.frequency === "weekly" && (
						<>
							<span className="text-muted-foreground">on</span>
							<ToggleGroup
								multiple
								variant="outline"
								aria-label="Visit days"
								disabled={disabled}
								value={value.weekdays.map(String)}
								onValueChange={(next) => update({ weekdays: next.map(Number) })}
							>
								{WEEKDAYS.map((label, weekday) => (
									<ToggleGroupItem key={label} value={String(weekday)}>
										{label}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</>
					)}

					{usesMonthlyPattern && (
						<>
							<span className="text-muted-foreground">on</span>
							<Select
								disabled={disabled}
								value={choice}
								onValueChange={(next) => {
									if (next === "custom") setMoreOpen(true);
									onChange(
										applyMonthlyChoice(
											value,
											next as ReturnType<typeof monthlyChoice>,
											anchorDateKey,
										),
									);
								}}
							>
								<SelectTrigger
									className="w-auto min-w-40"
									aria-label="Day of month"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{monthlyChoiceOptions(anchorDateKey, value.frequency).map(
										(option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										),
									)}
								</SelectContent>
							</Select>
						</>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="text-muted-foreground">Ends</span>
					<Select
						disabled={disabled}
						value={value.endKind}
						onValueChange={(endKind) =>
							update({ endKind: endKind as RecurrenceFormValue["endKind"] })
						}
					>
						<SelectTrigger
							className="w-auto min-w-40"
							aria-label="Schedule end"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="never">Never</SelectItem>
							<SelectItem value="until">On a date</SelectItem>
							<SelectItem value="count">After a number of visits</SelectItem>
						</SelectContent>
					</Select>

					{value.endKind === "until" && (
						<>
							<Label htmlFor={`${fieldId}-until`} className="sr-only">
								End date
							</Label>
							<DatePicker
								id={`${fieldId}-until`}
								className="w-auto"
								disabled={disabled}
								value={dateFromKey(value.until)}
								onChange={(date) =>
									update({ until: date ? dateKey(date) : "" })
								}
							/>
						</>
					)}
					{value.endKind === "count" && (
						<>
							<Input
								aria-label="Number of visits"
								className="w-20"
								type="number"
								min={1}
								max={10000}
								value={value.count}
								onChange={(event) =>
									update({ count: Number(event.target.value) })
								}
							/>
							<span className="text-muted-foreground">visits</span>
						</>
					)}
				</div>
			</div>

			{duration && (
				<div className="space-y-2">
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<Label htmlFor={`${fieldId}-duration`}>Each visit lasts</Label>
						<Input
							id={`${fieldId}-duration`}
							className="w-20"
							type="number"
							min={1}
							max={MAX_DURATION_DAYS}
							value={duration.value}
							onChange={(event) =>
								duration.onChange(Number(event.target.value))
							}
						/>
						<span className="text-muted-foreground">days</span>
					</div>
					{duration.error && (
						<FieldError className="text-danger">{duration.error}</FieldError>
					)}
				</div>
			)}

			<Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
				<CollapsibleTrigger
					render={
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="-ml-2 gap-1.5 text-muted-foreground"
						/>
					}
				>
					<ChevronRight
						className={cn("transition-transform", moreOpen && "rotate-90")}
					/>
					More options
				</CollapsibleTrigger>
				<CollapsibleContent className="mt-3 grid gap-4 rounded-md bg-muted/40 p-4">
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<Label htmlFor={`${fieldId}-interval`}>Repeat every</Label>
						<Input
							id={`${fieldId}-interval`}
							className="w-20"
							type="number"
							min={1}
							max={1000}
							value={value.interval}
							onChange={(event) =>
								update({
									preset: "custom",
									interval: Number(event.target.value),
								})
							}
						/>
						<Select
							disabled={disabled}
							value={value.frequency}
							onValueChange={(frequency) =>
								update({
									preset: "custom",
									frequency: frequency as RecurrenceRule["frequency"],
								})
							}
						>
							<SelectTrigger className="w-auto min-w-32" aria-label="Unit">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{INTERVAL_UNITS.map(([frequency, label]) => (
									<SelectItem key={frequency} value={frequency}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{usesMonthlyPattern && (
						<fieldset className="space-y-3">
							<legend className="text-sm font-semibold">Day pattern</legend>
							<div className="flex gap-2">
								<Button
									type="button"
									variant={
										value.monthlyMode === "monthDays" ? "default" : "outline"
									}
									aria-pressed={value.monthlyMode === "monthDays"}
									onClick={() => update({ monthlyMode: "monthDays" })}
								>
									Dates
								</Button>
								<Button
									type="button"
									variant={
										value.monthlyMode === "ordinal" ? "default" : "outline"
									}
									aria-pressed={value.monthlyMode === "ordinal"}
									onClick={() => update({ monthlyMode: "ordinal" })}
								>
									Weekday
								</Button>
							</div>
							{value.monthlyMode === "monthDays" ? (
								<div className="grid grid-cols-7 gap-1">
									{Array.from({ length: 31 }, (_, index) => index + 1).map(
										(day) => (
											<Button
												key={day}
												type="button"
												size="icon-sm"
												variant={
													value.monthDays.includes(day) ? "default" : "outline"
												}
												aria-label={`Day ${day}`}
												aria-pressed={value.monthDays.includes(day)}
												onClick={() =>
													update({ monthDays: toggle(value.monthDays, day) })
												}
											>
												{day}
											</Button>
										),
									)}
								</div>
							) : (
								<div className="grid gap-3 sm:grid-cols-2">
									<Select
										disabled={disabled}
										value={String(value.ordinal)}
										onValueChange={(next) => update({ ordinal: Number(next) })}
									>
										<SelectTrigger
											className="w-full"
											aria-label="Week of month"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{ORDINALS.map(([number, label]) => (
												<SelectItem key={number} value={String(number)}>
													{label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Select
										disabled={disabled}
										value={String(value.ordinalWeekday)}
										onValueChange={(next) =>
											update({ ordinalWeekday: Number(next) })
										}
									>
										<SelectTrigger className="w-full" aria-label="Day of week">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{WEEKDAYS.map((label, day) => (
												<SelectItem key={label} value={String(day)}>
													{label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
						</fieldset>
					)}

					<fieldset className="space-y-3">
						<legend className="text-sm font-semibold">Seasonal months</legend>
						<p className="text-sm text-muted-foreground">
							Leave every month clear to schedule year-round.
						</p>
						<div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
							{MONTHS.map((label, index) => (
								<Label
									key={label}
									className="min-h-9 gap-2 rounded-md border px-2"
								>
									<Checkbox
										checked={value.months.includes(index + 1)}
										onCheckedChange={() =>
											update({ months: toggle(value.months, index + 1) })
										}
									/>
									{label}
								</Label>
							))}
						</div>
					</fieldset>
				</CollapsibleContent>
			</Collapsible>

			{!error && (
				<p className="text-sm text-foreground">
					{describeRecurrence(serializeRecurrenceRule(value), {
						durationCount,
					})}
				</p>
			)}

			<section aria-labelledby={`${fieldId}-preview`} className="border-t pt-5">
				<h3 id={`${fieldId}-preview`} className="text-sm font-semibold">
					Upcoming visits
				</h3>
				<p className="mt-1 text-sm text-muted-foreground">
					The first visit is the project itself. Later visits are created in a
					rolling window.
				</p>
				{affectedPreview && (
					<p className="mt-2 text-sm text-muted-foreground tabular-nums">
						Planned visits affected: {affectedPreview.count}. Visits preserved:{" "}
						{affectedPreview.preserved}.
					</p>
				)}
				{error ? (
					<p role="alert" className="mt-3 text-sm text-danger">
						{error}
					</p>
				) : preview === undefined ? (
					<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
						{Array.from({ length: 4 }, (_, index) => (
							<Skeleton key={index} className="h-9" />
						))}
					</div>
				) : preview.length === 0 ? (
					<p className="mt-3 text-sm text-muted-foreground">
						No future visits match this schedule.
					</p>
				) : (
					<ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
						{preview.slice(0, 8).map((date) => (
							<li
								key={date}
								className="rounded-md bg-muted px-3 py-2 text-sm tabular-nums"
							>
								{formatVisitRange(date, durationCount)}
							</li>
						))}
					</ol>
				)}
			</section>
		</fieldset>
	);
}
