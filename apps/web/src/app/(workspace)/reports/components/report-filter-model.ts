/**
 * Pure filter-config helpers shared by the rail rows and the grouped editor.
 * The drag reducers live here because dnd-kit gestures aren't testable in
 * jsdom — the outcomes are.
 */
import type {
	ReportFilterGroup,
	ReportFilterRule,
	ReportFilters,
} from "@onetool/backend/convex/lib/reportFilters";
import { VALUELESS_OPERATORS } from "./report-filter-adapter";

export const MAX_GROUPS = 5;
export const MAX_RULES_PER_GROUP = 8;

function isEmptyValue(value: unknown): boolean {
	return value === undefined || value === null || value === "";
}

export function isDraftComplete(rule: ReportFilterRule): boolean {
	if (!rule.field) return false;
	if (VALUELESS_OPERATORS.has(rule.operator)) return true;
	return !isEmptyValue(rule.value);
}

/**
 * Strips incomplete rules (missing value, unless the operator is valueless),
 * drops groups left with zero rules, and returns undefined when nothing
 * meaningful remains. Used before both querying and saving.
 */
export function sanitizeReportFilters(
	filters: ReportFilters | undefined
): ReportFilters | undefined {
	if (!filters) return undefined;

	const groups = filters.groups
		.map((group) => ({
			logic: group.logic,
			rules: group.rules.filter(isDraftComplete),
		}))
		.filter((group) => group.rules.length > 0);

	if (groups.length === 0) return undefined;

	return { logic: filters.logic, groups };
}

/** Total complete filter rules — drives the Filters section badge count. */
export function countFilterRules(filters: ReportFilters | undefined): number {
	const sanitized = sanitizeReportFilters(filters);
	if (!sanitized) return 0;
	return sanitized.groups.reduce((sum, g) => sum + g.rules.length, 0);
}

export type RuleLocation = { groupIndex: number; ruleIndex: number };

/** Where a dragged rule lands; an absent ruleIndex appends. */
export type RuleDropTarget = { groupIndex: number; ruleIndex?: number };

/**
 * Drag outcome: move one rule to another group (or another slot in its own).
 * A source group the move empties is dropped, matching what sanitize would do
 * at save time; groups the user left empty on purpose are untouched.
 */
export function moveRuleBetweenGroups(
	groups: ReportFilterGroup[],
	from: RuleLocation,
	to: RuleDropTarget
): ReportFilterGroup[] {
	const rule = groups[from.groupIndex]?.rules[from.ruleIndex];
	const target = groups[to.groupIndex];
	if (!rule || !target) return groups;
	if (
		to.groupIndex !== from.groupIndex &&
		target.rules.length >= MAX_RULES_PER_GROUP
	) {
		return groups;
	}

	const next = groups.map((group) => ({ ...group, rules: [...group.rules] }));
	next[from.groupIndex].rules.splice(from.ruleIndex, 1);
	const insertAt = to.ruleIndex ?? next[to.groupIndex].rules.length;
	next[to.groupIndex].rules.splice(insertAt, 0, rule);

	return next[from.groupIndex].rules.length === 0
		? next.filter((_, i) => i !== from.groupIndex)
		: next;
}

/** Drag outcome: reorder group cards. Cosmetic — AND/OR is commutative. */
export function reorderGroups(
	groups: ReportFilterGroup[],
	from: number,
	to: number
): ReportFilterGroup[] {
	if (!groups[from] || !groups[to] || from === to) return groups;
	const next = [...groups];
	next.splice(to, 0, next.splice(from, 1)[0]);
	return next;
}
