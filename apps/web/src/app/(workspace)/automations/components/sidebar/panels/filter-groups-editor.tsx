"use client";

import React, { useState } from "react";
import { ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
	VariableDrillList,
	type DrillGroup,
	type DrillPage,
} from "./variable-drill-list";
import {
	MAX_CONDITION_GROUPS,
	MAX_RULES_PER_GROUP,
	RELATED_OBJECTS,
	VALUELESS_OPERATORS,
	VARIABLE_LEFT_OPERATORS,
	OBJECT_TYPE_LABELS,
	getFieldDefinitionForKey,
	getFilterableFields,
	operatorsForField,
	type AutomationObjectType,
	type AutomationTrigger,
	type ConditionGroup,
	type ConditionRule,
	type FormulaResource,
	type TriggerConfig,
	type WorkflowNode,
} from "../../../lib/node-types";
import { ValueInput } from "./value-input";
import { PickerChip } from "./picker-chip";
import { OPERATOR_LABELS } from "../../../lib/condition-sentence";
import type { VariableOption } from "../../../lib/variables";

/** Left-side select values are namespaced so a variable can't collide with a field key. */
const VAR_PREFIX = "var:";

/**
 * Shared group/rule builder for condition-config.tsx (with a top-level
 * and/or select across groups) and fetch-config.tsx (groups are always
 * ANDed — pass topLevelLogic undefined and a helperText instead).
 */


function isValueless(operator: string): boolean {
	return (VALUELESS_OPERATORS as readonly string[]).includes(operator);
}

export function emptyFilterRule(
	objectType: AutomationObjectType,
	field: string
): ConditionRule {
	const operator = operatorsForField(objectType, field)[0] ?? "equals";
	return isValueless(operator)
		? { field, operator }
		: { field, operator, value: { kind: "static", value: "" } };
}

/** A rule that tests a scope value (a step result) instead of a record field. */
function emptyVariableRule(path: string): ConditionRule {
	return {
		field: "",
		left: { kind: "var", path },
		operator: "equals",
		value: { kind: "static", value: "" },
	};
}

type FilterableFields = ReturnType<typeof getFilterableFields>;

type RelationFieldGroup = {
	relation: AutomationObjectType;
	label: string;
	fields: FilterableFields;
};

/**
 * The rule's left-side field selector, as a drill-down (own fields + one page
 * per relation) plus the `var:`-prefixed step-result options. Stores the exact
 * same string the old Select emitted — a field key, `<relation>.<fieldKey>`, or
 * `var:<path>` — so saved definitions are unchanged; only the UI differs.
 */
function FieldPicker({
	objectType,
	fields,
	relationFieldGroups,
	variableOptions,
	value,
	onSelect,
}: {
	objectType: AutomationObjectType | null;
	fields: FilterableFields;
	relationFieldGroups: RelationFieldGroup[];
	variableOptions: VariableOption[];
	value: string;
	onSelect: (next: string) => void;
}) {
	const [open, setOpen] = useState(false);

	const label = (() => {
		if (value.startsWith(VAR_PREFIX)) {
			const path = value.slice(VAR_PREFIX.length);
			return variableOptions.find((o) => o.path === path)?.label ?? path;
		}
		const dot = value.indexOf(".");
		if (dot > 0) {
			const rel = value.slice(0, dot);
			const key = value.slice(dot + 1);
			const group = relationFieldGroups.find((g) => g.relation === rel);
			const field = group?.fields.find((f) => f.key === key);
			if (group && field) return `${group.label} → ${field.label}`;
		}
		return fields.find((f) => f.key === value)?.label ?? value;
	})();

	const pick = (next: string) => {
		onSelect(next);
		setOpen(false);
	};

	const rootGroups: DrillGroup[] = [];
	if (fields.length > 0) {
		rootGroups.push({
			id: "__fields__",
			heading: objectType ? OBJECT_TYPE_LABELS[objectType] : undefined,
			items: fields.map((f) => ({
				id: f.key,
				value: f.label,
				label: f.label,
				onSelect: () => pick(f.key),
			})),
		});
	}
	if (variableOptions.length > 0) {
		rootGroups.push({
			id: "__vars__",
			heading: "Step results",
			items: variableOptions.map((o) => ({
				id: `${VAR_PREFIX}${o.path}`,
				value: `${o.group} ${o.label}`,
				label: o.label,
				onSelect: () => pick(`${VAR_PREFIX}${o.path}`),
			})),
		});
	}

	const pages: DrillPage[] = relationFieldGroups
		.filter((g) => g.fields.length > 0)
		.map((g) => ({
			id: g.relation,
			navLabel: g.label,
			items: g.fields.map((f) => ({
				id: `${g.relation}.${f.key}`,
				value: `${g.label} ${f.label}`,
				label: `${g.label} → ${f.label}`,
				onSelect: () => pick(`${g.relation}.${f.key}`),
			})),
		}));

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						className={cn(
							"w-full justify-between font-normal",
							!value && "text-muted-foreground"
						)}
					/>
				}
			>
				{value ? (
					<PickerChip label={label} />
				) : (
					<span className="truncate">Select field</span>
				)}
				<ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 p-0">
				<VariableDrillList
					rootGroups={rootGroups}
					pages={pages}
					open={open}
					emptyText="No fields available."
					placeholder="Search fields..."
				/>
			</PopoverContent>
		</Popover>
	);
}

export interface FilterGroupsEditorProps {
	/** null when nothing puts a record in scope (a scheduled trigger outside a loop). */
	objectType: AutomationObjectType | null;
	/**
	 * Step results / formulas a rule may test on its left side. Condition panels
	 * only — a fetch filter or entry criteria must name a real field.
	 */
	variableLeftOptions?: VariableOption[];
	groups: ConditionGroup[];
	onChange: (groups: ConditionGroup[]) => void;
	/** Present for condition-config: lets the user choose "all"/"any" across groups. Omit when groups are always ANDed (fetch-config). */
	topLevelLogic?: {
		value: "and" | "or";
		onChange: (value: "and" | "or") => void;
	};
	/** Shown when topLevelLogic is omitted (e.g. "All groups must match"). */
	helperText?: string;
	nodes: WorkflowNode[];
	trigger: TriggerConfig | AutomationTrigger | null;
	targetNodeId: string;
	formulas?: FormulaResource[];
}

export function FilterGroupsEditor({
	objectType,
	variableLeftOptions,
	groups,
	onChange,
	topLevelLogic,
	helperText,
	nodes,
	trigger,
	targetNodeId,
	formulas,
}: FilterGroupsEditorProps) {
	const fields = objectType ? getFilterableFields(objectType) : [];
	// One-hop related fields (C6): "<relation>.<fieldKey>" values, grouped per
	// relation ("Client → Company name") alongside the flat field group.
	const relationFieldGroups = objectType
		? (RELATED_OBJECTS[objectType] ?? []).map((relation) => ({
				relation,
				label: OBJECT_TYPE_LABELS[relation],
				fields: getFilterableFields(relation),
			}))
		: [];
	const variableOptions = variableLeftOptions ?? [];
	const canAddRule = fields.length > 0 || variableOptions.length > 0;

	const newRule = (): ConditionRule | null => {
		if (objectType && fields[0]) return emptyFilterRule(objectType, fields[0].key);
		if (variableOptions[0]) return emptyVariableRule(variableOptions[0].path);
		return null;
	};

	const updateGroup = (groupIndex: number, group: ConditionGroup) => {
		onChange(groups.map((g, i) => (i === groupIndex ? group : g)));
	};

	const updateRule = (groupIndex: number, ruleIndex: number, rule: ConditionRule) => {
		const group = groups[groupIndex];
		const rules = group.rules.map((r, i) => (i === ruleIndex ? rule : r));
		updateGroup(groupIndex, { ...group, rules });
	};

	const addRule = (groupIndex: number) => {
		const group = groups[groupIndex];
		if (group.rules.length >= MAX_RULES_PER_GROUP) return;
		const rule = newRule();
		if (!rule) return;
		updateGroup(groupIndex, { ...group, rules: [...group.rules, rule] });
	};

	const removeRule = (groupIndex: number, ruleIndex: number) => {
		const group = groups[groupIndex];
		updateGroup(groupIndex, {
			...group,
			rules: group.rules.filter((_, i) => i !== ruleIndex),
		});
	};

	const addGroup = () => {
		if (groups.length >= MAX_CONDITION_GROUPS) return;
		onChange([...groups, { logic: "and", rules: [] }]);
	};

	const removeGroup = (groupIndex: number) => {
		onChange(groups.filter((_, i) => i !== groupIndex));
	};

	return (
		<div className="space-y-4">
			{topLevelLogic && groups.length > 1 && (
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground">Match</span>
					<Select
						value={topLevelLogic.value}
						onValueChange={(v) => topLevelLogic.onChange(v as "and" | "or")}
					>
						<SelectTrigger className="h-8 w-24">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="and">All</SelectItem>
							<SelectItem value="or">Any</SelectItem>
						</SelectContent>
					</Select>
					<span className="text-xs text-muted-foreground">groups must match</span>
				</div>
			)}

			{!topLevelLogic && helperText && (
				<p className="text-xs text-muted-foreground">{helperText}</p>
			)}

			{groups.map((group, groupIndex) => (
				<div key={groupIndex} className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium text-muted-foreground">
								{groupIndex === 0
									? topLevelLogic
										? "When"
										: "Match"
									: topLevelLogic
										? topLevelLogic.value === "or"
											? "Or when"
											: "And when"
										: "And match"}
							</span>
							{group.rules.length > 1 && (
								<Select
									value={group.logic}
									onValueChange={(v) =>
										updateGroup(groupIndex, { ...group, logic: v as "and" | "or" })
									}
								>
									<SelectTrigger className="h-7 w-20">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="and">All</SelectItem>
										<SelectItem value="or">Any</SelectItem>
									</SelectContent>
								</Select>
							)}
						</div>
						{groups.length > 1 && (
							<button
								type="button"
								onClick={() => removeGroup(groupIndex)}
								className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
								aria-label="Remove group"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						)}
					</div>

					{group.rules.length === 0 && (
						<p className="text-xs text-muted-foreground">
							Add at least one rule to define this group.
						</p>
					)}

					{group.rules.map((rule, ruleIndex) => {
						const variableLeft = rule.left?.kind === "var" ? rule.left : undefined;
						const leftOption = variableLeft
							? variableOptions.find((o) => o.path === variableLeft.path)
							: undefined;
						const fieldDef =
							!variableLeft && objectType
								? getFieldDefinitionForKey(objectType, rule.field)
								: undefined;
						const operators = variableLeft
							? [...VARIABLE_LEFT_OPERATORS]
							: fieldDef && objectType
								? operatorsForField(objectType, rule.field)
								: [];
						const needsValue = !isValueless(rule.operator);
						// A step result has no registry entry; drive the value control off
						// the variable's own type, defaulting to a number.
						const valueSpec = variableLeft
							? { type: leftOption?.fieldType ?? ("number" as const) }
							: fieldDef;

						return (
							<div key={ruleIndex} className="flex items-start gap-2">
								<div className="flex-1 space-y-2">
									<FieldPicker
										objectType={objectType}
										fields={fields}
										relationFieldGroups={relationFieldGroups}
										variableOptions={variableOptions}
										value={
											variableLeft ? `${VAR_PREFIX}${variableLeft.path}` : rule.field
										}
										onSelect={(next) => {
											if (!next) return;
											if (next.startsWith(VAR_PREFIX)) {
												updateRule(
													groupIndex,
													ruleIndex,
													emptyVariableRule(next.slice(VAR_PREFIX.length))
												);
												return;
											}
											if (!objectType) return;
											const nextOperators = operatorsForField(objectType, next);
											updateRule(groupIndex, ruleIndex, {
												field: next,
												operator: nextOperators[0] ?? "equals",
												value: isValueless(nextOperators[0] ?? "equals")
													? undefined
													: { kind: "static", value: "" },
											});
										}}
									/>

									<Select
										value={rule.operator}
										onValueChange={(op) =>
											op &&
											updateRule(groupIndex, ruleIndex, {
												...rule,
												operator: op as ConditionRule["operator"],
												value: isValueless(op) ? undefined : (rule.value ?? { kind: "static", value: "" }),
											})
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Operator" />
										</SelectTrigger>
										<SelectContent>
											{operators.map((op) => (
												<SelectItem key={op} value={op}>
													{OPERATOR_LABELS[op] ?? op}
												</SelectItem>
											))}
										</SelectContent>
									</Select>

									{needsValue && valueSpec && (
										<ValueInput
											field={valueSpec}
											value={rule.value}
											onChange={(value) => updateRule(groupIndex, ruleIndex, { ...rule, value })}
											nodes={nodes}
											trigger={trigger}
											targetNodeId={targetNodeId}
											formulas={formulas}
											arrayResolution={
												rule.operator === "equals" ||
												rule.operator === "not_equals"
													? "any"
													: "none"
											}
										/>
									)}
								</div>
								<button
									type="button"
									onClick={() => removeRule(groupIndex, ruleIndex)}
									className="mt-2 text-muted-foreground hover:text-destructive"
									aria-label="Remove rule"
								>
									<X className="h-3.5 w-3.5" />
								</button>
							</div>
						);
					})}

					{group.rules.length < MAX_RULES_PER_GROUP && canAddRule && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => addRule(groupIndex)}
							className="w-full gap-1.5 border-dashed text-muted-foreground hover:text-foreground"
						>
							<Plus className="h-3.5 w-3.5" /> Add rule
						</Button>
					)}
				</div>
			))}

			{canAddRule && groups.length < MAX_CONDITION_GROUPS && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={addGroup}
					className="w-full gap-1.5 border-dashed text-muted-foreground hover:text-foreground"
				>
					<Plus className="h-3.5 w-3.5" /> Add {topLevelLogic ? "condition" : "filter"} group
				</Button>
			)}
		</div>
	);
}
