"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	ArrowLeft,
	ChartColumn,
	Filter,
	ListTree,
	Save,
	Sparkles,
	X,
} from "lucide-react";
import { DateRange } from "react-day-picker";
import {
	getReportDateField,
	isGenericGroupBy,
	REPORT_FIELDS,
} from "@onetool/backend/convex/lib/reportFields";
import type { ReportFilters } from "@onetool/backend/convex/lib/reportFilters";
import { cn } from "@/lib/utils";
import { useAssistantOpener } from "@/components/assistant/assistant-opener-context";
import { useRegisterReportConfigApply } from "@/components/assistant/report-config-apply-context";
import { usePublishScreenContext } from "@/components/assistant/use-screen-context";
import type { BuilderReportConfig } from "@onetool/backend/convex/reportConfigGeneration";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import {
	StyledMultiSelector,
	StyledTabs,
	StyledTabsContent,
	StyledTabsList,
	StyledTabsTrigger,
} from "@/components/ui/styled";
import { StyledButton } from "@/components/ui/styled/styled-button";
import DatePickerRange from "@/components/shared/date-picker-range";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ReportPreview } from "./report-preview";
import {
	ReportFiltersEditor,
	countFilterRules,
	sanitizeReportFilters,
} from "./report-filters-editor";
import {
	dateRangeOptions,
	dateRangeToBuilderState,
	effectiveDetailColumns,
	entityOptions,
	getDateRange,
	groupByOptions,
	isDetailModeActive,
	resolveReportQueryArgs,
	visualizationOptions,
	type EntityType,
	type ReportConfigShape,
	type ReportMeasure,
	type ReportSavedConfigShape,
	type VizType,
} from "../report-config";

/** Select sentinel for "no grouping" — Radix Select can't take an empty/undefined value. */
const NO_GROUP_BY = "__none__";

/** Flattened "Measure" options for the current entity: count + sum/avg/min/max per numeric field. */
function measureOptionsFor(
	entityType: EntityType
): { value: string; label: string; measure: ReportMeasure }[] {
	const options: { value: string; label: string; measure: ReportMeasure }[] = [
		{ value: "count", label: "Count of records", measure: { op: "count" } },
	];
	const opLabels: { op: "sum" | "avg" | "min" | "max"; label: string }[] = [
		{ op: "sum", label: "Sum" },
		{ op: "avg", label: "Average" },
		{ op: "min", label: "Min" },
		{ op: "max", label: "Max" },
	];
	for (const [field, def] of Object.entries(REPORT_FIELDS[entityType].fields)) {
		if (def.type !== "number" && def.type !== "currency") continue;
		for (const { op, label } of opLabels) {
			options.push({
				value: `${op}:${field}`,
				label: `${label} of ${def.label}`,
				measure: { op, field },
			});
		}
	}
	return options;
}

function measureToValue(measure: ReportMeasure): string {
	return measure.op === "count" ? "count" : `${measure.op}:${measure.field}`;
}

export interface ReportBuilderInitial {
	name: string;
	description: string;
	entityType: EntityType;
	groupBy: string | undefined;
	vizType: VizType;
	dateRangePreset: string;
	customDateRange?: DateRange;
	filters?: ReportFilters;
	measure?: ReportMeasure;
	columns?: string[];
}

export interface ReportBuilderSavePayload {
	name: string;
	description?: string;
	config: ReportSavedConfigShape;
	visualization: { type: VizType };
}

/** Saved-report `config.filters` is v.any() — legacy rows may carry junk. Defensive shape check before hydrating. */
export function isValidReportFilters(value: unknown): value is ReportFilters {
	if (!value || typeof value !== "object") return false;
	const v = value as { logic?: unknown; groups?: unknown };
	if (v.logic !== "and" && v.logic !== "or") return false;
	if (!Array.isArray(v.groups)) return false;
	return v.groups.every((g) => {
		if (!g || typeof g !== "object") return false;
		const group = g as { logic?: unknown; rules?: unknown };
		if (group.logic !== "and" && group.logic !== "or") return false;
		if (!Array.isArray(group.rules)) return false;
		return group.rules.every(
			(r) => r && typeof r === "object" && typeof (r as { field?: unknown }).field === "string"
		);
	});
}

interface ReportBuilderProps {
	mode: "create" | "edit";
	initial: ReportBuilderInitial;
	saving: boolean;
	onSave: (payload: ReportBuilderSavePayload) => void | Promise<void>;
	onBack: () => void;
}

export function ReportBuilder({
	mode,
	initial,
	saving,
	onSave,
	onBack,
}: ReportBuilderProps) {
	const [name, setName] = useState(initial.name);
	const [description, setDescription] = useState(initial.description);
	const [entityType, setEntityType] = useState<EntityType>(initial.entityType);
	const [groupBy, setGroupBy] = useState<string | undefined>(initial.groupBy);
	const [vizType, setVizType] = useState<VizType>(initial.vizType);
	const [dateRangePreset, setDateRangePreset] = useState(initial.dateRangePreset);
	const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(
		initial.customDateRange
	);
	const [filters, setFilters] = useState<ReportFilters | undefined>(initial.filters);
	const [measure, setMeasure] = useState<ReportMeasure>(initial.measure ?? { op: "count" });
	const [columns, setColumns] = useState<string[]>(initial.columns ?? []);
	const [configTab, setConfigTab] = useState<"outline" | "filters">("outline");

	const openAssistant = useAssistantOpener();

	const effectiveDateRange = () => {
		if (dateRangePreset === "custom" && customDateRange) {
			return {
				start: customDateRange.from?.getTime(),
				end: customDateRange.to
					? new Date(customDateRange.to).setHours(23, 59, 59, 999)
					: undefined,
			};
		}
		return getDateRange(dateRangePreset);
	};

	const sanitizedFilters = useMemo(() => sanitizeReportFilters(filters), [filters]);
	const activeFilterCount = useMemo(() => countFilterRules(filters), [filters]);
	const aggregation = measure.op === "count" ? undefined : measure;
	// Non-count measures only work when groupBy is None or generic-safe — a
	// legacy-only groupBy (e.g. invoices "month") only ever ran through the
	// hardcoded dispatch, which ignores measures entirely.
	const groupByIsGenericSafe = !groupBy || isGenericGroupBy(entityType, groupBy);
	const availableMeasureOptions = groupByIsGenericSafe
		? measureOptionsFor(entityType)
		: measureOptionsFor(entityType).filter((o) => o.value === "count");
	const detailModeActive = isDetailModeActive(vizType, groupBy, columns);
	// What the Columns checklist actually shows as checked: the user's raw
	// selection, or the per-entity default once detail mode is implied by
	// Group by = None (so the checklist and the table never disagree).
	const displayColumns = detailModeActive ? effectiveDetailColumns(entityType, columns) : columns;

	const config: ReportConfigShape = {
		entityType,
		groupBy: groupBy ? [groupBy] : undefined,
		dateRange: effectiveDateRange(),
		filters: sanitizedFilters,
		aggregation,
		columns: columns.length ? columns : undefined,
	};

	// Agent sees what the user sees: the assistant's configureReport tool
	// relays this as currentConfig so a request modifies the open draft
	// instead of starting over.
	usePublishScreenContext(() => ({
		reportBuilderConfig: {
			entityType,
			groupBy: groupBy ?? null,
			visualization: vizType,
			dateRange: effectiveDateRange() ?? null,
			filters: sanitizedFilters ?? null,
			measure,
			columns: columns.length ? columns : null,
			name: name || null,
		},
	}));

	// Client-executed configureReport: the panel forwards the validated
	// config here (navigate-tool pattern); the user reviews, then saves.
	useRegisterReportConfigApply((applied: BuilderReportConfig) => {
		setEntityType(applied.entityType);
		setGroupBy(applied.groupBy ?? undefined);
		setVizType(applied.visualization);
		const { preset, customRange } = dateRangeToBuilderState(applied.dateRange);
		setDateRangePreset(preset);
		setCustomDateRange(customRange);
		setFilters(applied.filters ?? undefined);
		setMeasure(
			applied.measure && applied.measure.op !== "count" && applied.measure.field
				? { op: applied.measure.op, field: applied.measure.field }
				: { op: "count" }
		);
		setColumns(applied.columns ?? []);
		if (applied.name) setName(applied.name);
		// null description = "unchanged" — the model omits rather than clears.
		if (applied.description !== null) setDescription(applied.description);
	});

	// Drives the footer summary; Convex dedupes this against ReportPreview's
	// identical subscription, so there's no extra fetch.
	const queryArgs = useDebouncedValue(resolveReportQueryArgs(config, vizType), 300);
	const reportData = useQuery(api.reportData.executeReport, queryArgs);

	const groupByLabel = groupBy
		? (groupByOptions[entityType]?.find((o) => o.value === groupBy)?.label ?? groupBy)
		: undefined;
	// Which field the date range filters — from the registry, except the legacy
	// invoice revenue group-bys (month/client), which actually filter on paidAt.
	const dateFieldHint = (() => {
		if (entityType === "invoices" && (groupBy === "month" || groupBy === "client")) {
			return "paid date";
		}
		const field = getReportDateField(entityType);
		if (field === "_creationTime") return "record creation date";
		return REPORT_FIELDS[entityType].fields[field]?.label.toLowerCase() ?? field;
	})();
	const rangeLabel =
		dateRangeOptions.find((o) => o.value === dateRangePreset)?.label ?? "All Time";

	const handleSave = () => {
		if (!name.trim()) return;
		void onSave({
			name: name.trim(),
			description: description.trim() || undefined,
			config: {
				entityType,
				groupBy: groupBy ? [groupBy] : undefined,
				dateRange: effectiveDateRange(),
				filters: sanitizedFilters,
				aggregations:
					measure.op === "count"
						? undefined
						: [{ field: measure.field, operation: measure.op }],
				columns: columns.length ? columns : undefined,
			},
			visualization: { type: vizType },
		});
	};

	return (
		<div className="flex flex-col lg:h-[calc(100svh-1.75rem)] lg:overflow-hidden">
			{/* Top strip — spans rail + canvas; pt clears the header notch (~48px) */}
			<div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 pb-3 pt-3 lg:pt-7">
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={onBack}
					aria-label={mode === "edit" ? "Cancel editing" : "Back to reports"}
				>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<div className="flex min-w-0 flex-1 flex-col justify-center">
					<input
						aria-label="Report name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Untitled report"
						className="w-full rounded-md bg-transparent px-1.5 py-0.5 text-lg font-semibold text-foreground transition-colors placeholder:text-muted-foreground/60 hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
					/>
					<input
						aria-label="Report description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Add a description..."
						className="w-full border-none bg-transparent px-1.5 text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
					/>
				</div>
				<AddChartControl value={vizType} groupBy={groupBy} onChange={setVizType} />
				<StyledButton
					intent="primary"
					size="sm"
					showArrow={false}
					onClick={handleSave}
					disabled={!name.trim() || saving}
					isLoading={saving}
					icon={<Save className="h-4 w-4" />}
				>
					{mode === "edit" ? "Save changes" : "Save report"}
				</StyledButton>
			</div>

			{/* Body — config rail + chart canvas */}
			<div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
				{/* Config rail */}
				<aside className="flex shrink-0 flex-col gap-6 border-b border-border/60 bg-background/50 px-4 py-5 lg:h-full lg:w-80 lg:overflow-y-auto lg:border-b-0 lg:border-r">
					{/* Outline / Filters tab strip */}
					<StyledTabs
						value={configTab}
						onValueChange={(v) => setConfigTab(v as "outline" | "filters")}
					>
						<StyledTabsList className="w-full">
							<StyledTabsTrigger value="outline">
								<ListTree className="size-3.5" />
								Outline
							</StyledTabsTrigger>
							<StyledTabsTrigger value="filters">
								<Filter className="size-3.5" />
								Filters
								{activeFilterCount > 0 && (
									<span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-semibold text-primary">
										{activeFilterCount}
									</span>
								)}
							</StyledTabsTrigger>
						</StyledTabsList>

						<StyledTabsContent value="outline" className="mt-4 space-y-4">
							<div className="space-y-1.5">
								<Label className="text-xs">Source</Label>
								<Select
									value={entityType}
									onValueChange={(v) => {
										if (!v) return;
										setEntityType(v as EntityType);
										const first = groupByOptions[v]?.[0]?.value;
										if (first) setGroupBy(first);
										setFilters(undefined);
										setMeasure({ op: "count" });
										setColumns([]);
									}}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{entityOptions.map((opt) => {
											const Icon = opt.icon;
											return (
												<SelectItem key={opt.value} value={opt.value}>
													<span className="flex items-center gap-2">
														<Icon className="h-4 w-4 text-muted-foreground" />
														{opt.label}
													</span>
												</SelectItem>
											);
										})}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-1.5">
								<Label className="text-xs">Date range</Label>
								<Select
									value={dateRangePreset}
									onValueChange={(value) => {
										if (!value) return;
										setDateRangePreset(value);
										if (value !== "custom") setCustomDateRange(undefined);
									}}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{dateRangeOptions.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{dateRangePreset === "custom" && (
									<DatePickerRange
										value={customDateRange}
										onChange={setCustomDateRange}
										showArrow={false}
									/>
								)}
								<p className="text-xs text-muted-foreground">
									Filters {entityType} by {dateFieldHint}
								</p>
							</div>

							<div className="space-y-1.5">
								<Label className="text-xs">Group by</Label>
								<Select
									value={groupBy ?? NO_GROUP_BY}
									onValueChange={(v) => {
										if (!v) return;
										const next = v === NO_GROUP_BY ? undefined : v;
										setGroupBy(next);
										// A legacy-only groupBy only ever ran through the hardcoded
										// dispatch (which ignores measures) — coerce back to count
										// here rather than in an effect (this repo lints
										// set-state-in-effect).
										if (next && !isGenericGroupBy(entityType, next) && measure.op !== "count") {
											setMeasure({ op: "count" });
										}
										// Charts require a groupBy (Slice 3-D3) — dropping to "None"
										// while a chart is active leaves nothing to chart above the
										// table, so fall back to table here rather than in an effect.
										if (!next && vizType !== "table") {
											setVizType("table");
										}
									}}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_GROUP_BY}>None (raw rows)</SelectItem>
										{groupByOptions[entityType]?.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-1.5">
								<Label className="text-xs">Measure</Label>
								<Select
									value={measureToValue(measure)}
									onValueChange={(v) => {
										const opt = availableMeasureOptions.find((o) => o.value === v);
										if (opt) setMeasure(opt.measure);
									}}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{availableMeasureOptions.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{!groupByIsGenericSafe && (
									<p className="text-xs text-muted-foreground">
										This grouping only supports record counts.
									</p>
								)}
							</div>

							<div className={cn("space-y-1.5", vizType !== "table" && "opacity-60")}>
								<Label className="text-xs">Columns</Label>
								<StyledMultiSelector
									options={Object.entries(REPORT_FIELDS[entityType].fields).map(
										([field, def]) => ({ label: def.label, value: field })
									)}
									value={displayColumns}
									onValueChange={(vals) =>
										// Keep table column order stable in registry order,
										// regardless of the order fields were picked in.
										setColumns(
											Object.keys(REPORT_FIELDS[entityType].fields).filter((f) =>
												vals.includes(f)
											)
										)
									}
									placeholder="Select columns"
									maxCount={2}
									className="w-full"
								/>
								<p className="text-xs text-muted-foreground">
									Columns appear in the table view.
								</p>
							</div>
						</StyledTabsContent>

						<StyledTabsContent value="filters" className="mt-4">
							<ReportFiltersEditor
								entityType={entityType}
								filters={filters}
								onChange={setFilters}
							/>
						</StyledTabsContent>
					</StyledTabs>

					{/* NL report building lives in the assistant panel (createReport tool). */}
					{openAssistant && (
						<section className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
							<Button
								variant="outline"
								size="sm"
								onClick={openAssistant}
								className="w-full"
							>
								<Sparkles className="h-4 w-4 text-primary" data-slot="icon" />
								Ask AI
							</Button>
							<p className="text-xs text-muted-foreground">
								Describe the report you want — the assistant builds and
								saves it for you.
							</p>
						</section>
					)}
				</aside>

				{/* Chart canvas */}
				<main className="flex min-w-0 flex-1 flex-col lg:h-full lg:overflow-hidden">
					<div className="flex-1 overflow-auto bg-muted/20 p-4 sm:p-8">
						<div className="flex min-h-full w-full flex-col rounded-2xl border border-border/60 bg-background p-5 shadow-sm sm:p-7">
							<ReportPreview config={config} visualization={{ type: vizType }} />
						</div>
					</div>

					{/* Status bar */}
					<div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
						<span>
							{reportData === undefined
								? "Loading…"
								: reportData.detail
									? `${reportData.detail.totalMatched.toLocaleString()} ${
											reportData.detail.totalMatched === 1 ? "record" : "records"
										}`
									: reportData.data.length === 0
										? "No data for this selection"
										: `${reportData.data.length} ${
												reportData.data.length === 1 ? "group" : "groups"
											}${groupByLabel ? ` · grouped by ${groupByLabel}` : ""}`}
						</span>
						<span>{rangeLabel}</span>
					</div>
				</main>
			</div>
		</div>
	);
}

/** The six chart types, excluding "table" (table is the base layer, not a pickable "chart"). */
const chartVizOptions = visualizationOptions.filter((o) => o.value !== "table");

/**
 * Salesforce-style "Add chart" control (Slice 3-D3): the table is always the
 * base layer; this is how the user opts a chart in ABOVE it. Disabled
 * without a Group by — a chart needs something to aggregate on. Once a
 * chart is active, the trigger shows that chart's icon/label and the
 * popover gains a "Remove chart" row that drops back to table.
 */
export function AddChartControl({
	value,
	groupBy,
	onChange,
}: {
	value: VizType;
	groupBy: string | undefined;
	onChange: (v: VizType) => void;
}) {
	const [open, setOpen] = useState(false);
	const isChartActive = value !== "table";
	const disabled = !groupBy;
	const active = isChartActive ? visualizationOptions.find((o) => o.value === value) : undefined;
	const TriggerIcon = active?.icon ?? ChartColumn;
	const triggerLabel = active?.label ?? "Add chart";

	const select = (viz: VizType) => {
		onChange(viz);
		setOpen(false);
	};

	return (
		<div className="flex items-center gap-2">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<StyledButton
							intent="outline"
							size="sm"
							showArrow={false}
							disabled={disabled}
							icon={<TriggerIcon className="h-4 w-4" />}
							title={disabled ? "Group your data to add a chart." : undefined}
						/>
					}
				>
					{triggerLabel}
				</PopoverTrigger>
				{/* TODO(reui-rebuild): PopoverArrow has no analog in ui/popover.tsx (base-nova drops the arrow indicator entirely — no cn-popover-arrow style exists); dropped rather than invented. */}
				<PopoverContent side="bottom" align="end" sideOffset={8} className="w-60">
					<div className="grid grid-cols-3 gap-1.5">
						{chartVizOptions.map((opt) => {
							const Icon = opt.icon;
							const isActive = value === opt.value;
							return (
								<button
									key={opt.value}
									type="button"
									aria-pressed={isActive}
									onClick={() => select(opt.value)}
									className={cn(
										"flex flex-col items-center gap-1 rounded-md px-2 py-2.5 text-xs font-medium transition-colors",
										isActive
											? "bg-primary/10 text-primary ring-1 ring-primary/30"
											: "text-muted-foreground hover:bg-muted hover:text-foreground"
									)}
								>
									<Icon className="h-4 w-4" />
									{opt.label}
								</button>
							);
						})}
					</div>
					{isChartActive && (
						<>
							<div className="my-2 border-t border-border/60" />
							<button
								type="button"
								onClick={() => select("table")}
								className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
							>
								<X className="h-3.5 w-3.5" />
								Remove chart
							</button>
						</>
					)}
				</PopoverContent>
			</Popover>
			{disabled && (
				<span className="hidden text-xs text-muted-foreground/70 md:inline">
					Group your data to add a chart.
				</span>
			)}
		</div>
	);
}
