"use client";

import React, { useMemo, useState } from "react";
import { Braces, X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	getAvailableVariables,
	partitionVariableGroups,
	type VariableOption,
} from "../../../lib/variables";
import {
	DrillList,
	type DrillGroup,
	type DrillItem,
	type DrillPage,
} from "@/components/shared/drill-list";
import { PickerChip } from "@/components/shared/picker-chip";
import {
	RecordPicker,
	type RecordPickerOption,
} from "@/components/shared/record-picker";
import {
	TypedPrimitiveControl,
	type PrimitiveValue,
} from "@/components/shared/typed-primitive-control";
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
 * The shared RecordPicker fed by automations' per-refType queries. Stores the
 * selected `_id` string and resolves the display name for whatever id is
 * already stored.
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
	const clients = useQuery(api.clients.list, refType === "client" ? {} : "skip");
	const projects = useQuery(api.projects.list, refType === "project" ? {} : "skip");
	const users = useQuery(api.users.listByOrg, refType === "user" ? {} : "skip");
	const quotes = useQuery(api.quotes.list, refType === "quote" ? {} : "skip");
	const invoices = useQuery(
		api.invoices.list,
		refType === "invoice" ? {} : "skip"
	);

	const options = useMemo<RecordPickerOption[]>(() => {
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

	return (
		<RecordPicker
			options={options}
			loading={loading}
			value={value}
			onChange={onChange}
			placeholder={placeholder ?? REF_PLACEHOLDER[refType]}
			searchPlaceholder={`Search ${refType}s...`}
			invalid={invalid}
		/>
	);
}

/**
 * The shared TypedPrimitiveControl with automations' record picker injected
 * for id fields, so every usage site (static value, variable fallback) gets
 * the same id handling.
 */
function AutomationPrimitiveControl({
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
	return (
		<TypedPrimitiveControl
			field={field}
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			emptyLabel={emptyLabel}
			invalid={invalid}
			renderRecordPicker={(slot) =>
				field.refType ? (
					<IdValueControl
						refType={field.refType}
						value={slot.value}
						onChange={slot.onChange}
						placeholder={slot.placeholder}
						invalid={slot.invalid}
					/>
				) : null
			}
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
		<AutomationPrimitiveControl
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
				<AutomationPrimitiveControl
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
								<DrillList
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
				<DrillList
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
