"use client";

import {
	REPORT_FIELDS,
	type ReportEntityType,
	type ReportFieldDef,
} from "@onetool/backend/convex/lib/reportFields";
import type { ReportFilterOperator } from "@onetool/backend/convex/lib/reportFilters";
import type {
	FilterAdapter,
	FilterValueProps,
} from "@/components/shared/filter-adapter";
import { TypedPrimitiveControl } from "@/components/shared/typed-primitive-control";
import { DatePicker } from "@/components/ui/date-picker";
import { formatDate } from "../report-config";

export const OPERATOR_LABELS: Record<ReportFilterOperator, string> = {
	equals: "equals",
	not_equals: "does not equal",
	contains: "contains",
	greater_than: "is greater than",
	greater_than_or_equal: "is at least",
	less_than: "is less than",
	less_than_or_equal: "is at most",
	before: "is before",
	after: "is after",
	on: "is on",
	is_empty: "is empty",
	is_not_empty: "is not empty",
};

export const VALUELESS_OPERATORS: ReadonlySet<string> = new Set([
	"is_empty",
	"is_not_empty",
]);

function operatorsForDef(def: ReportFieldDef): ReportFilterOperator[] {
	switch (def.type) {
		case "boolean":
			return ["equals"];
		case "number":
		case "currency":
			return [
				"equals",
				"not_equals",
				"greater_than",
				"greater_than_or_equal",
				"less_than",
				"less_than_or_equal",
			];
		// Reachable since R9 — the R7 backend operators finally get an authoring surface.
		case "timestamp":
			return ["before", "after", "on", "is_empty", "is_not_empty"];
		case "string":
		default:
			return ["equals", "not_equals", "contains", "is_empty", "is_not_empty"];
	}
}

/**
 * Day-granular pickers encode the user's calendar day as an instant matching
 * the operator's meaning: "before Aug 27" excludes all of Aug 27 (start of
 * day), "after Aug 27" starts at Aug 28 (end of day), and "on Aug 27" uses
 * noon so the org-timezone day key lands on the picked day for any real
 * UTC offset. Browser-local time, same as the custom date-range picker.
 */
function timestampValueFor(operator: string, picked: Date): number {
	const day = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate());
	if (operator === "before") return day.getTime();
	if (operator === "after") return day.setHours(23, 59, 59, 999);
	return day.setHours(12, 0, 0, 0);
}

function TimestampValue({ operator, value, onChange }: FilterValueProps) {
	return (
		<DatePicker
			value={typeof value === "number" ? new Date(value) : undefined}
			onChange={(date) =>
				onChange(date ? timestampValueFor(operator, date) : undefined)
			}
			placeholder="Pick a date"
		/>
	);
}

export function reportFilterAdapter(entityType: ReportEntityType): FilterAdapter {
	const fields = REPORT_FIELDS[entityType].fields;
	const defFor = (field: string): ReportFieldDef | undefined => fields[field];

	return {
		fields: Object.entries(fields).map(([value, def]) => ({
			value,
			label: def.label,
		})),
		fieldLabel: (field) => defFor(field)?.label ?? field,
		operatorsFor: (field) => {
			const def = defFor(field);
			if (!def) return [];
			return operatorsForDef(def).map((op) => ({
				value: op,
				label: OPERATOR_LABELS[op],
			}));
		},
		needsValue: (operator) => !VALUELESS_OPERATORS.has(operator),
		defaultOperatorFor: (field) => {
			const def = defFor(field);
			return def ? (operatorsForDef(def)[0] ?? "equals") : "equals";
		},
		defaultValueFor: (field) =>
			defFor(field)?.type === "boolean" ? true : undefined,
		valueDependsOnOperator: (field) => defFor(field)?.type === "timestamp",
		renderValue: (props) => {
			const def = defFor(props.field);
			if (!def) return null;
			if (def.type === "timestamp") return <TimestampValue {...props} />;
			return (
				<TypedPrimitiveControl
					field={
						def.options
							? {
									type: "select",
									options: def.options.map((opt) => ({
										value: opt,
										label: def.optionLabels?.[opt] ?? opt,
									})),
								}
							: def.type === "boolean"
								? { type: "boolean" }
								: def.type === "number" || def.type === "currency"
									? { type: "number" }
									: { type: "text" }
					}
					value={props.value ?? null}
					onChange={(v) => props.onChange(v ?? undefined)}
					placeholder="Value"
				/>
			);
		},
		summarizeRule: (rule) => {
			const phrase =
				OPERATOR_LABELS[rule.operator as ReportFilterOperator] ?? rule.operator;
			if (VALUELESS_OPERATORS.has(rule.operator)) return phrase;
			if (rule.value === undefined || rule.value === "") return phrase;
			const def = defFor(rule.field);
			const valueText =
				def?.type === "timestamp" && typeof rule.value === "number"
					? formatDate(rule.value)
					: typeof rule.value === "boolean"
						? rule.value
							? "True"
							: "False"
						: String(rule.value);
			return `${phrase} ${valueText}`;
		},
	};
}
