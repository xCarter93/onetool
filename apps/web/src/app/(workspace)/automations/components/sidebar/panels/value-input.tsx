"use client";

import React, { useMemo, useState } from "react";
import { Braces, Check, ChevronsUpDown, X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	utcMidnightMsToLocalDate,
	localDateToUtcMidnightMs,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/domain/empty-state";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	getAvailableVariables,
	partitionVariableGroups,
	type VariableOption,
} from "../../../lib/variables";
import {
	VariableDrillList,
	type DrillGroup,
	type DrillItem,
	type DrillPage,
} from "./variable-drill-list";
import { PickerChip } from "./picker-chip";
import type {
	AutomationTrigger,
	FieldDefinition,
	FieldType,
	FormulaResource,
	TriggerConfig,
	ValueRef,
	WorkflowNode,
} from "../../../lib/node-types";

/** Shared variable lookup for the popover used by ValueInput and VariableInsertButton. */
function useAvailableVariables(
	nodes: WorkflowNode[],
	trigger: TriggerConfig | AutomationTrigger | null,
	targetNodeId: string,
	formulas?: FormulaResource[]
): VariableOption[] {
	return useMemo(
		() => (trigger ? getAvailableVariables(nodes, trigger, targetNodeId, formulas) : []),
		[nodes, trigger, targetNodeId, formulas]
	);
}

/**
 * Builds the drill-down model (root groups + relation pages) from variable
 * options. `decorate` adds per-row styling/hints; `sortWithin` orders a group's
 * rows (used to float compatible-type options first).
 */
function buildVariableDrill(
	variables: VariableOption[],
	onPick: (option: VariableOption) => void,
	decorate?: (
		option: VariableOption
	) => { className?: string; trailing?: React.ReactNode },
	sortWithin?: (options: VariableOption[]) => VariableOption[]
): { rootGroups: DrillGroup[]; pages: DrillPage[] } {
	const { rootGroups, relationPages } = partitionVariableGroups(variables);
	const toItem = (option: VariableOption): DrillItem => {
		const decoration = decorate?.(option);
		return {
			id: option.path,
			value: `${option.group} ${option.label}`,
			label: option.label,
			className: decoration?.className,
			trailing: decoration?.trailing,
			onSelect: () => onPick(option),
		};
	};
	const order = (options: VariableOption[]) =>
		(sortWithin ? sortWithin(options) : options).map(toItem);
	return {
		rootGroups: rootGroups.map(([group, options]) => ({
			id: group,
			heading: group,
			items: order(options),
		})),
		pages: relationPages.map((page) => ({
			id: page.id,
			navLabel: page.navLabel,
			items: order(page.options),
		})),
	};
}

/** The subset of FieldDefinition ValueInput needs to pick a static control. */
export type ValueInputFieldSpec = {
	type: FieldType;
	options?: { value: string; label: string }[];
	/** For an `id` field, the entity a record picker should search. */
	refType?: FieldDefinition["refType"];
};

/** A resolved static/fallback primitive. `null` means "cleared / no value". */
type PrimitiveValue = string | number | boolean | null;

/** A stored fallback that doesn't match the field's type (legacy / hand-authored). */
function fallbackTypeError(
	type: FieldType,
	fallback: string | number | boolean | undefined
): string | null {
	if (fallback === undefined) return null;
	switch (type) {
		case "boolean":
			return typeof fallback === "boolean" ? null : "Fallback must be true or false.";
		case "number":
		case "currency":
			return typeof fallback === "number" ? null : "Fallback must be a number.";
		case "date":
			return typeof fallback === "number" ? null : "Fallback must be a date.";
		case "datetime":
			return typeof fallback === "number"
				? null
				: "Fallback must be a date and time.";
		case "text":
		case "select":
		case "id":
			return typeof fallback === "string" ? null : "Fallback must be text.";
		default:
			return null; // unknown field type — nothing to check
	}
}

/**
 * A variable of `optionType` (and, for id fields, `optionRefType`) feeding a
 * `target` field (with destination `targetRefType`): does the picker flag it
 * as needing conversion? Soft hint only — incompatible options stay selectable
 * (formulas/interpolation can convert), just sorted last and greyed. Unknown
 * option types are never flagged.
 */
function variableNeedsConversion(
	target: FieldType,
	optionType?: FieldType,
	targetRefType?: FieldDefinition["refType"],
	optionRefType?: FieldDefinition["refType"]
): boolean {
	if (!optionType) return false;
	switch (target) {
		case "boolean":
			return optionType !== "boolean";
		case "number":
		case "currency":
			return optionType !== "number" && optionType !== "currency";
		// A datetime feeding a date field is normalized to the day by the engine,
		// so date and datetime are interchangeable in both directions.
		case "date":
		case "datetime":
			return optionType !== "date" && optionType !== "datetime";
		case "id":
			return (
				optionType !== "id" ||
				(!!targetRefType && !!optionRefType && targetRefType !== optionRefType)
			);
		case "select":
			return optionType !== "select" && optionType !== "text";
		default:
			return false; // text accepts anything
	}
}

const REF_PLACEHOLDER: Record<NonNullable<FieldDefinition["refType"]>, string> = {
	client: "Select a client",
	project: "Select a project",
	user: "Select a member",
	invoice: "Select an invoice",
	quote: "Select a quote",
};

/**
 * Searchable record picker for an `id` field (client/project/user/quote),
 * replacing the raw-Convex-id text box. Stores the selected `_id` string and
 * resolves the display name for whatever id is already stored.
 */
function IdValueControl({
	refType,
	value,
	onChange,
	placeholder,
	invalid,
}: {
	refType: NonNullable<FieldDefinition["refType"]>;
	value: string | null;
	onChange: (id: string | null) => void;
	placeholder?: string;
	invalid?: boolean;
}) {
	const [open, setOpen] = useState(false);

	const clients = useQuery(api.clients.list, refType === "client" ? {} : "skip");
	const projects = useQuery(api.projects.list, refType === "project" ? {} : "skip");
	const users = useQuery(api.users.listByOrg, refType === "user" ? {} : "skip");
	const quotes = useQuery(api.quotes.list, refType === "quote" ? {} : "skip");
	const invoices = useQuery(
		api.invoices.list,
		refType === "invoice" ? {} : "skip"
	);

	const options = useMemo<{ id: string; label: string }[]>(() => {
		switch (refType) {
			case "client":
				return (clients ?? []).map((c) => ({ id: c._id, label: c.companyName }));
			case "project":
				return (projects ?? []).map((p) => ({ id: p._id, label: p.title }));
			case "user":
				return (users ?? []).map((u) => ({
					id: u._id,
					label: u.name || u.email,
				}));
			case "quote":
				return (quotes ?? []).map((q) => ({
					id: q._id,
					label: q.title || `Quote #${q.quoteNumber}`,
				}));
			case "invoice":
				return (invoices ?? []).map((i) => ({
					id: i._id,
					label: `Invoice #${i.invoiceNumber}`,
				}));
			default:
				return [];
		}
	}, [refType, clients, projects, users, quotes, invoices]);

	const loading =
		(refType === "client" && clients === undefined) ||
		(refType === "project" && projects === undefined) ||
		(refType === "user" && users === undefined) ||
		(refType === "quote" && quotes === undefined) ||
		(refType === "invoice" && invoices === undefined);

	const selected = value ? options.find((o) => o.id === value) : undefined;
	const triggerLabel = selected
		? selected.label
		: value
			? loading
				? "Loading…"
				: "Unknown record"
			: (placeholder ?? REF_PLACEHOLDER[refType]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						aria-invalid={invalid || undefined}
						className={cn(
							"w-full justify-between font-normal",
							!selected && "text-muted-foreground",
							invalid && "border-destructive"
						)}
					/>
				}
			>
				<span className="truncate">{triggerLabel}</span>
				<ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-(--anchor-width) min-w-56 p-0">
				<Command>
					<CommandInput placeholder={`Search ${refType}s...`} />
					<CommandList>
						<CommandEmpty>
							{loading ? (
								"Loading…"
							) : (
								<EmptyState
									size="sm"
									illustration="no-filter-match"
									title="No records found"
								/>
							)}
						</CommandEmpty>
						<CommandGroup>
							{value && (
								<CommandItem
									value="__clear__"
									onSelect={() => {
										onChange(null);
										setOpen(false);
									}}
									className="cursor-pointer text-muted-foreground"
								>
									Clear selection
								</CommandItem>
							)}
							{options.map((opt) => (
								<CommandItem
									key={opt.id}
									value={`${opt.label} ${opt.id}`}
									onSelect={() => {
										onChange(opt.id);
										setOpen(false);
									}}
									className="cursor-pointer"
								>
									<Check
										className={cn(
											"h-4 w-4",
											opt.id === value ? "opacity-100" : "opacity-0"
										)}
									/>
									<span className="truncate">{opt.label}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

/**
 * Type-matched primitive control, shared by the static-value branch and the
 * variable-fallback branch so a boolean is always a Select, a date always the
 * DatePicker, an id always a record picker — never a raw text box.
 *
 * `onChange` receives the typed primitive, or `null` when cleared. When
 * `emptyLabel` is set, boolean/select gain an explicit "clear" option (used by
 * the optional fallback); without it the control always holds a concrete value
 * (used by the required static value).
 */
function TypedPrimitiveControl({
	field,
	value,
	onChange,
	placeholder,
	emptyLabel,
	invalid,
}: {
	field: ValueInputFieldSpec;
	value: PrimitiveValue;
	onChange: (value: PrimitiveValue) => void;
	placeholder?: string;
	emptyLabel?: string;
	invalid?: boolean;
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

	if (field.type === "id" && field.refType) {
		return (
			<IdValueControl
				refType={field.refType}
				value={typeof value === "string" && value !== "" ? value : null}
				onChange={(id) => onChange(id)}
				placeholder={placeholder}
				invalid={invalid}
			/>
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

function StaticControl({
	field,
	value,
	onChange,
	placeholder,
	invalid,
}: {
	field: ValueInputFieldSpec;
	value: ValueRef | undefined;
	onChange: (value: ValueRef) => void;
	placeholder?: string;
	invalid?: boolean;
}) {
	const staticValue = value?.kind === "static" ? value.value : null;
	return (
		<TypedPrimitiveControl
			field={field}
			value={staticValue}
			onChange={(v) => onChange({ kind: "static", value: v })}
			placeholder={placeholder}
			invalid={invalid}
		/>
	);
}

export interface ValueInputProps {
	field: ValueInputFieldSpec;
	value: ValueRef | undefined;
	onChange: (value: ValueRef) => void;
	/** Workflow graph + trigger the variable picker resolves paths against. */
	nodes: WorkflowNode[];
	trigger: TriggerConfig | AutomationTrigger | null;
	targetNodeId: string;
	formulas?: FormulaResource[];
	placeholder?: string;
	className?: string;
	/** Inline error shown beneath the control (per-rule save feedback). */
	error?: string;
	/**
	 * How an array variable feeding this single-valued field resolves — action
	 * writes coerce to the first element ("first"); condition/filter compares
	 * match on membership ("any"); operators with neither behavior ("none")
	 * show no hint. Drives the picker hint only.
	 */
	arrayResolution?: "first" | "any" | "none";
}

/**
 * Static value control (per FieldDefinition.type) with a trailing "Use a
 * variable" button. Selecting a variable switches the ValueRef to
 * {kind:"var", path}, rendered as a dismissible chip with a type-matched,
 * optional fallback input.
 */
export function ValueInput({
	field,
	value,
	onChange,
	nodes,
	trigger,
	targetNodeId,
	formulas,
	placeholder,
	className,
	error,
	arrayResolution = "first",
}: ValueInputProps) {
	const [open, setOpen] = useState(false);
	const variables = useAvailableVariables(nodes, trigger, targetNodeId, formulas);

	if (value?.kind === "var") {
		const selected = variables.find((v) => v.path === value.path);
		const fallbackError = fallbackTypeError(field.type, value.fallback);

		return (
			<div className={cn("space-y-2", className)}>
				<div className="flex min-h-9 items-center justify-between gap-1.5 rounded-md border border-input px-2 py-1 text-sm">
					<PickerChip icon={Braces} label={selected?.label ?? value.path} />
					<button
						type="button"
						aria-label="Remove variable"
						onClick={() =>
							onChange({ kind: "static", value: field.type === "boolean" ? false : null })
						}
						className="text-muted-foreground hover:text-destructive focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none rounded-sm cursor-pointer shrink-0"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
				<TypedPrimitiveControl
					field={field}
					value={value.fallback ?? null}
					onChange={(v) =>
						onChange({
							...value,
							fallback: v === null || v === "" ? undefined : v,
						})
					}
					placeholder="Fallback value (optional)"
					emptyLabel="No fallback"
					invalid={!!fallbackError}
				/>
				{fallbackError && (
					<p className="text-xs text-destructive">{fallbackError}</p>
				)}
				{error && <p className="text-xs text-destructive">{error}</p>}
			</div>
		);
	}

	return (
		<div className={cn("space-y-1.5", className)}>
			<div className="flex items-start gap-1.5">
				<div className="flex-1 min-w-0">
					<StaticControl
						field={field}
						value={value}
						onChange={onChange}
						placeholder={placeholder}
						invalid={!!error}
					/>
				</div>
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger
						render={
							<Button
								variant="outline"
								size="icon"
								aria-label="Use a variable"
								className="shrink-0"
							/>
						}
					>
						<Braces className="h-4 w-4" />
					</PopoverTrigger>
					<PopoverContent align="end" className="w-80 p-0">
						{(() => {
							const { rootGroups, pages } = buildVariableDrill(
								variables,
								(option) => {
									onChange({ kind: "var", path: option.path });
									setOpen(false);
								},
								(option) => {
									const needsConversion = variableNeedsConversion(
										field.type,
										option.fieldType,
										field.refType,
										option.refType
									);
									// An array feeding this single-valued field resolves per
									// arrayResolution — say so rather than let the author assume
									// all of them land.
									const arrayHint =
										option.isArray &&
										!needsConversion &&
										arrayResolution !== "none"
											? arrayResolution === "first"
												? "uses first"
												: "matches any"
											: null;
									return {
										// Incompatible-type options stay selectable but render greyed.
										className: needsConversion
											? "text-muted-foreground"
											: undefined,
										trailing:
											needsConversion || arrayHint ? (
												<span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
													{needsConversion ? "needs conversion" : arrayHint}
												</span>
											) : undefined,
									};
								},
								// Compatible-type options first within each group/page.
								(options) =>
									[...options].sort(
										(a, b) =>
											Number(
												variableNeedsConversion(
													field.type,
													a.fieldType,
													field.refType,
													a.refType
												)
											) -
											Number(
												variableNeedsConversion(
													field.type,
													b.fieldType,
													field.refType,
													b.refType
												)
											)
									)
							);
							return (
								<VariableDrillList
									rootGroups={rootGroups}
									pages={pages}
									open={open}
									emptyText="No variables available yet."
									placeholder="Search variables..."
								/>
							);
						})()}
					</PopoverContent>
				</Popover>
			</div>
			{error && <p className="text-xs text-destructive">{error}</p>}
		</div>
	);
}

/**
 * Small "Insert variable" trigger for raw-string fields (send_notification /
 * send_team_message messages) that support {{path}} interpolation instead of
 * a ValueRef. Calls onInsert with the bare path — the caller wraps it in
 * {{ }} and splices it into the text at the cursor.
 */
export function VariableInsertButton({
	nodes,
	trigger,
	targetNodeId,
	formulas,
	onInsert,
	className,
}: {
	nodes: WorkflowNode[];
	trigger: TriggerConfig | AutomationTrigger | null;
	targetNodeId: string;
	formulas?: FormulaResource[];
	onInsert: (path: string) => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const variables = useAvailableVariables(nodes, trigger, targetNodeId, formulas);
	const { rootGroups, pages } = buildVariableDrill(variables, (option) => {
		onInsert(option.path);
		setOpen(false);
	});

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						size="xs"
						aria-label="Insert a variable"
						className={cn("text-muted-foreground", className)}
					/>
				}
			>
				<Braces className="h-3.5 w-3.5" />
				Insert variable
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 p-0">
				<VariableDrillList
					rootGroups={rootGroups}
					pages={pages}
					open={open}
					emptyText="No variables available yet."
					placeholder="Search variables..."
				/>
			</PopoverContent>
		</Popover>
	);
}
