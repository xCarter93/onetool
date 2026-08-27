"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	ArrowLeft,
	ChartColumn,
	Filter,
	ListTree,
	Loader2,
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
import { MultiSelector } from "@/components/shared/multi-selector";
import {
	PillTabs,
	PillTabsContent,
	PillTabsList,
	PillTabsTrigger,
} from "@/components/shared/pill-tabs";
import DatePickerRange from "@/components/shared/date-picker-range";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ReportPreview } from "./report-preview";
import {
	ReportFiltersEditor,
	countFilterRules,
	sanitizeReportFilters,
} from "./report-filters-editor";
import {
	builderStateToSaved,
	dateRangeOptions,
	effectiveDetailColumns,
	entityOptions,
	groupByOptions,
	isDetailModeActive,
	resolveReportQueryArgs,
	savedToBuilderState,
	visualizationOptions,
	type BuilderConfigState,
	type EntityType,
	type ReportConfigV2,
	type ReportMeasure,
	type ReportMetric,
	type ReportVisualization,
	type VisualizationOptions,
	type VizType,
} from "../report-config";
import type { ReportConfig as ReportDocConfig } from "@onetool/backend/convex/lib/reportConfig";

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

function measureToValue(metric: ReportMetric): string {
	if (metric.op === "count") return "count";
	// Ratio/related metrics (hydrated from presets/AI) have no Measure option
	// until R8b's full picker — the select shows its placeholder.
	if (metric.op === "ratio" || metric.op === "related") return "";
	return `${metric.op}:${metric.field}`;
}

export interface ReportBuilderInitial {
	name: string;
	description: string;
	/** Either config version — v1 rows expand through the normalizer on hydrate. */
	config: ReportDocConfig;
	visualization: ReportVisualization;
}

export interface ReportBuilderSavePayload {
	name: string;
	description?: string;
	config: ReportConfigV2;
	visualization: ReportVisualization;
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
	// Hydrated once — useState initializers only read the first render's value.
	const [init] = useState(() =>
		savedToBuilderState(initial.config, initial.visualization)
	);
	const [name, setName] = useState(initial.name);
	const [description, setDescription] = useState(initial.description);
	const [entityType, setEntityType] = useState<EntityType>(init.entityType);
	const [groupBy, setGroupBy] = useState<string | undefined>(init.groupBy);
	const [vizType, setVizType] = useState<VizType>(init.vizType);
	const [dateRangePreset, setDateRangePreset] = useState(init.dateRangePreset);
	const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(
		init.customDateRange
	);
	// R8a fidelity state: no rail controls yet (dateField/segmentBy arrive at
	// R8b, vizOptions at R9), but hydration/apply/save must round-trip them.
	const [dateField, setDateField] = useState<string | undefined>(init.dateField);
	const [segmentBy, setSegmentBy] = useState<string | undefined>(init.segmentBy);
	const [includeEmptyValues, setIncludeEmptyValues] = useState<boolean | undefined>(
		init.includeEmptyValues
	);
	const [vizOptions, setVizOptions] = useState<VisualizationOptions | undefined>(
		init.vizOptions
	);
	const [filters, setFilters] = useState<ReportFilters | undefined>(init.filters);
	const [metric, setMetric] = useState<ReportMetric>(init.metric);
	const [columns, setColumns] = useState<string[]>(init.columns);
	const [configTab, setConfigTab] = useState<"outline" | "filters">("outline");

	const openAssistant = useAssistantOpener();

	const sanitizedFilters = useMemo(() => sanitizeReportFilters(filters), [filters]);
	const activeFilterCount = useMemo(() => countFilterRules(filters), [filters]);
	// Non-count measures only work when groupBy is None or generic-safe — a
	// legacy-only groupBy (e.g. invoices "month") only ever ran through the
	// hardcoded dispatch, which ignores measures entirely.
	const groupByIsGenericSafe = !groupBy || isGenericGroupBy(entityType, groupBy);
	const availableMeasureOptions = groupByIsGenericSafe
		? measureOptionsFor(entityType)
		: measureOptionsFor(entityType).filter((o) => o.value === "count");

	const builderState: BuilderConfigState = {
		entityType,
		dateField,
		dateRangePreset,
		customDateRange,
		filters: sanitizedFilters,
		metric,
		groupBy,
		segmentBy,
		includeEmptyValues,
		columns,
		vizType,
		vizOptions,
	};
	// One construction feeds save, preview, the status bar, and the published
	// assistant context — what the user sees is exactly what persists.
	const saved = builderStateToSaved(builderState);

	const detailModeActive = isDetailModeActive(saved.config, vizType);
	// What the Columns checklist actually shows as checked: the user's raw
	// selection, or the per-entity default once detail mode is implied by
	// Group by = None (so the checklist and the table never disagree).
	const displayColumns = detailModeActive ? effectiveDetailColumns(entityType, columns) : columns;

	// Agent sees what the user sees: the assistant's configureReport tool
	// relays this as currentConfig so a request modifies the open draft
	// instead of starting over.
	usePublishScreenContext(() => ({
		reportBuilderConfig: {
			config: saved.config,
			visualization: saved.visualization,
			name: name || null,
		},
	}));

	// Client-executed configureReport: the panel forwards the validated
	// config here (navigate-tool pattern); the user reviews, then saves.
	useRegisterReportConfigApply((applied: BuilderReportConfig) => {
		const next = savedToBuilderState(applied.config, applied.visualization);
		setEntityType(next.entityType);
		setGroupBy(next.groupBy);
		setVizType(next.vizType);
		setDateRangePreset(next.dateRangePreset);
		setCustomDateRange(next.customDateRange);
		setDateField(next.dateField);
		setSegmentBy(next.segmentBy);
		setIncludeEmptyValues(next.includeEmptyValues);
		setVizOptions(next.vizOptions);
		setFilters(next.filters);
		setMetric(next.metric);
		setColumns(next.columns);
		if (applied.name) setName(applied.name);
		// Omitted description = "unchanged" — the model leaves it out rather than clearing.
		if (applied.description !== undefined) setDescription(applied.description);
	});

	// Drives the footer summary; Convex dedupes this against ReportPreview's
	// identical subscription, so there's no extra fetch.
	const queryArgs = useDebouncedValue(
		resolveReportQueryArgs(saved.config, saved.visualization),
		300
	);
	const reportData = useQuery(api.reportData.executeReport, queryArgs);

	const groupByLabel = groupBy
		? (groupByOptions[entityType]?.find((o) => o.value === groupBy)?.label ?? groupBy)
		: undefined;
	// Which field the date range filters — the hydrated v2 override, or the
	// registry default, except the legacy invoice revenue group-bys
	// (month/client), which actually filter on paidAt.
	const dateFieldHint = (() => {
		if (entityType === "invoices" && (groupBy === "month" || groupBy === "client")) {
			return "paid date";
		}
		const field = dateField ?? getReportDateField(entityType);
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
			config: saved.config,
			visualization: saved.visualization,
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
				<Button
					size="sm"
					onClick={handleSave}
					disabled={!name.trim() || saving}
				>
					{saving ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Save className="h-4 w-4" />
					)}
					{mode === "edit" ? "Save changes" : "Save report"}
				</Button>
			</div>

			{/* Body — config rail + chart canvas */}
			<div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
				{/* Config rail */}
				<aside className="flex shrink-0 flex-col gap-6 border-b border-border/60 bg-background/50 px-4 py-5 lg:h-full lg:w-80 lg:overflow-y-auto lg:border-b-0 lg:border-r">
					{/* Outline / Filters tab strip */}
					<PillTabs
						value={configTab}
						onValueChange={(v) => setConfigTab(v as "outline" | "filters")}
					>
						<PillTabsList className="w-full">
							<PillTabsTrigger value="outline">
								<ListTree className="size-3.5" />
								Outline
							</PillTabsTrigger>
							<PillTabsTrigger value="filters">
								<Filter className="size-3.5" />
								Filters
								{activeFilterCount > 0 && (
									<span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-semibold text-primary">
										{activeFilterCount}
									</span>
								)}
							</PillTabsTrigger>
						</PillTabsList>

						<PillTabsContent value="outline" className="mt-4 space-y-4">
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
										setMetric({ op: "count" });
										setColumns([]);
										// Entity-scoped v2 fields can't survive a source change.
										setDateField(undefined);
										setSegmentBy(undefined);
										setIncludeEmptyValues(undefined);
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
										if (next && !isGenericGroupBy(entityType, next) && metric.op !== "count") {
											setMetric({ op: "count" });
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
									value={measureToValue(metric)}
									onValueChange={(v) => {
										const opt = availableMeasureOptions.find((o) => o.value === v);
										if (opt) setMetric(opt.measure);
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
								<MultiSelector
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
						</PillTabsContent>

						<PillTabsContent value="filters" className="mt-4">
							<ReportFiltersEditor
								entityType={entityType}
								filters={filters}
								onChange={setFilters}
							/>
						</PillTabsContent>
					</PillTabs>

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
							<ReportPreview config={saved.config} visualization={saved.visualization} />
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
						<Button
							variant="outline"
							size="sm"
							disabled={disabled}
							title={disabled ? "Group your data to add a chart." : undefined}
						/>
					}
				>
					<TriggerIcon className="h-4 w-4" />
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
