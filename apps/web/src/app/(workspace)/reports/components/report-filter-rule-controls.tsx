"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { ReportEntityType } from "@onetool/backend/convex/lib/reportFields";
import type {
	ReportFilterOperator,
	ReportFilterRule,
} from "@onetool/backend/convex/lib/reportFilters";
import type { FilterAdapter } from "@/components/shared/filter-adapter";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ReportFieldPicker } from "./report-field-picker";

/** A field pick re-derives the operator and value the adapter defaults to. */
export function ruleForField(
	adapter: FilterAdapter,
	field: string
): ReportFilterRule {
	const operator = adapter.defaultOperatorFor(field);
	return {
		field,
		operator: operator as ReportFilterOperator,
		value: adapter.needsValue(operator)
			? adapter.defaultValueFor(field)
			: undefined,
	};
}

function ruleForOperator(
	adapter: FilterAdapter,
	rule: ReportFilterRule,
	operator: string
): ReportFilterRule {
	// A timestamp value encodes the OLD operator's day boundary — force a re-pick.
	const staleValue = adapter.valueDependsOnOperator(rule.field);
	return {
		...rule,
		operator: operator as ReportFilterOperator,
		value: adapter.needsValue(operator)
			? staleValue
				? undefined
				: (rule.value ?? adapter.defaultValueFor(rule.field))
			: undefined,
	};
}

/**
 * One inline filter rule: field button (drill-in picker) over an operator +
 * value line. Shared by the rail's compact rows and the grouped editor's cards,
 * both of which apply changes live.
 */
export function FilterRuleControls({
	entityType,
	adapter,
	rule,
	onChange,
	autoOpen,
	leading,
	trailing,
	className,
}: {
	entityType: ReportEntityType;
	adapter: FilterAdapter;
	rule: ReportFilterRule;
	onChange: (rule: ReportFilterRule) => void;
	/** Opens the field picker on mount — a row the user just added. */
	autoOpen?: boolean;
	leading?: ReactNode;
	trailing?: ReactNode;
	className?: string;
}) {
	const [pickerOpen, setPickerOpen] = useState(autoOpen === true);
	const label = rule.field ? adapter.fieldLabel(rule.field) : "Select a field";
	const operators = rule.field ? adapter.operatorsFor(rule.field) : [];

	return (
		<div
			className={cn(
				"rounded-lg border border-border/60 bg-card/40 p-1.5",
				className
			)}
		>
			<div className="flex items-center gap-1">
				{leading}
				<Popover open={pickerOpen} onOpenChange={setPickerOpen}>
					<PopoverTrigger
						render={
							<button
								type="button"
								className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<span
									className={cn(
										"truncate",
										!rule.field && "font-normal text-muted-foreground"
									)}
								>
									{label}
								</span>
								<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							</button>
						}
					/>
					{pickerOpen && (
						<PopoverContent
							side="left"
							align="start"
							sideOffset={8}
							className="w-72 p-0"
						>
							<ReportFieldPicker
								entityType={entityType}
								mode="filter"
								value={rule.field || undefined}
								onSelect={(field) => {
									onChange(ruleForField(adapter, field));
									setPickerOpen(false);
								}}
							/>
						</PopoverContent>
					)}
				</Popover>
				{trailing}
			</div>

			<div className="mt-1 flex items-center gap-1.5">
				<Select
					value={rule.operator}
					onValueChange={(v) => {
						if (v) onChange(ruleForOperator(adapter, rule, v));
					}}
					disabled={!rule.field}
				>
					<SelectTrigger
						aria-label="Operator"
						className="h-8 w-36 shrink-0 text-xs"
					>
						<SelectValue placeholder="Operator" />
					</SelectTrigger>
					<SelectContent>
						{operators.map((op) => (
							<SelectItem key={op.value} value={op.value}>
								{op.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{rule.field && adapter.needsValue(rule.operator) && (
					<div className="min-w-0 flex-1">
						{adapter.renderValue({
							field: rule.field,
							operator: rule.operator,
							value: rule.value,
							onChange: (value) => onChange({ ...rule, value }),
						})}
					</div>
				)}
			</div>
		</div>
	);
}
