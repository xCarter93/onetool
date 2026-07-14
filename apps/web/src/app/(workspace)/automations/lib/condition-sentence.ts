/**
 * Plain-English condition sentence renderer — shared by the condition node
 * card, condition config panel summary, and trigger entry-criteria summary.
 */

import {
	VALUELESS_OPERATORS,
	getFieldDefinition,
	type AutomationObjectType,
	type ConditionGroup,
	type ConditionOperator,
	type ConditionRule,
	type ValueRef,
} from "./node-types";

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
	equals: "equals",
	not_equals: "does not equal",
	contains: "contains",
	not_contains: "does not contain",
	is_empty: "is empty",
	is_not_empty: "is not empty",
	greater_than: "is greater than",
	less_than: "is less than",
	gte: "is at least",
	lte: "is at most",
	is_true: "is true",
	is_false: "is false",
	before: "is before",
	after: "is after",
};

export type SentencePart = { kind: "rule" | "text"; text: string };

function isValueless(operator: ConditionOperator): boolean {
	return (VALUELESS_OPERATORS as readonly string[]).includes(operator);
}

function isRuleComplete(rule: ConditionRule): boolean {
	if (!rule.left && !rule.field.trim()) return false;
	if (isValueless(rule.operator)) return true;
	if (rule.value === undefined) return false;
	if (
		rule.value.kind === "static" &&
		(rule.value.value === "" || rule.value.value === null)
	) {
		return false;
	}
	return true;
}

/** trigger.record.<field> paths render as the field label; anything else as a raw {path}. */
function describeVarPath(
	path: string,
	objectType: AutomationObjectType | null
): string {
	const prefix = "trigger.record.";
	if (path.startsWith(prefix)) {
		const field = path.slice(prefix.length);
		if (field === "_id") return "Trigger record ID"; // not in the field registry
		const label = objectType ? getFieldDefinition(objectType, field)?.label : undefined;
		// With no record in scope there is no field to name it after. Say so
		// rather than leaking a raw path that reads like it resolves.
		if (!label) return objectType ? field : "the triggering record";
		return label;
	}
	return `{${path}}`;
}

function describeValue(
	objectType: AutomationObjectType | null,
	field: string,
	value: ValueRef
): string {
	if (value.kind === "var") return describeVarPath(value.path, objectType);

	const fieldDef = objectType ? getFieldDefinition(objectType, field) : undefined;
	if (fieldDef?.type === "select") {
		const option = fieldDef.options?.find((o) => o.value === value.value);
		return option?.label ?? String(value.value ?? "");
	}
	if (typeof value.value === "string") return `"${value.value}"`;
	return String(value.value);
}

function ruleText(rule: ConditionRule, objectType: AutomationObjectType | null): string {
	const fieldDef = objectType ? getFieldDefinition(objectType, rule.field) : undefined;
	const fieldLabel = rule.left
		? describeVarPath(
				rule.left.kind === "var" ? rule.left.path : String(rule.left.value),
				objectType
			)
		: (fieldDef?.label ?? rule.field);
	const opLabel = OPERATOR_LABELS[rule.operator] ?? rule.operator;

	if (isValueless(rule.operator) || rule.value === undefined) {
		return `${fieldLabel} ${opLabel}`;
	}
	return `${fieldLabel} ${opLabel} ${describeValue(objectType, rule.field, rule.value)}`;
}

type RenderedGroup = { parts: SentencePart[]; multi: boolean };

function renderGroup(
	group: ConditionGroup,
	objectType: AutomationObjectType | null
): RenderedGroup | null {
	const completeRules = group.rules.filter(isRuleComplete);
	if (completeRules.length === 0) return null;

	const parts: SentencePart[] = [];
	completeRules.forEach((rule, index) => {
		if (index > 0) parts.push({ kind: "text", text: ` ${group.logic} ` });
		parts.push({ kind: "rule", text: ruleText(rule, objectType) });
	});
	return { parts, multi: completeRules.length > 1 };
}

/**
 * Groups with no complete rules are dropped. A group with one complete rule
 * renders as just that rule; a group with several joins them with the
 * group's own logic word. Parentheses only appear around a multi-rule group
 * when more than one group survives (disambiguating the top-level join).
 */
export function conditionSentenceParts(
	logic: "and" | "or",
	groups: ConditionGroup[],
	objectType: AutomationObjectType | null
): SentencePart[] {
	const rendered = groups
		.map((group) => renderGroup(group, objectType))
		.filter((g): g is RenderedGroup => g !== null);

	if (rendered.length === 0) return [];

	const wrapInParens = rendered.length > 1;
	const parts: SentencePart[] = [];
	rendered.forEach((group, index) => {
		if (index > 0) parts.push({ kind: "text", text: ` ${logic} ` });
		if (wrapInParens && group.multi) {
			parts.push({ kind: "text", text: "(" });
			parts.push(...group.parts);
			parts.push({ kind: "text", text: ")" });
		} else {
			parts.push(...group.parts);
		}
	});
	return parts;
}

export function conditionSentence(
	logic: "and" | "or",
	groups: ConditionGroup[],
	objectType: AutomationObjectType | null
): string {
	return conditionSentenceParts(logic, groups, objectType)
		.map((part) => part.text)
		.join("");
}
