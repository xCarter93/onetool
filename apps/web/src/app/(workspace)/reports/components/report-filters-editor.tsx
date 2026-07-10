"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
	REPORT_FIELDS,
	type ReportEntityType,
	type ReportFieldDef,
} from "@onetool/backend/convex/lib/reportFields";
import type {
	ReportFilterGroup,
	ReportFilterOperator,
	ReportFilterRule,
	ReportFilters,
} from "@onetool/backend/convex/lib/reportFilters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Verbose label used in the popover's operator Select. */
const OPERATOR_LABELS: Record<ReportFilterOperator, string> = {
	equals: "equals",
	not_equals: "does not equal",
	contains: "contains",
	greater_than: "is greater than",
	greater_than_or_equal: "is at least",
	less_than: "is less than",
	less_than_or_equal: "is at most",
	is_empty: "is empty",
	is_not_empty: "is not empty",
};

/** Condensed phrase used on the collapsed rule card ("equals Sent", "is empty"). */
const OPERATOR_PHRASE: Record<ReportFilterOperator, string> = OPERATOR_LABELS;

const VALUELESS_OPERATORS: ReadonlySet<ReportFilterOperator> = new Set([
	"is_empty",
	"is_not_empty",
]);

const MAX_GROUPS = 5;
const MAX_RULES_PER_GROUP = 8;

function operatorsForField(field: ReportFieldDef): ReportFilterOperator[] {
	switch (field.type) {
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
		case "string":
		default:
			return ["equals", "not_equals", "contains", "is_empty", "is_not_empty"];
	}
}

function filterableFields(
	entityType: ReportEntityType
): { key: string; def: ReportFieldDef }[] {
	return Object.entries(REPORT_FIELDS[entityType].fields)
		.filter(([, def]) => def.type !== "timestamp")
		.map(([key, def]) => ({ key, def }));
}

function defaultValueForField(field: ReportFieldDef): string | number | boolean | undefined {
	if (field.type === "boolean") return true;
	return undefined;
}

function blankRule(): ReportFilterRule {
	return { field: "", operator: "equals", value: undefined };
}

function isEmptyValue(value: unknown): boolean {
	return value === undefined || value === null || value === "";
}

function isDraftComplete(rule: ReportFilterRule): boolean {
	if (!rule.field) return false;
	if (VALUELESS_OPERATORS.has(rule.operator)) return true;
	return !isEmptyValue(rule.value);
}

function ruleSummary(rule: ReportFilterRule): string {
	const phrase = OPERATOR_PHRASE[rule.operator];
	if (VALUELESS_OPERATORS.has(rule.operator)) return phrase;
	if (rule.value === undefined || rule.value === "") return phrase;
	const valueText = typeof rule.value === "boolean" ? (rule.value ? "True" : "False") : String(rule.value);
	return `${phrase} ${valueText}`;
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
			rules: group.rules.filter((rule) => {
				if (!rule.field) return false;
				if (VALUELESS_OPERATORS.has(rule.operator)) return true;
				return !isEmptyValue(rule.value);
			}),
		}))
		.filter((group) => group.rules.length > 0);

	if (groups.length === 0) return undefined;

	return { logic: filters.logic, groups };
}

/** Total complete filter rules — drives the Filters tab badge count. */
export function countFilterRules(filters: ReportFilters | undefined): number {
	const sanitized = sanitizeReportFilters(filters);
	if (!sanitized) return 0;
	return sanitized.groups.reduce((sum, g) => sum + g.rules.length, 0);
}

export interface ReportFiltersEditorProps {
	entityType: ReportEntityType;
	filters: ReportFilters | undefined;
	onChange: (filters: ReportFilters | undefined) => void;
}

type EditorTarget =
	| { kind: "add-rule"; groupIndex: number }
	| { kind: "edit-rule"; groupIndex: number; ruleIndex: number };

function targetKey(target: EditorTarget): string {
	return target.kind === "add-rule"
		? `add-rule-${target.groupIndex}`
		: `edit-rule-${target.groupIndex}-${target.ruleIndex}`;
}

export function ReportFiltersEditor({
	entityType,
	filters,
	onChange,
}: ReportFiltersEditorProps) {
	const fields = filterableFields(entityType);
	const groups = filters?.groups ?? [];
	const topLogic = filters?.logic ?? "and";

	const [editor, setEditor] = useState<{ target: EditorTarget; draft: ReportFilterRule } | null>(
		null
	);

	const commit = (nextGroups: ReportFilterGroup[]) => {
		if (nextGroups.length === 0) {
			onChange(undefined);
			return;
		}
		onChange({ logic: topLogic, groups: nextGroups });
	};

	const setTopLogic = (logic: "and" | "or") => {
		if (groups.length === 0) return;
		onChange({ logic, groups });
	};

	const removeGroup = (groupIndex: number) => {
		commit(groups.filter((_, i) => i !== groupIndex));
	};

	const updateGroup = (groupIndex: number, group: ReportFilterGroup) => {
		commit(groups.map((g, i) => (i === groupIndex ? group : g)));
	};

	// Empty groups are kept as containers in UI state — sanitizeReportFilters
	// strips them at query/save time, so they never reach the backend.
	const addGroup = () => {
		if (groups.length >= MAX_GROUPS) return;
		commit([...groups, { logic: "and", rules: [] }]);
	};

	const removeRule = (groupIndex: number, ruleIndex: number) => {
		const group = groups[groupIndex];
		if (!group) return;
		updateGroup(groupIndex, {
			...group,
			rules: group.rules.filter((_, i) => i !== ruleIndex),
		});
	};

	const openEditor = (target: EditorTarget, initial?: ReportFilterRule) => {
		setEditor({ target, draft: initial ?? blankRule() });
	};

	const closeEditor = () => setEditor(null);

	const applyDraft = () => {
		if (!editor || !isDraftComplete(editor.draft)) return;
		const { target, draft } = editor;

		switch (target.kind) {
			case "add-rule": {
				const group = groups[target.groupIndex];
				if (!group) {
					// Empty-state placeholder group (index 0, nothing in state yet):
					// materialize it with the first rule.
					if (target.groupIndex === 0 && groups.length === 0) {
						commit([{ logic: "and", rules: [draft] }]);
					}
					break;
				}
				if (group.rules.length >= MAX_RULES_PER_GROUP) break;
				updateGroup(target.groupIndex, { ...group, rules: [...group.rules, draft] });
				break;
			}
			case "edit-rule": {
				const group = groups[target.groupIndex];
				if (!group) break;
				updateGroup(target.groupIndex, {
					...group,
					rules: group.rules.map((r, i) => (i === target.ruleIndex ? draft : r)),
				});
				break;
			}
		}
		closeEditor();
	};

	const setDraftField = (field: string) => {
		if (!editor) return;
		const nextDef = REPORT_FIELDS[entityType].fields[field];
		const nextOperator = nextDef ? (operatorsForField(nextDef)[0] ?? "equals") : "equals";
		setEditor({
			...editor,
			draft: {
				field,
				operator: nextOperator,
				value: VALUELESS_OPERATORS.has(nextOperator)
					? undefined
					: nextDef
						? defaultValueForField(nextDef)
						: undefined,
			},
		});
	};

	const setDraftOperator = (operator: ReportFilterOperator) => {
		if (!editor) return;
		const fieldDef = editor.draft.field ? REPORT_FIELDS[entityType].fields[editor.draft.field] : undefined;
		setEditor({
			...editor,
			draft: {
				...editor.draft,
				operator,
				value: VALUELESS_OPERATORS.has(operator)
					? undefined
					: (editor.draft.value ?? (fieldDef ? defaultValueForField(fieldDef) : undefined)),
			},
		});
	};

	const setDraftValue = (value: string | number | boolean | undefined) => {
		if (!editor) return;
		setEditor({ ...editor, draft: { ...editor.draft, value } });
	};

	const editorPopover = (target: EditorTarget, trigger: React.ReactElement) => {
		const isOpen = editor !== null && targetKey(editor.target) === targetKey(target);
		return (
			<Popover
				open={isOpen}
				onOpenChange={(open) => {
					if (!open) closeEditor();
				}}
			>
				<PopoverTrigger render={trigger} onClick={() => openEditor(target)} />
				{isOpen && editor && (
					// TODO(reui-rebuild): PopoverArrow has no analog in ui/popover.tsx (base-nova drops the arrow indicator entirely — no cn-popover-arrow style exists); dropped rather than invented.
					<PopoverContent side="right" align="start" sideOffset={8} className="w-80">
						<FilterEditorBody
							entityType={entityType}
							fields={fields}
							draft={editor.draft}
							onFieldChange={setDraftField}
							onOperatorChange={setDraftOperator}
							onValueChange={setDraftValue}
							onCancel={closeEditor}
							onApply={applyDraft}
							canApply={isDraftComplete(editor.draft)}
						/>
					</PopoverContent>
				)}
			</Popover>
		);
	};

	/** Dashed "+ Add filter" placeholder row inside a group — the only way to add a filter. */
	const addFilterRow = (groupIndex: number) =>
		editorPopover(
			{ kind: "add-rule", groupIndex },
			<button
				type="button"
				className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border/50 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
			>
				<Plus className="h-3 w-3" /> Add filter
			</button>
		);

	/**
	 * A group container card. `group` is undefined for the empty-state
	 * placeholder (no groups in state yet) — same visual, no remove button;
	 * its "+ Add filter" materializes the group on Apply.
	 */
	const groupCard = (group: ReportFilterGroup | undefined, groupIndex: number) => (
		<div key={groupIndex} className="rounded-lg border border-border/60 bg-muted/30">
			<div className="flex items-center justify-between gap-2 border-b border-border/40 px-2.5 py-1.5">
				<p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
					Group {groupIndex + 1}
					{group && group.rules.length > 1 && (
						<>
							<span className="font-normal">—</span>
							<Select
								value={group.logic}
								onValueChange={(v) =>
									updateGroup(groupIndex, { ...group, logic: v as "and" | "or" })
								}
							>
								<SelectTrigger className="h-6 w-16 px-2 py-0 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="and">all</SelectItem>
									<SelectItem value="or">any</SelectItem>
								</SelectContent>
							</Select>
							<span className="font-normal">of the following</span>
						</>
					)}
				</p>
				{group && (
					<button
						type="button"
						onClick={() => removeGroup(groupIndex)}
						className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
						aria-label="Remove filter group"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				)}
			</div>

			<div className="space-y-1.5 p-2.5">
				{group?.rules.map((rule, ruleIndex) => {
					const fieldDef = rule.field ? REPORT_FIELDS[entityType].fields[rule.field] : undefined;
					return (
						<div key={ruleIndex} className="group/rule relative">
							{editorPopover(
								{ kind: "edit-rule", groupIndex, ruleIndex },
								<button
									type="button"
									className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 pr-7 text-left transition-colors hover:border-border"
								>
									<p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
										{fieldDef?.label ?? rule.field}
									</p>
									<p className="truncate text-sm text-foreground">{ruleSummary(rule)}</p>
								</button>
							)}
							<button
								type="button"
								onClick={() => removeRule(groupIndex, ruleIndex)}
								className="absolute right-1.5 top-1.5 hidden rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive group-hover/rule:block"
								aria-label="Remove condition"
							>
								<Trash2 className="h-3.5 w-3.5" />
							</button>
						</div>
					);
				})}

				{(group?.rules.length ?? 0) < MAX_RULES_PER_GROUP && addFilterRow(groupIndex)}
			</div>
		</div>
	);

	/** Between-group connector carrying the top-level AND/OR. */
	const groupConnector = (key: string) => (
		<div key={key} className="flex items-center justify-center gap-2 px-4">
			<div className="h-px flex-1 bg-border/60" />
			<Select value={topLogic} onValueChange={(v) => setTopLogic(v as "and" | "or")}>
				<SelectTrigger
					aria-label="Match all or any group"
					className="h-6 w-[4.25rem] px-2 py-0 text-xs uppercase"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="and">AND</SelectItem>
					<SelectItem value="or">OR</SelectItem>
				</SelectContent>
			</Select>
			<div className="h-px flex-1 bg-border/60" />
		</div>
	);

	return (
		<div className="space-y-2">
			{groups.length === 0
				? groupCard(undefined, 0)
				: groups.flatMap((group, groupIndex) => [
						...(groupIndex > 0 ? [groupConnector(`connector-${groupIndex}`)] : []),
						groupCard(group, groupIndex),
					])}

			{groups.length > 0 && groups.length < MAX_GROUPS && (
				<button
					type="button"
					onClick={addGroup}
					className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/60 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
				>
					<Plus className="h-3.5 w-3.5" /> Add group
				</button>
			)}
		</div>
	);
}

function FilterEditorBody({
	entityType,
	fields,
	draft,
	onFieldChange,
	onOperatorChange,
	onValueChange,
	onCancel,
	onApply,
	canApply,
}: {
	entityType: ReportEntityType;
	fields: { key: string; def: ReportFieldDef }[];
	draft: ReportFilterRule;
	onFieldChange: (field: string) => void;
	onOperatorChange: (operator: ReportFilterOperator) => void;
	onValueChange: (value: string | number | boolean | undefined) => void;
	onCancel: () => void;
	onApply: () => void;
	canApply: boolean;
}) {
	const fieldDef = draft.field ? REPORT_FIELDS[entityType].fields[draft.field] : undefined;
	const operators = fieldDef ? operatorsForField(fieldDef) : [];
	const needsValue = !VALUELESS_OPERATORS.has(draft.operator);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-foreground">Filter by</h3>
				<button
					type="button"
					onClick={onCancel}
					className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="Close"
				>
					<X className="h-3.5 w-3.5" />
				</button>
			</div>

			<div className="space-y-1.5">
				<Select
					value={draft.field}
					onValueChange={(v) => {
						if (v) onFieldChange(v);
					}}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Field" />
					</SelectTrigger>
					<SelectContent>
						{fields.map((f) => (
							<SelectItem key={f.key} value={f.key}>
								{f.def.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={draft.operator}
					onValueChange={(v) => onOperatorChange(v as ReportFilterOperator)}
					disabled={!fieldDef}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Operator" />
					</SelectTrigger>
					<SelectContent>
						{operators.map((op) => (
							<SelectItem key={op} value={op}>
								{OPERATOR_LABELS[op]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{needsValue &&
					fieldDef &&
					(fieldDef.options ? (
						<Select
							value={typeof draft.value === "string" ? draft.value : ""}
							onValueChange={(value) => onValueChange(value ?? undefined)}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Value" />
							</SelectTrigger>
							<SelectContent>
								{fieldDef.options.map((opt) => (
									<SelectItem key={opt} value={opt}>
										{opt}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : fieldDef.type === "boolean" ? (
						<Select
							value={draft.value === false ? "false" : "true"}
							onValueChange={(value) => onValueChange(value === "true")}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="true">True</SelectItem>
								<SelectItem value="false">False</SelectItem>
							</SelectContent>
						</Select>
					) : fieldDef.type === "number" || fieldDef.type === "currency" ? (
						<Input
							type="number"
							value={typeof draft.value === "number" ? draft.value : ""}
							onChange={(e) =>
								onValueChange(e.target.value === "" ? undefined : Number(e.target.value))
							}
							placeholder="Value"
						/>
					) : (
						<Input
							type="text"
							value={typeof draft.value === "string" ? draft.value : ""}
							onChange={(e) => onValueChange(e.target.value)}
							placeholder="Value"
						/>
					))}
			</div>

			<div className="flex items-center justify-end gap-2 pt-1">
				<Button type="button" variant="ghost" size="sm" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="button" variant="default" size="sm" onClick={onApply} disabled={!canApply}>
					Apply
				</Button>
			</div>
		</div>
	);
}
