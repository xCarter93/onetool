"use client";

import React from "react";
import {
	utcMidnightMsToLocalDate,
	localDateToUtcMidnightMs,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export type TypedFieldType =
	| "text"
	| "number"
	| "boolean"
	| "date"
	| "datetime"
	| "select"
	| "currency"
	| "id";

/** The subset of a field definition needed to pick a control. */
export type TypedFieldSpec = {
	type: TypedFieldType;
	options?: { value: string; label: string }[];
	/** For an `id` field, the entity a record picker should search. */
	refType?: string;
};

/** A resolved primitive. `null` means "cleared / no value". */
export type PrimitiveValue = string | number | boolean | null;

/** Props the id branch hands to `renderRecordPicker`. */
export type RecordPickerSlotProps = {
	value: string | null;
	onChange: (id: string | null) => void;
	placeholder?: string;
	invalid?: boolean;
};

/**
 * Type-matched primitive control: a boolean is always a Select, a date always
 * the DatePicker, an id always a record picker — never a raw text box.
 *
 * `onChange` receives the typed primitive, or `null` when cleared. When
 * `emptyLabel` is set, boolean/select gain an explicit "clear" option (for an
 * optional value); without it the control always holds a concrete value.
 * The caller supplies `renderRecordPicker` for id fields — the picker's data
 * source (which records, how they're labeled) is domain knowledge.
 */
export function TypedPrimitiveControl({
	field,
	value,
	onChange,
	placeholder,
	emptyLabel,
	invalid,
	renderRecordPicker,
}: {
	field: TypedFieldSpec;
	value: PrimitiveValue;
	onChange: (value: PrimitiveValue) => void;
	placeholder?: string;
	emptyLabel?: string;
	invalid?: boolean;
	renderRecordPicker?: (props: RecordPickerSlotProps) => React.ReactNode;
}) {
	const NONE = "__none__";

	if (field.type === "boolean") {
		const current = value === true ? "true" : value === false ? "false" : NONE;
		return (
			<Select
				value={current}
				onValueChange={(v) =>
					onChange(v === NONE ? null : v === "true")
				}
			>
				<SelectTrigger aria-invalid={invalid || undefined}>
					<SelectValue placeholder={emptyLabel ?? placeholder} />
				</SelectTrigger>
				<SelectContent>
					{emptyLabel && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
					<SelectItem value="true">True</SelectItem>
					<SelectItem value="false">False</SelectItem>
				</SelectContent>
			</Select>
		);
	}

	if (field.type === "select" && field.options) {
		const current = typeof value === "string" && value !== "" ? value : NONE;
		return (
			<Select
				value={current}
				onValueChange={(v) => onChange(v === NONE ? null : v)}
			>
				<SelectTrigger aria-invalid={invalid || undefined}>
					<SelectValue placeholder={placeholder ?? "Select value"} />
				</SelectTrigger>
				<SelectContent>
					{emptyLabel && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
					{field.options.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		);
	}

	if (field.type === "number" || field.type === "currency") {
		return (
			<Input
				type="number"
				aria-invalid={invalid || undefined}
				value={
					typeof value === "number" && !Number.isNaN(value) ? value : ""
				}
				onChange={(e) =>
					onChange(
						e.target.value === "" || Number.isNaN(Number(e.target.value))
							? null
							: Number(e.target.value)
					)
				}
				placeholder={placeholder}
			/>
		);
	}

	if (field.type === "date") {
		return (
			<DatePicker
				value={
					typeof value === "number"
						? utcMidnightMsToLocalDate(value)
						: undefined
				}
				onChange={(d) => onChange(d ? localDateToUtcMidnightMs(d) : null)}
				className={cn("w-full", invalid && "border-destructive")}
				placeholder={placeholder}
			/>
		);
	}

	if (field.type === "datetime") {
		// Datetime stores an exact epoch-ms instant, composed/decomposed in the
		// browser's local zone (plain Date getters — the UTC helpers above are
		// for calendar dates only).
		const current =
			typeof value === "number" && !Number.isNaN(value)
				? new Date(value)
				: null;
		const timeText = current
			? `${String(current.getHours()).padStart(2, "0")}:${String(
					current.getMinutes()
				).padStart(2, "0")}`
			: "";
		const compose = (day: Date, hours: number, minutes: number) =>
			new Date(
				day.getFullYear(),
				day.getMonth(),
				day.getDate(),
				hours,
				minutes
			).getTime();
		return (
			<div className="flex items-center gap-1.5">
				<DatePicker
					value={current ?? undefined}
					onChange={(d) =>
						onChange(
							d
								? compose(d, current?.getHours() ?? 0, current?.getMinutes() ?? 0)
								: null
						)
					}
					className={cn("flex-1 min-w-0", invalid && "border-destructive")}
					placeholder={placeholder}
				/>
				<Input
					type="time"
					aria-label="Time"
					aria-invalid={invalid || undefined}
					value={timeText}
					onChange={(e) => {
						// "".split(":") yields [""] -> m === undefined, which
						// Number.isNaN misses and compose() would turn into NaN.
						if (!e.target.value) return;
						const [h, m] = e.target.value.split(":").map(Number);
						if (Number.isNaN(h) || Number.isNaN(m)) return;
						onChange(compose(current ?? new Date(), h, m));
					}}
					className="w-28 shrink-0"
				/>
			</div>
		);
	}

	if (field.type === "id" && field.refType && renderRecordPicker) {
		return (
			<>
				{renderRecordPicker({
					value: typeof value === "string" && value !== "" ? value : null,
					onChange: (id) => onChange(id),
					placeholder,
					invalid,
				})}
			</>
		);
	}

	return (
		<Input
			type="text"
			aria-invalid={invalid || undefined}
			value={typeof value === "string" ? value : String(value ?? "")}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder ?? "Value"}
		/>
	);
}
