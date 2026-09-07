"use client";

import { useId, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { validateRecurrenceRule } from "@onetool/backend/convex/lib/projectRecurrence";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
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
import { cn } from "@/lib/utils";
import {
	DEFAULT_RECURRENCE_FORM,
	applyPreset,
	serializeRecurrenceRule,
	validateRecurrenceForm,
	recurrenceRuleToForm,
	type RecurrenceFormValue,
	type RecurrenceRule,
} from "./rule";

const PRESETS = [
	["daily", "Daily"],
	["weekly", "Weekly"],
	["biweekly", "Every 2 weeks"],
	["monthly", "Monthly"],
	["yearly", "Yearly"],
	["custom", "Custom"],
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
	onSubmit,
	isSubmitting,
	submitLabel = "Set up recurrence",
}: {
	projectId?: Id<"projects">;
	seriesId?: Id<"projectSeries">;
	startDate: number;
	initialRule?: RecurrenceRule;
	onSubmit: (rule: RecurrenceRule, expectedVersion?: number) => Promise<void>;
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
	const rule = useMemo(() => serializeRecurrenceRule(value), [value]);
	const anchorDateKey = new Date(startDate).toISOString().slice(0, 10);
	const error =
		validateRecurrenceForm(value) ??
		validateRecurrenceRule(rule, anchorDateKey);
	const setupPreview = useQuery(
		api.projectSeries.preview,
		error || !projectId ? "skip" : { projectId, rule, limit: 8 }
	);
	const changePreview = useQuery(
		api.projectSeries.previewScheduleChange,
		error || !seriesId ? "skip" : { seriesId, rule }
	);
	const preview = seriesId ? changePreview?.dates : setupPreview;

	return (
		<form
			className="space-y-6"
			onSubmit={async (event) => {
				event.preventDefault();
				if (!error) await onSubmit(rule, changePreview?.revision);
			}}
		>
			<RecurrenceScheduleFields
				value={value}
				onChange={setValue}
				error={error}
				preview={preview}
				affectedPreview={changePreview}
				disabled={isSubmitting}
			/>
			<div className="flex justify-end border-t pt-4">
				<Button
					type="submit"
					disabled={!!error || preview === undefined || isSubmitting}
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
	error,
	preview,
	affectedPreview,
	disabled = false,
}: {
	value: RecurrenceFormValue;
	onChange: (value: RecurrenceFormValue) => void;
	error?: string | null;
	preview?: string[];
	affectedPreview?: { count: number; preserved: number };
	disabled?: boolean;
}) {
	const fieldId = useId();
	const update = (patch: Partial<RecurrenceFormValue>) =>
		onChange({ ...value, ...patch });
	const usesMonthlyPattern =
		value.frequency === "monthly" || value.frequency === "yearly";

	return (
		<fieldset className="space-y-6" disabled={disabled}>
			<fieldset className="space-y-3">
				<legend className="text-sm font-semibold">Schedule</legend>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{PRESETS.map(([preset, label]) => (
						<Button
							key={preset}
							type="button"
							variant={value.preset === preset ? "default" : "outline"}
							aria-pressed={value.preset === preset}
							onClick={() => onChange(applyPreset(value, preset))}
						>
							{label}
						</Button>
					))}
				</div>
			</fieldset>

			{value.preset === "custom" && (
				<div className="grid gap-4 rounded-md bg-muted/40 p-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor={`${fieldId}-interval`}>Repeat every</Label>
						<Input
							id={`${fieldId}-interval`}
							type="number"
							min={1}
							max={1000}
							value={value.interval}
							onChange={(event) =>
								update({ interval: Number(event.target.value) })
							}
						/>
					</div>
					<div className="space-y-2">
						<Label>Frequency</Label>
						<Select
							disabled={disabled}
							value={value.frequency}
							onValueChange={(frequency) =>
								update({ frequency: frequency as RecurrenceRule["frequency"] })
							}
						>
							<SelectTrigger className="w-full" aria-label="Frequency">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="daily">Days</SelectItem>
								<SelectItem value="weekly">Weeks</SelectItem>
								<SelectItem value="monthly">Months</SelectItem>
								<SelectItem value="yearly">Years</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			)}

			{value.frequency === "weekly" && (
				<fieldset className="space-y-3">
					<legend className="text-sm font-semibold">Visit days</legend>
					<div className="flex flex-wrap gap-3">
						{WEEKDAYS.map((label, weekday) => (
							<Label
								key={label}
								className="min-h-11 gap-2 rounded-md border px-3"
							>
								<Checkbox
									checked={value.weekdays.includes(weekday)}
									onCheckedChange={() =>
										update({ weekdays: toggle(value.weekdays, weekday) })
									}
								/>
								{label}
							</Label>
						))}
					</div>
				</fieldset>
			)}

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
							variant={value.monthlyMode === "ordinal" ? "default" : "outline"}
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
								)
							)}
						</div>
					) : (
						<div className="grid gap-3 sm:grid-cols-2">
							<Select
								disabled={disabled}
								value={String(value.ordinal)}
								onValueChange={(next) => update({ ordinal: Number(next) })}
							>
								<SelectTrigger className="w-full" aria-label="Week of month">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{[
										[1, "First"],
										[2, "Second"],
										[3, "Third"],
										[4, "Fourth"],
										[5, "Fifth"],
										[-1, "Last"],
									].map(([number, label]) => (
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

			{value.preset === "custom" && (
				<fieldset className="space-y-3">
					<legend className="text-sm font-semibold">Seasonal months</legend>
					<p className="text-sm text-muted-foreground">
						Leave every month clear to schedule year-round.
					</p>
					<div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
						{MONTHS.map((label, index) => (
							<Label
								key={label}
								className="min-h-11 gap-2 rounded-md border px-2"
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
			)}

			<fieldset className="space-y-3">
				<legend className="text-sm font-semibold">Ends</legend>
				<Select
					disabled={disabled}
					value={value.endKind}
					onValueChange={(endKind) =>
						update({ endKind: endKind as RecurrenceFormValue["endKind"] })
					}
				>
					<SelectTrigger className="w-full" aria-label="Schedule end">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="never">Never</SelectItem>
						<SelectItem value="until">On a date</SelectItem>
						<SelectItem value="count">After a number of visits</SelectItem>
					</SelectContent>
				</Select>
				{value.endKind === "until" && (
					<div className="space-y-2">
						<Label htmlFor={`${fieldId}-until`}>Until</Label>
						<DatePicker
							id={`${fieldId}-until`}
							disabled={disabled}
							value={dateFromKey(value.until)}
							onChange={(date) => update({ until: date ? dateKey(date) : "" })}
						/>
					</div>
				)}
				{value.endKind === "count" && (
					<Input
						aria-label="Number of occurrences"
						type="number"
						min={1}
						max={10000}
						value={value.count}
						onChange={(event) => update({ count: Number(event.target.value) })}
					/>
				)}
			</fieldset>

			<section aria-labelledby={`${fieldId}-preview`} className="border-t pt-5">
				<h3 id={`${fieldId}-preview`} className="text-sm font-semibold">
					Upcoming visits
				</h3>
				<p className="mt-1 text-sm text-muted-foreground">
					The current project counts as the first occurrence. New visits are
					created in a rolling window.
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
								{new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
									month: "short",
									day: "numeric",
									year: "numeric",
									timeZone: "UTC",
								})}
							</li>
						))}
					</ol>
				)}
			</section>
		</fieldset>
	);
}
