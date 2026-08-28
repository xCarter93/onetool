"use client";

import { useMemo, useState } from "react";
import {
	ArrowLeft,
	ChevronDown,
	Database,
	Loader2,
	Save,
	Sparkles,
} from "lucide-react";
import { DateRange } from "react-day-picker";
import {
	DEFAULT_GROUP_BY,
	REPORT_FIELDS,
	getReportDateField,
} from "@onetool/backend/convex/lib/reportFields";
import {
	getRelationEdge,
	resolveReportPath,
} from "@onetool/backend/convex/lib/reportRelations";
import type { ReportFilters } from "@onetool/backend/convex/lib/reportFilters";
import type { ReportConfig as ReportDocConfig } from "@onetool/backend/convex/lib/reportConfig";
import { useAssistantOpener } from "@/components/assistant/assistant-opener-context";
import { useRegisterReportConfigApply } from "@/components/assistant/report-config-apply-context";
import { usePublishScreenContext } from "@/components/assistant/use-screen-context";
import type { BuilderReportConfig } from "@onetool/backend/convex/reportConfigGeneration";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/domain/empty-state";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { MultiSelector } from "@/components/shared/multi-selector";
import { PanelField, PanelSection } from "@/components/shared/panel-primitives";
import DatePickerRange from "@/components/shared/date-picker-range";
import { ReportPreview } from "./report-preview";
import { ReportUtilityBar } from "./report-utility-bar";
import { ReportFieldPicker } from "./report-field-picker";
import { ReportFilterRows } from "./report-filter-rows";
import { ReportMetricControls } from "./report-metric-controls";
import {
	countFilterRules,
	sanitizeReportFilters,
} from "./report-filter-model";
import { pathLabel } from "../report-path-options";
import {
	builderStateToSaved,
	dateFieldOptionsFor,
	dateRangeOptions,
	entityOptions,
	genericGroupByOptions,
	groupByOptions,
	isChartVizType,
	savedToBuilderState,
	visualizationOptions,
	type BuilderConfigState,
	type EntityType,
	type ReportConfigV2,
	type ReportMetric,
	type ReportVisualization,
	type VisualizationOptions,
	type VizType,
} from "../report-config";

/** Select sentinels — Base UI Select can't take an empty/undefined value. */
const NO_GROUP_BY = "__none__";
const NO_SEGMENT = "__none__";
const DEFAULT_SORT = "__default__";

const TIME_SUFFIX = /^(.+)_(day|week|month)$/;

const GRANULARITY_OPTIONS = [
	{ value: "day", label: "Day" },
	{ value: "week", label: "Week" },
	{ value: "month", label: "Month" },
] as const;

/** Where a metric that can't render as a single value lands. */
const FALLBACK_CHART_TYPE: VizType = "bar";

export interface ReportBuilderInitial {
	name: string;
	description: string;
	/** Either config version — v1 rows expand through the normalizer on hydrate. Absent = blank start. */
	config?: ReportDocConfig;
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
		initial.config
			? savedToBuilderState(initial.config, initial.visualization)
			: null
	);
	const [name, setName] = useState(initial.name);
	const [description, setDescription] = useState(initial.description);
	const [entityType, setEntityType] = useState<EntityType | null>(
		init?.entityType ?? null
	);
	const [groupBy, setGroupBy] = useState<string | undefined>(init?.groupBy);
	const [vizType, setVizType] = useState<VizType>(
		init?.vizType ?? initial.visualization.type
	);
	const [dateRangePreset, setDateRangePreset] = useState(
		init?.dateRangePreset ?? "all_time"
	);
	const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(
		init?.customDateRange
	);
	const [dateField, setDateField] = useState<string | undefined>(init?.dateField);
	const [segmentBy, setSegmentBy] = useState<string | undefined>(init?.segmentBy);
	const [includeEmptyValues, setIncludeEmptyValues] = useState<boolean | undefined>(
		init?.includeEmptyValues
	);
	const [vizOptions, setVizOptions] = useState<VisualizationOptions | undefined>(
		init?.vizOptions
	);
	const [filters, setFilters] = useState<ReportFilters | undefined>(init?.filters);
	const [metric, setMetric] = useState<ReportMetric>(init?.metric ?? { op: "count" });
	const [columns, setColumns] = useState<string[]>(init?.columns ?? []);
	const [pendingEntity, setPendingEntity] = useState<EntityType | null>(null);
	const [groupByPickerOpen, setGroupByPickerOpen] = useState(false);

	const openAssistant = useAssistantOpener();
	const isChart = isChartVizType(vizType);

	const sanitizedFilters = useMemo(() => sanitizeReportFilters(filters), [filters]);
	const activeFilterCount = useMemo(() => countFilterRules(filters), [filters]);

	// One construction feeds save, preview, the utility bar, and the published
	// assistant context — what the user sees is exactly what persists.
	const saved = entityType
		? builderStateToSaved({
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
			} satisfies BuilderConfigState)
		: null;

	const [initialSnapshot] = useState(() =>
		init ? JSON.stringify(builderStateToSaved(init)) : null
	);
	const isDirty =
		name !== initial.name ||
		description !== initial.description ||
		(saved ? JSON.stringify(saved) : null) !== initialSnapshot;

	// Agent sees what the user sees: the assistant's configureReport tool
	// relays this as currentConfig so a request modifies the open draft
	// instead of starting over.
	usePublishScreenContext(() =>
		saved
			? {
					reportBuilderConfig: {
						config: saved.config,
						visualization: saved.visualization,
						name: name || null,
					},
				}
			: {}
	);

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

	const hasMeaningfulConfig =
		activeFilterCount > 0 ||
		metric.op !== "count" ||
		columns.length > 0 ||
		dateField !== undefined;

	const applySourceChange = (next: EntityType) => {
		setEntityType(next);
		setGroupBy(isChart ? DEFAULT_GROUP_BY[next] : undefined);
		setFilters(undefined);
		setMetric({ op: "count" });
		setColumns([]);
		setDateField(undefined);
		setSegmentBy(undefined);
		setIncludeEmptyValues(undefined);
	};

	const requestSourceChange = (next: EntityType) => {
		if (entityType && next !== entityType && hasMeaningfulConfig) {
			setPendingEntity(next);
		} else {
			applySourceChange(next);
		}
	};

	const changeVisualization = (next: VizType) => {
		if (next === vizType) return;
		setVizType(next);
		if (next === "number") {
			setGroupBy(undefined);
			setSegmentBy(undefined);
			// A related rollup is inherently bucketed — no scalar rendering.
			if (metric.op === "related") setMetric({ op: "count" });
			return;
		}
		if (next === "table") {
			setSegmentBy(undefined);
			return;
		}
		// Only bar/column render segments (honest encodings).
		if (next !== "bar" && next !== "column") setSegmentBy(undefined);
		if (
			entityType &&
			!groupBy &&
			metric.op !== "ratio" &&
			metric.op !== "related"
		) {
			setGroupBy(DEFAULT_GROUP_BY[entityType]);
		}
	};

	const changeMetric = (next: ReportMetric) => {
		setMetric(next);
		if (next.op === "ratio" || next.op === "related") {
			// Backend rejects grouping on ratio/related — they bucket themselves.
			setGroupBy(undefined);
			setSegmentBy(undefined);
			if (next.op === "related" && vizType === "number") {
				setVizType(FALLBACK_CHART_TYPE);
			}
		} else if (isChart && !groupBy && entityType) {
			setGroupBy(DEFAULT_GROUP_BY[entityType]);
		}
	};

	const groupBySectionVisible =
		vizType !== "number" && metric.op !== "ratio" && metric.op !== "related";

	// Group-by picker anatomy (R9): timestamp options collapse to one entry per
	// base field, with the day/week/month granularity chosen inline.
	const timeGroupMatch = groupBy?.match(TIME_SUFFIX) ?? null;
	const groupByBase = timeGroupMatch ? timeGroupMatch[1] : groupBy;
	const groupOptions = entityType ? (genericGroupByOptions[entityType] ?? []) : [];
	const nonTimeGroupOptions = groupOptions.filter((o) => !TIME_SUFFIX.test(o.value));
	const timeBaseOptions = entityType
		? [
				...new Set(
					groupOptions
						.map((o) => o.value.match(TIME_SUFFIX)?.[1])
						.filter((base): base is string => base !== undefined)
				),
			].map((base) => ({
				value: base,
				label:
					base === "creationDate"
						? "Created"
						: (REPORT_FIELDS[entityType].fields[base]?.label ?? base),
			}))
		: [];
	const directGroupByOptions = [...nonTimeGroupOptions, ...timeBaseOptions];

	// One resolver for direct and dotted groupings — a saved path can outlive a
	// registry change, so an unresolvable one degrades instead of throwing.
	const groupByTerminal = useMemo(() => {
		if (!entityType || !groupBy) return undefined;
		try {
			return resolveReportPath(entityType, groupBy).terminal;
		} catch {
			return undefined;
		}
	}, [entityType, groupBy]);
	const groupFieldDef =
		groupByTerminal?.kind === "field" ? groupByTerminal.def : undefined;
	const isFkGroupBy = groupByTerminal?.kind === "fk";
	const isTimeGroupBy = groupFieldDef?.type === "timestamp";
	const groupByLabelText = !groupByBase
		? "None (raw rows)"
		: (directGroupByOptions.find((o) => o.value === groupByBase)?.label ??
			(entityType ? pathLabel(entityType, groupByBase) : groupByBase));

	const segmentCapable =
		(vizType === "bar" || vizType === "column") &&
		!!groupBy &&
		metric.op !== "ratio" &&
		metric.op !== "related";
	const segmentOptions = entityType
		? nonTimeGroupOptions.filter(
				(o) => o.value !== groupBy && !getRelationEdge(entityType, o.value)
			)
		: [];

	const setVizOption = <K extends keyof VisualizationOptions>(
		key: K,
		value: VisualizationOptions[K] | undefined
	) => {
		setVizOptions((prev) => {
			const next = { ...prev };
			if (value === undefined) delete next[key];
			else next[key] = value;
			return Object.keys(next).length ? next : undefined;
		});
	};

	const selectGroupBy = (value: string) => {
		if (!entityType) return;
		if (value === NO_GROUP_BY) {
			setGroupBy(undefined);
			setSegmentBy(undefined);
			setIncludeEmptyValues(undefined);
			setVizOption("sort", undefined);
			setVizOption("seriesLimit", undefined);
			return;
		}
		let terminal: ReturnType<typeof resolveReportPath>["terminal"] | undefined;
		try {
			terminal = resolveReportPath(entityType, value).terminal;
		} catch {
			terminal = undefined;
		}
		const isTime = terminal?.kind === "field" && terminal.def.type === "timestamp";
		const next =
			isTime && !TIME_SUFFIX.test(value)
				? `${value}_${timeGroupMatch?.[2] ?? "month"}`
				: value;
		setGroupBy(next);
		if (segmentBy === next || segmentBy === value) setSegmentBy(undefined);
		// Grouping-dependent settings don't carry to a grouping that can't honor
		// them — keep the saved config honest.
		if (!(terminal?.kind === "field" && terminal.def.options)) {
			setIncludeEmptyValues(undefined);
		}
		if (isTime || (terminal?.kind === "fk" && vizOptions?.sort === "label_asc")) {
			setVizOption("sort", undefined);
		}
	};

	const supportsAxisChrome =
		vizType === "bar" || vizType === "column" || vizType === "line";
	const chartOptionsVisible = isChart && (!!groupBy || supportsAxisChrome);

	const defaultDateField = entityType ? getReportDateField(entityType) : undefined;
	const dateFieldOptions = entityType ? dateFieldOptionsFor(entityType) : [];

	const groupByLabel =
		entityType && groupBy
			? (groupByOptions[entityType]?.find((o) => o.value === groupBy)?.label ??
				groupByLabelText)
			: undefined;
	const dateFieldHint = (() => {
		if (!entityType) return undefined;
		const field = dateField ?? getReportDateField(entityType);
		if (field === "_creationTime") return "record creation date";
		return REPORT_FIELDS[entityType].fields[field]?.label.toLowerCase() ?? field;
	})();
	const rangeLabel =
		dateRangeOptions.find((o) => o.value === dateRangePreset)?.label ?? "All Time";

	const handleSave = () => {
		if (!name.trim() || !saved) return;
		void onSave({
			name: name.trim(),
			description: description.trim() || undefined,
			config: saved.config,
			visualization: saved.visualization,
		});
	};

	return (
		<div className="flex flex-col lg:h-[calc(100svh-1.75rem)] lg:overflow-hidden">
			{/* Top strip — spans canvas + rail; pt clears the header notch (~48px) */}
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
				{isDirty && (
					<span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
						<span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
						Unsaved changes
					</span>
				)}
				<Button
					size="sm"
					onClick={handleSave}
					disabled={!name.trim() || !entityType || saving}
				>
					{saving ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Save className="h-4 w-4" />
					)}
					{mode === "edit" ? "Save changes" : "Save report"}
				</Button>
			</div>

			{/* Body — canvas left, config rail right; narrow widths stack canvas first */}
			<div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
				{/* Preview canvas */}
				<main className="flex min-w-0 flex-1 flex-col lg:h-full lg:overflow-hidden">
					<div className="flex-1 overflow-auto bg-muted/20 p-4 sm:p-8">
						<div className="flex min-h-full w-full flex-col rounded-2xl border border-border/60 bg-background p-5 shadow-sm sm:p-7">
							{saved ? (
								<ReportPreview
									config={saved.config}
									visualization={saved.visualization}
								/>
							) : (
								<div className="flex min-h-[300px] flex-1 items-center justify-center">
									<EmptyState
										icon={<Database />}
										size="md"
										title="Select a data source"
										description="Choose what this report is about — the preview fills in with live data."
									/>
								</div>
							)}
						</div>
					</div>

					<ReportUtilityBar
						saved={saved}
						reportName={name}
						groupByLabel={groupByLabel}
						rangeLabel={rangeLabel}
					/>
				</main>

				{/* Config rail */}
				<aside className="flex shrink-0 flex-col border-t border-border/60 bg-background/50 px-6 py-4 lg:h-full lg:w-[440px] lg:overflow-y-auto lg:border-l lg:border-t-0">
					{/* NL report building lives in the assistant panel (createReport tool). */}
					{openAssistant && (
						<section className="mb-2 space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
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
								Describe the report you want — the assistant builds and saves
								it for you.
							</p>
						</section>
					)}

					<PanelSection title="Visualization">
						<Select
							value={vizType}
							onValueChange={(v) => {
								if (v) changeVisualization(v as VizType);
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{visualizationOptions.map((opt) => {
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
					</PanelSection>

					<PanelSection title="Data source">
						<Select
							value={entityType ?? ""}
							onValueChange={(v) => {
								if (v) requestSourceChange(v as EntityType);
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select a data source" />
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
					</PanelSection>

					{entityType && (
						<>
							<PanelSection title="Date">
								<PanelField
									label="Date range"
									helper={`Filters ${entityType} by ${dateFieldHint}`}
								>
									<div className="space-y-1.5">
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
									</div>
								</PanelField>
								{dateFieldOptions.length > 1 && (
									<PanelField label="Date field">
										<Select
											value={dateField ?? defaultDateField ?? ""}
											onValueChange={(v) => {
												if (!v) return;
												setDateField(v === defaultDateField ? undefined : v);
											}}
										>
											<SelectTrigger className="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{dateFieldOptions.map((opt) => (
													<SelectItem key={opt.value} value={opt.value}>
														{opt.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</PanelField>
								)}
							</PanelSection>

							<PanelSection
								title={
									activeFilterCount > 0
										? `Filters (${activeFilterCount})`
										: "Filters"
								}
							>
								<ReportFilterRows
									entityType={entityType}
									filters={filters}
									onChange={setFilters}
								/>
							</PanelSection>

							<PanelSection title="Metric">
								<ReportMetricControls
									entityType={entityType}
									metric={metric}
									onChange={changeMetric}
								/>
							</PanelSection>

							{groupBySectionVisible && (
								<PanelSection title="Group by">
									<Popover
										open={groupByPickerOpen}
										onOpenChange={setGroupByPickerOpen}
									>
										<PopoverTrigger
											render={
												<button
													type="button"
													className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												>
													<span className="truncate">{groupByLabelText}</span>
													<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
												</button>
											}
										/>
										{groupByPickerOpen && (
											<PopoverContent
												side="left"
												align="start"
												sideOffset={8}
												className="w-80 p-0"
											>
												<ReportFieldPicker
													entityType={entityType}
													mode="groupBy"
													value={groupByBase}
													directOptions={
														// A chart must group; raw rows are the Table type's territory.
														vizType === "table"
															? [
																	{
																		value: NO_GROUP_BY,
																		label: "None (raw rows)",
																	},
																	...directGroupByOptions,
																]
															: directGroupByOptions
													}
													onSelect={(value) => {
														selectGroupBy(value);
														setGroupByPickerOpen(false);
													}}
												/>
											</PopoverContent>
										)}
									</Popover>
									{isTimeGroupBy && groupByBase && (
										<SegmentedControl
											value={timeGroupMatch?.[2] ?? "month"}
											onValueChange={(g) => setGroupBy(`${groupByBase}_${g}`)}
											options={GRANULARITY_OPTIONS}
											className="w-full"
										/>
									)}
									{groupFieldDef?.options && (
										<label className="flex items-center justify-between gap-2 text-sm text-foreground">
											Include empty values
											<Switch
												checked={includeEmptyValues === true}
												onCheckedChange={(checked) =>
													setIncludeEmptyValues(checked || undefined)
												}
											/>
										</label>
									)}
								</PanelSection>
							)}

							{segmentCapable && segmentOptions.length > 0 && (
								<PanelSection title="Segment by">
									<PanelField
										label="Segment"
										helper="Splits each bar into stacked segments."
									>
										<Select
											value={segmentBy ?? NO_SEGMENT}
											onValueChange={(v) => {
												if (!v) return;
												setSegmentBy(v === NO_SEGMENT ? undefined : v);
											}}
										>
											<SelectTrigger className="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value={NO_SEGMENT}>None</SelectItem>
												{segmentOptions.map((opt) => (
													<SelectItem key={opt.value} value={opt.value}>
														{opt.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</PanelField>
								</PanelSection>
							)}

							{chartOptionsVisible && (
								<PanelSection title="Chart options">
									{groupBy && (
										<PanelField
											label="Series limit"
											helper="Shows the first N groups in sorted order."
										>
											<Input
												type="number"
												min={1}
												value={vizOptions?.seriesLimit ?? ""}
												onChange={(e) =>
													setVizOption(
														"seriesLimit",
														e.target.value === ""
															? undefined
															: Math.max(1, Math.floor(Number(e.target.value)))
													)
												}
												placeholder="All groups"
											/>
										</PanelField>
									)}
									{groupBy && !timeGroupMatch && (
										<PanelField label="Sort">
											<Select
												value={vizOptions?.sort ?? DEFAULT_SORT}
												onValueChange={(v) => {
													if (!v) return;
													setVizOption(
														"sort",
														v === DEFAULT_SORT
															? undefined
															: (v as NonNullable<
																	VisualizationOptions["sort"]
																>)
													);
												}}
											>
												<SelectTrigger className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={DEFAULT_SORT}>
														Chart default
													</SelectItem>
													<SelectItem value="value_desc">
														Highest first
													</SelectItem>
													<SelectItem value="value_asc">Lowest first</SelectItem>
													{/* FK labels resolve after the series slice, so A-to-Z can't apply to record groupings. */}
													{!isFkGroupBy && (
														<SelectItem value="label_asc">A to Z</SelectItem>
													)}
												</SelectContent>
											</Select>
										</PanelField>
									)}
									{supportsAxisChrome && (
										<label className="flex items-center justify-between gap-2 text-sm text-foreground">
											Axis labels
											<Switch
												checked={vizOptions?.axisLabels === true}
												onCheckedChange={(checked) =>
													setVizOption("axisLabels", checked || undefined)
												}
											/>
										</label>
									)}
									{supportsAxisChrome && (
										<PanelField
											label="Target line"
											helper="Draws a reference line at this value."
										>
											<Input
												type="number"
												value={vizOptions?.targetLine ?? ""}
												onChange={(e) =>
													setVizOption(
														"targetLine",
														e.target.value === ""
															? undefined
															: Number(e.target.value)
													)
												}
												placeholder="None"
											/>
										</PanelField>
									)}
								</PanelSection>
							)}

							{vizType === "table" && (
								<PanelSection title="Table options">
									<PanelField
										label="Columns"
										helper="Columns appear when showing raw rows."
									>
										<MultiSelector
											options={Object.entries(
												REPORT_FIELDS[entityType].fields
											).map(([field, def]) => ({
												label: def.label,
												value: field,
											}))}
											value={columns}
											onValueChange={(vals) =>
												// Keep table column order stable in registry order,
												// regardless of the order fields were picked in.
												setColumns(
													Object.keys(REPORT_FIELDS[entityType].fields).filter(
														(f) => vals.includes(f)
													)
												)
											}
											placeholder="Default columns"
											maxCount={2}
											className="w-full"
										/>
									</PanelField>
								</PanelSection>
							)}
						</>
					)}
				</aside>
			</div>

			<AlertDialog
				open={pendingEntity !== null}
				onOpenChange={(open) => {
					if (!open) setPendingEntity(null);
				}}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Change data source?</AlertDialogTitle>
						<AlertDialogDescription>
							Filters, metric, and columns don&apos;t carry over to a new
							source.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep current source</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingEntity) applySourceChange(pendingEntity);
								setPendingEntity(null);
							}}
						>
							Change source
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
