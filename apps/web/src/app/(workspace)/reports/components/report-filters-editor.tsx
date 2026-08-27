"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { ReportEntityType } from "@onetool/backend/convex/lib/reportFields";
import type {
	ReportFilterGroup,
	ReportFilterOperator,
	ReportFilterRule,
	ReportFilters,
} from "@onetool/backend/convex/lib/reportFilters";
import type { FilterAdapter } from "@/components/shared/filter-adapter";
import { Button } from "@/components/ui/button";
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
import { reportFilterAdapter, VALUELESS_OPERATORS } from "./report-filter-adapter";

const MAX_GROUPS = 5;
const MAX_RULES_PER_GROUP = 8;

function blankRule(): ReportFilterRule {
	return { field: "", operator: "equals", value: undefined };
}

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

/** Total complete filter rules — drives the Filters section badge count. */
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
	const adapter = useMemo(() => reportFilterAdapter(entityType), [entityType]);
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

	const editorPopover = (target: EditorTarget, trigger: React.ReactElement) => {
		const isOpen = editor !== null && targetKey(editor.target) === targetKey(target);
		return (
			<Popover
				open={isOpen}
				onOpenChange={(open) => {
					if (!open) closeEditor();
				}}
			>
				<PopoverTrigger
					render={trigger}
					onClick={() =>
						openEditor(
							target,
							target.kind === "edit-rule"
								? groups[target.groupIndex]?.rules[target.ruleIndex]
								: undefined
						)
					}
				/>
				{isOpen && editor && (
					// TODO(reui-rebuild): PopoverArrow has no analog in ui/popover.tsx (base-nova drops the arrow indicator entirely — no cn-popover-arrow style exists); dropped rather than invented.
					<PopoverContent side="right" align="start" sideOffset={8} className="w-80">
						<FilterEditorBody
							adapter={adapter}
							draft={editor.draft}
							onDraftChange={(draft) => setEditor({ ...editor, draft })}
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
				{group?.rules.map((rule, ruleIndex) => (
					<div key={ruleIndex} className="group/rule relative">
						{editorPopover(
							{ kind: "edit-rule", groupIndex, ruleIndex },
							<button
								type="button"
								className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 pr-7 text-left transition-colors hover:border-border"
							>
								<p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
									{adapter.fieldLabel(rule.field)}
								</p>
								<p className="truncate text-sm text-foreground">
									{adapter.summarizeRule(rule)}
								</p>
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
				))}

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

/** Field → operator → value draft form; shared by the grouped editor and the rail pills popovers. */
export function FilterEditorBody({
	adapter,
	draft,
	onDraftChange,
	onCancel,
	onApply,
	canApply,
}: {
	adapter: FilterAdapter;
	draft: ReportFilterRule;
	onDraftChange: (draft: ReportFilterRule) => void;
	onCancel: () => void;
	onApply: () => void;
	canApply: boolean;
}) {
	const operators = draft.field ? adapter.operatorsFor(draft.field) : [];
	const needsValue = adapter.needsValue(draft.operator);

	const setField = (field: string) => {
		const operator = adapter.defaultOperatorFor(field);
		onDraftChange({
			field,
			operator: operator as ReportFilterOperator,
			value: adapter.needsValue(operator)
				? adapter.defaultValueFor(field)
				: undefined,
		});
	};

	const setOperator = (operator: string) => {
		// A timestamp value encodes the OLD operator's day boundary — force a re-pick.
		const staleValue = adapter.valueDependsOnOperator(draft.field);
		onDraftChange({
			...draft,
			operator: operator as ReportFilterOperator,
			value: adapter.needsValue(operator)
				? staleValue
					? undefined
					: (draft.value ?? adapter.defaultValueFor(draft.field))
				: undefined,
		});
	};

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
						if (v) setField(v);
					}}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Field" />
					</SelectTrigger>
					<SelectContent>
						{adapter.fields.map((f) => (
							<SelectItem key={f.value} value={f.value}>
								{f.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={draft.operator}
					onValueChange={(v) => {
						if (v) setOperator(v);
					}}
					disabled={!draft.field}
				>
					<SelectTrigger className="w-full">
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

				{needsValue &&
					draft.field &&
					adapter.renderValue({
						field: draft.field,
						operator: draft.operator,
						value: draft.value,
						onChange: (value) => onDraftChange({ ...draft, value }),
					})}
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
