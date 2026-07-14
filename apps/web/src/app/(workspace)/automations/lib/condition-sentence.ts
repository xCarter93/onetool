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

/** Path → friendly label for callers that computed variable options (exact labels). */
export type VarLabelMap = ReadonlyMap<string, string>;

const GLOBAL_PATH_LABELS: Record<string, string> = {
	"workflow.now": "Current time",
	"workflow.tz": "Timezone",
	"org.id": "Organization ID",
	"org.name": "Organization name",
	"user.id": "Your user ID",
	"user.name": "Your name",
	"user.email": "Your email",
	"trigger.event.oldValue": "Previous value",
	"trigger.event.newValue": "New value",
};

/**
 * trigger.record.<field> paths render as the field label; other known path
 * shapes get a generic description. Exact labels come from `varLabels` when the
 * caller has them (the config panel does; the canvas card doesn't).
 */
export function describeVarPath(
	path: string,
	objectType: AutomationObjectType | null,
	varLabels?: VarLabelMap
): string {
	const exact = varLabels?.get(path);
	if (exact) return exact;

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

	const global = GLOBAL_PATH_LABELS[path];
	if (global) return global;
	if (/^node\.[^.]+\.count$/.test(path)) return "Found records count";
	if (/^node\.[^.]+\.result$/.test(path)) return "Computed result";
	if (/^loop\.[^.]+\.index$/.test(path)) return "Loop item index";
	const loopItem = path.match(/^loop\.[^.]+\.item\.(.+)$/);
	if (loopItem) {
		return loopItem[1] === "_id" ? "Loop item ID" : `Loop item ${loopItem[1]}`;
	}
	if (/^formula\.[^.]+$/.test(path)) return "Formula result";
	return `{${path}}`;
}

function describeValue(
	objectType: AutomationObjectType | null,
	field: string,
	value: ValueRef,
	varLabels?: VarLabelMap
): string {
	if (value.kind === "var") return describeVarPath(value.path, objectType, varLabels);

	const fieldDef = objectType ? getFieldDefinition(objectType, field) : undefined;
	if (fieldDef?.type === "select") {
		const option = fieldDef.options?.find((o) => o.value === value.value);
		return option?.label ?? String(value.value ?? "");
	}
	if (typeof value.value === "string") return `"${value.value}"`;
	return String(value.value);
}

function ruleText(
	rule: ConditionRule,
	objectType: AutomationObjectType | null,
	varLabels?: VarLabelMap
): string {
	const fieldDef = objectType ? getFieldDefinition(objectType, rule.field) : undefined;
	const fieldLabel = rule.left
		? describeVarPath(
				rule.left.kind === "var" ? rule.left.path : String(rule.left.value),
				objectType,
				varLabels
			)
		: (fieldDef?.label ?? rule.field);
	const opLabel = OPERATOR_LABELS[rule.operator] ?? rule.operator;

	if (isValueless(rule.operator) || rule.value === undefined) {
		return `${fieldLabel} ${opLabel}`;
	}
	return `${fieldLabel} ${opLabel} ${describeValue(objectType, rule.field, rule.value, varLabels)}`;
}

type RenderedGroup = { parts: SentencePart[]; multi: boolean };

function renderGroup(
	group: ConditionGroup,
	objectType: AutomationObjectType | null,
	varLabels?: VarLabelMap
): RenderedGroup | null {
	const completeRules = group.rules.filter(isRuleComplete);
	if (completeRules.length === 0) return null;

	const parts: SentencePart[] = [];
	completeRules.forEach((rule, index) => {
		if (index > 0) parts.push({ kind: "text", text: ` ${group.logic} ` });
		parts.push({ kind: "rule", text: ruleText(rule, objectType, varLabels) });
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
	objectType: AutomationObjectType | null,
	varLabels?: VarLabelMap
): SentencePart[] {
	const rendered = groups
		.map((group) => renderGroup(group, objectType, varLabels))
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
	objectType: AutomationObjectType | null,
	varLabels?: VarLabelMap
): string {
	return conditionSentenceParts(logic, groups, objectType, varLabels)
		.map((part) => part.text)
		.join("");
}
