/**
 * Standalone filter-group evaluator for report queries. Deliberately not
 * shared with automations' conditionEval — that one is coupled to workflow
 * variable resolution (node outputs, trigger scope), which reports don't have.
 */
import { v } from "convex/values";

export const reportFilterOperator = v.union(
	v.literal("equals"),
	v.literal("not_equals"),
	v.literal("contains"),
	v.literal("greater_than"),
	v.literal("greater_than_or_equal"),
	v.literal("less_than"),
	v.literal("less_than_or_equal"),
	v.literal("is_empty"),
	v.literal("is_not_empty")
);

export const reportFiltersValidator = v.object({
	logic: v.union(v.literal("and"), v.literal("or")),
	groups: v.array(
		v.object({
			logic: v.union(v.literal("and"), v.literal("or")),
			rules: v.array(
				v.object({
					field: v.string(),
					operator: reportFilterOperator,
					value: v.optional(
						v.union(v.string(), v.number(), v.boolean())
					),
				})
			),
		})
	),
});

export type ReportFilterOperator =
	| "equals"
	| "not_equals"
	| "contains"
	| "greater_than"
	| "greater_than_or_equal"
	| "less_than"
	| "less_than_or_equal"
	| "is_empty"
	| "is_not_empty";

export interface ReportFilterRule {
	field: string;
	operator: ReportFilterOperator;
	value?: string | number | boolean;
}

export interface ReportFilterGroup {
	logic: "and" | "or";
	rules: ReportFilterRule[];
}

export interface ReportFilters {
	logic: "and" | "or";
	groups: ReportFilterGroup[];
}

function isEmptyValue(value: unknown): boolean {
	return value === undefined || value === null || value === "";
}

function evaluateRule(row: Record<string, unknown>, rule: ReportFilterRule): boolean {
	const rowValue = row[rule.field];

	switch (rule.operator) {
		case "is_empty":
			return isEmptyValue(rowValue);
		case "is_not_empty":
			return !isEmptyValue(rowValue);
		case "equals":
			return rowValue === rule.value;
		case "not_equals":
			return rowValue !== rule.value;
		case "contains":
			if (typeof rowValue !== "string" || typeof rule.value !== "string") {
				return false;
			}
			return rowValue.toLowerCase().includes(rule.value.toLowerCase());
		case "greater_than":
		case "greater_than_or_equal":
		case "less_than":
		case "less_than_or_equal": {
			if (typeof rowValue !== "number" || typeof rule.value !== "number") {
				return false;
			}
			switch (rule.operator) {
				case "greater_than":
					return rowValue > rule.value;
				case "greater_than_or_equal":
					return rowValue >= rule.value;
				case "less_than":
					return rowValue < rule.value;
				case "less_than_or_equal":
					return rowValue <= rule.value;
			}
		}
	}
}

/** Pure filter-group evaluator. Assumes fields have already been validated. */
export function evaluateReportFilters(
	row: Record<string, unknown>,
	filters: ReportFilters
): boolean {
	if (filters.groups.length === 0) return true;

	const groupResults = filters.groups.map((group) => {
		if (group.rules.length === 0) return true;
		const ruleResults = group.rules.map((rule) => evaluateRule(row, rule));
		return group.logic === "and"
			? ruleResults.every(Boolean)
			: ruleResults.some(Boolean);
	});

	return filters.logic === "and"
		? groupResults.every(Boolean)
		: groupResults.some(Boolean);
}
