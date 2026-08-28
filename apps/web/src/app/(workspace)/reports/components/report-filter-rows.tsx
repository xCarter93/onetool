"use client";

import { Fragment, useMemo, useState } from "react";
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
	SheetTrigger,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { reportFilterAdapter } from "./report-filter-adapter";
import {
	countFilterRules,
	sanitizeReportFilters,
	MAX_RULES_PER_GROUP,
} from "./report-filter-model";
import { FilterRuleControls } from "./report-filter-rule-controls";
import { ReportFiltersEditor } from "./report-filters-editor";

function blankRule(): ReportFilterRule {
	return { field: "", operator: "equals", value: undefined };
}

interface ReportFilterRowsProps {
	entityType: ReportEntityType;
	filters: ReportFilters | undefined;
	onChange: (filters: ReportFilters | undefined) => void;
}

/**
 * Rail filter surface (§8 d15 F5): compact field/operator/value rows for a
 * single group, collapsing to `Advanced filter (N)` once the saved config needs
 * more than one. The And/Or connector is global — one v2 group, one logic.
 */
export function ReportFilterRows({
	entityType,
	filters,
	onChange,
}: ReportFilterRowsProps) {
	const adapter = useMemo(() => reportFilterAdapter(entityType), [entityType]);
	const [pendingRow, setPendingRow] = useState(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);

	const sanitized = sanitizeReportFilters(filters);
	const isAdvanced = (sanitized?.groups.length ?? 0) > 1;
	// The grouped editor leaves emptied groups in place, so the one group worth
	// showing isn't always index 0 — reading blindly would hide live rules.
	const compactGroup =
		filters?.groups.find((g) => g.rules.length > 0) ?? filters?.groups[0];
	const rules = compactGroup?.rules ?? [];
	const logic = compactGroup?.logic ?? "and";

	// Compact mode owns the whole value: one group, one logic.
	const commit = (nextRules: ReportFilterRule[], nextLogic = logic) => {
		onChange(
			nextRules.length === 0
				? undefined
				: { logic: "and", groups: [{ logic: nextLogic, rules: nextRules }] }
		);
	};

	const advancedHost = (
		<AdvancedFilterHost
			entityType={entityType}
			filters={filters}
			onChange={onChange}
			open={advancedOpen}
			onOpenChange={setAdvancedOpen}
			collapsed={isAdvanced}
			count={countFilterRules(filters)}
		/>
	);

	if (isAdvanced) {
		// A half-filled row belongs to compact mode; leaving it drops the row.
		if (pendingRow) setPendingRow(false);
		return advancedHost;
	}

	const connector = (key: string) => (
		<div key={key} className="flex items-center gap-2 py-0.5 pl-2">
			<button
				type="button"
				onClick={() => commit(rules, logic === "and" ? "or" : "and")}
				className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
			>
				{logic === "and" ? "And" : "Or"}
			</button>
			<div className="h-px flex-1 bg-border/50" />
		</div>
	);

	const removeButton = (label: string, onClick: () => void) => (
		<button
			type="button"
			onClick={onClick}
			aria-label={`Remove ${label} filter`}
			className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
		>
			<X className="h-3.5 w-3.5" />
		</button>
	);

	return (
		<div className="space-y-1.5">
			{rules.map((rule, index) => (
				<Fragment key={index}>
					{index > 0 && connector(`connector-${index}`)}
					<FilterRuleControls
						entityType={entityType}
						adapter={adapter}
						rule={rule}
						onChange={(next) =>
							commit(rules.map((r, i) => (i === index ? next : r)))
						}
						trailing={removeButton(
							rule.field ? adapter.fieldLabel(rule.field) : "filter",
							() => commit(rules.filter((_, i) => i !== index))
						)}
					/>
				</Fragment>
			))}

			{pendingRow && (
				<Fragment>
					{rules.length > 0 && connector("connector-pending")}
					<FilterRuleControls
						entityType={entityType}
						adapter={adapter}
						rule={blankRule()}
						autoOpen
						onChange={(next) => {
							setPendingRow(false);
							commit([...rules, next]);
						}}
						trailing={removeButton("filter", () => setPendingRow(false))}
					/>
				</Fragment>
			)}

			<div className="flex items-center justify-between gap-2 pt-0.5">
				{rules.length < MAX_RULES_PER_GROUP && !pendingRow ? (
					<button
						type="button"
						onClick={() => setPendingRow(true)}
						className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<Plus className="h-3 w-3" /> Add filter
					</button>
				) : (
					<span />
				)}
				{advancedHost}
			</div>
		</div>
	);
}

/**
 * Hosts the grouped editor: a popover opening left of the 440px rail on wide
 * screens, the sheet on narrow ones where the rail stacks under the canvas.
 */
function AdvancedFilterHost({
	entityType,
	filters,
	onChange,
	open,
	onOpenChange,
	collapsed,
	count,
}: ReportFilterRowsProps & {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	collapsed: boolean;
	count: number;
}) {
	const isDesktop = useMediaQuery("(min-width: 1024px)") ?? true;

	const trigger = collapsed ? (
		<Button type="button" variant="outline" size="sm" className="w-full justify-start">
			<ListFilter className="h-3.5 w-3.5" />
			Advanced filter ({count})
		</Button>
	) : (
		<button
			type="button"
			className="rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		>
			Advanced filters
		</button>
	);

	const body = (
		<ReportFiltersEditor
			entityType={entityType}
			filters={filters}
			onChange={onChange}
		/>
	);

	if (isDesktop) {
		return (
			<Popover open={open} onOpenChange={onOpenChange}>
				<PopoverTrigger render={trigger} />
				{open && (
					<PopoverContent
						side="left"
						align="start"
						sideOffset={12}
						className="max-h-[70vh] w-[36rem] max-w-[calc(100vw-2rem)] overflow-y-auto"
					>
						{body}
					</PopoverContent>
				)}
			</Popover>
		);
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetTrigger render={trigger} />
			<SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>Advanced filters</SheetTitle>
					<SheetDescription>
						Combine up to 5 groups of rules with AND/OR logic.
					</SheetDescription>
				</SheetHeader>
				<div className="px-4 pb-6">{body}</div>
			</SheetContent>
		</Sheet>
	);
}
