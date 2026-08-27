"use client";

import { useMemo, useState } from "react";
import { ListFilter, Plus, X } from "lucide-react";
import type { ReportEntityType } from "@onetool/backend/convex/lib/reportFields";
import type {
	ReportFilterRule,
	ReportFilters,
} from "@onetool/backend/convex/lib/reportFilters";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { reportFilterAdapter } from "./report-filter-adapter";
import {
	FilterEditorBody,
	ReportFiltersEditor,
	countFilterRules,
	isDraftComplete,
	sanitizeReportFilters,
} from "./report-filters-editor";

interface ReportFilterPillsProps {
	entityType: ReportEntityType;
	filters: ReportFilters | undefined;
	onChange: (filters: ReportFilters | undefined) => void;
}

function blankRule(): ReportFilterRule {
	return { field: "", operator: "equals", value: undefined };
}

/** True while the filter state fits the inline pill row: at most one all-of group. */
function isSimpleShape(filters: ReportFilters | undefined): boolean {
	if (!filters || filters.groups.length === 0) return true;
	return filters.groups.length === 1 && filters.groups[0].logic === "and";
}

/**
 * Plain-English recap of the active filters (the ConditionSentenceSummary
 * pattern): "Status equals Sent and Total is at least 500".
 */
function recapSentence(
	entityType: ReportEntityType,
	filters: ReportFilters | undefined
): string | null {
	const sanitized = sanitizeReportFilters(filters);
	if (!sanitized) return null;
	const adapter = reportFilterAdapter(entityType);
	if (sanitized.groups.length === 1) {
		const group = sanitized.groups[0];
		const joiner = group.logic === "and" ? " and " : " or ";
		return group.rules
			.map((r) => `${adapter.fieldLabel(r.field)} ${adapter.summarizeRule(r)}`)
			.join(joiner);
	}
	const total = sanitized.groups.reduce((sum, g) => sum + g.rules.length, 0);
	return `Matches ${sanitized.logic === "and" ? "all" : "any"} of ${
		sanitized.groups.length
	} groups (${total} filter${total === 1 ? "" : "s"})`;
}

/**
 * Rail filter surface (R9): inline pills for a single all-of group, an
 * Advanced sheet with the grouped AND/OR editor for everything else.
 */
export function ReportFilterPills({
	entityType,
	filters,
	onChange,
}: ReportFilterPillsProps) {
	const adapter = useMemo(() => reportFilterAdapter(entityType), [entityType]);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editing, setEditing] = useState<{
		index: number | "new";
		draft: ReportFilterRule;
	} | null>(null);

	const simple = isSimpleShape(filters);
	const rules = simple ? (filters?.groups[0]?.rules ?? []) : [];
	const advancedCount = countFilterRules(filters);
	const recap = recapSentence(entityType, filters);

	const commitRules = (nextRules: ReportFilterRule[]) => {
		onChange(
			nextRules.length === 0
				? undefined
				: { logic: "and", groups: [{ logic: "and", rules: nextRules }] }
		);
	};

	const applyDraft = () => {
		if (!editing || !isDraftComplete(editing.draft)) return;
		commitRules(
			editing.index === "new"
				? [...rules, editing.draft]
				: rules.map((r, i) => (i === editing.index ? editing.draft : r))
		);
		setEditing(null);
	};

	const removeRule = (index: number) => {
		commitRules(rules.filter((_, i) => i !== index));
	};

	const pillPopover = (
		index: number | "new",
		trigger: React.ReactElement,
		initial?: ReportFilterRule
	) => {
		const isOpen = editing !== null && editing.index === index;
		return (
			<Popover
				key={index}
				open={isOpen}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
			>
				<PopoverTrigger
					render={trigger}
					onClick={() => setEditing({ index, draft: initial ?? blankRule() })}
				/>
				{isOpen && editing && (
					<PopoverContent side="right" align="start" sideOffset={8} className="w-80">
						<FilterEditorBody
							adapter={adapter}
							draft={editing.draft}
							onDraftChange={(draft) => setEditing({ ...editing, draft })}
							onCancel={() => setEditing(null)}
							onApply={applyDraft}
							canApply={isDraftComplete(editing.draft)}
						/>
					</PopoverContent>
				)}
			</Popover>
		);
	};

	return (
		<div className="space-y-2">
			{simple ? (
				<div className="flex flex-wrap items-center gap-1.5">
					{rules.map((rule, index) => (
						<span key={index} className="group/pill inline-flex items-stretch">
							{pillPopover(
								index,
								<button
									type="button"
									className="inline-flex max-w-56 items-center gap-1 rounded-l-full border border-r-0 border-border/60 bg-muted/40 py-1 pl-2.5 pr-1 text-xs text-foreground transition-colors hover:bg-muted"
								>
									<span className="truncate">
										<span className="font-medium">
											{adapter.fieldLabel(rule.field)}
										</span>{" "}
										{adapter.summarizeRule(rule)}
									</span>
								</button>,
								rule
							)}
							<button
								type="button"
								onClick={() => removeRule(index)}
								aria-label={`Remove ${adapter.fieldLabel(rule.field)} filter`}
								className="rounded-r-full border border-l-0 border-border/60 bg-muted/40 py-1 pl-1 pr-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
							>
								<X className="h-3 w-3" />
							</button>
						</span>
					))}
					{pillPopover(
						"new",
						<button
							type="button"
							className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
						>
							<Plus className="h-3 w-3" /> Add filter
						</button>
					)}
				</div>
			) : (
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setSheetOpen(true)}
				>
					<ListFilter className="h-3.5 w-3.5" />
					Advanced filter ({advancedCount})
				</Button>
			)}

			{recap && (
				<p className="text-xs text-muted-foreground">{recap}</p>
			)}

			{simple && (
				<button
					type="button"
					onClick={() => setSheetOpen(true)}
					className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
				>
					Advanced filters…
				</button>
			)}

			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
					<SheetHeader>
						<SheetTitle>Advanced filters</SheetTitle>
						<SheetDescription>
							Combine up to 5 groups of rules with AND/OR logic.
						</SheetDescription>
					</SheetHeader>
					<div className="px-4 pb-6">
						<ReportFiltersEditor
							entityType={entityType}
							filters={filters}
							onChange={onChange}
						/>
					</div>
				</SheetContent>
			</Sheet>
		</div>
	);
}
