"use client";

import React, { useMemo, useState } from "react";
import { Braces, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { getAvailableVariables, type VariableOption } from "../../../lib/variables";
import type {
	AutomationTrigger,
	FieldType,
	FormulaResource,
	TriggerConfig,
	ValueRef,
	WorkflowNode,
} from "../../../lib/node-types";

/** Shared variable lookup + grouping for the popover used by ValueInput and VariableInsertButton. */
function useGroupedVariables(
	nodes: WorkflowNode[],
	trigger: TriggerConfig | AutomationTrigger | null,
	targetNodeId: string,
	formulas?: FormulaResource[]
): { variables: VariableOption[]; groups: [string, VariableOption[]][] } {
	const variables = useMemo(
		() => (trigger ? getAvailableVariables(nodes, trigger, targetNodeId, formulas) : []),
		[nodes, trigger, targetNodeId, formulas]
	);

	const groups = useMemo(() => {
		const map = new Map<string, VariableOption[]>();
		for (const option of variables) {
			const list = map.get(option.group) ?? [];
			list.push(option);
			map.set(option.group, list);
		}
		return Array.from(map.entries());
	}, [variables]);

	return { variables, groups };
}

/** The subset of FieldDefinition ValueInput needs to pick a static control. */
export type ValueInputFieldSpec = {
	type: FieldType;
	options?: { value: string; label: string }[];
};

function StaticControl({
	field,
	value,
	onChange,
	placeholder,
}: {
	field: ValueInputFieldSpec;
	value: ValueRef | undefined;
	onChange: (value: ValueRef) => void;
	placeholder?: string;
}) {
	const staticValue = value?.kind === "static" ? value.value : null;

	if (field.type === "boolean") {
		return (
			<Select
				value={staticValue === true ? "true" : "false"}
				onValueChange={(v) => onChange({ kind: "static", value: v === "true" })}
			>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="true">True</SelectItem>
					<SelectItem value="false">False</SelectItem>
				</SelectContent>
			</Select>
		);
	}

	if (field.type === "select" && field.options) {
		return (
			<Select
				value={typeof staticValue === "string" ? staticValue : ""}
				onValueChange={(v) => onChange({ kind: "static", value: v })}
			>
				<SelectTrigger>
					<SelectValue placeholder={placeholder ?? "Select value"} />
				</SelectTrigger>
				<SelectContent>
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
				value={
					typeof staticValue === "number" && !Number.isNaN(staticValue)
						? staticValue
						: ""
				}
				onChange={(e) =>
					onChange({
						kind: "static",
						value:
							e.target.value === "" || Number.isNaN(Number(e.target.value))
								? null
								: Number(e.target.value),
					})
				}
			/>
		);
	}

	if (field.type === "date") {
		const dateValue =
			typeof staticValue === "number"
				? new Date(staticValue).toISOString().slice(0, 10)
				: "";
		return (
			<Input
				type="date"
				value={dateValue}
				onChange={(e) => {
					const ms = e.target.value ? new Date(e.target.value).getTime() : null;
					onChange({ kind: "static", value: ms });
				}}
			/>
		);
	}

	return (
		<Input
			type="text"
			value={typeof staticValue === "string" ? staticValue : String(staticValue ?? "")}
			onChange={(e) => onChange({ kind: "static", value: e.target.value })}
			placeholder={placeholder ?? "Value"}
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
}

/**
 * Static value control (per FieldDefinition.type) with a trailing "Use a
 * variable" button. Selecting a variable switches the ValueRef to
 * {kind:"var", path}, rendered as a dismissible chip with an optional
 * fallback input.
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
}: ValueInputProps) {
	const [open, setOpen] = useState(false);
	const { variables, groups } = useGroupedVariables(nodes, trigger, targetNodeId, formulas);

	if (value?.kind === "var") {
		const selected = variables.find((v) => v.path === value.path);
		const fallback =
			typeof value.fallback === "string" || typeof value.fallback === "number"
				? String(value.fallback)
				: "";

		return (
			<div className={cn("space-y-2", className)}>
				<div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-sm">
					<Braces className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
					<span className="flex-1 truncate">{selected?.label ?? value.path}</span>
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
				<Input
					type="text"
					value={fallback}
					onChange={(e) =>
						onChange({ ...value, fallback: e.target.value === "" ? undefined : e.target.value })
					}
					placeholder="Fallback value (optional)"
					className="text-xs"
				/>
			</div>
		);
	}

	return (
		<div className={cn("flex items-start gap-1.5", className)}>
			<div className="flex-1 min-w-0">
				<StaticControl field={field} value={value} onChange={onChange} placeholder={placeholder} />
			</div>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						intent="outline"
						size="sq-md"
						aria-label="Use a variable"
						className="shrink-0"
					>
						<Braces className="h-4 w-4" />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-72 p-0">
					<Command>
						<CommandInput placeholder="Search variables..." />
						<CommandList>
							<CommandEmpty>No variables available yet.</CommandEmpty>
							{groups.map(([group, options]) => (
								<CommandGroup key={group} heading={group}>
									{options.map((option) => (
										<CommandItem
											key={option.path}
											value={`${option.group} ${option.label}`}
											onSelect={() => {
												onChange({ kind: "var", path: option.path });
												setOpen(false);
											}}
											className="cursor-pointer"
										>
											{option.label}
										</CommandItem>
									))}
								</CommandGroup>
							))}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
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
	const { groups } = useGroupedVariables(nodes, trigger, targetNodeId, formulas);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					intent="outline"
					size="xs"
					aria-label="Insert a variable"
					className={cn("text-muted-foreground", className)}
				>
					<Braces className="h-3.5 w-3.5" />
					Insert variable
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-0">
				<Command>
					<CommandInput placeholder="Search variables..." />
					<CommandList>
						<CommandEmpty>No variables available yet.</CommandEmpty>
						{groups.map(([group, options]) => (
							<CommandGroup key={group} heading={group}>
								{options.map((option) => (
									<CommandItem
										key={option.path}
										value={`${option.group} ${option.label}`}
										onSelect={() => {
											onInsert(option.path);
											setOpen(false);
										}}
										className="cursor-pointer"
									>
										{option.label}
									</CommandItem>
								))}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
