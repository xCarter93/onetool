import {
	AreaChart,
	BarChart3,
	Briefcase,
	ChartColumn,
	CreditCard,
	DollarSign,
	FileText,
	Hash,
	ListChecks,
	ListOrdered,
	PieChart,
	Radar,
	ReceiptText,
	Table as TableIcon,
	Target,
	TrendingUp,
	Users,
	type LucideIcon,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import type { ReportFilters } from "@onetool/backend/convex/lib/reportFilters";
import {
	DEFAULT_DETAIL_COLUMNS,
	GROUP_BY_OPTIONS,
	RATIO_KEYS,
	RATIO_METRICS,
	REPORT_ENTITY_TYPES,
	REPORT_FIELDS,
	getReportDateField,
	isGenericGroupBy,
	type RatioKey,
	type ReportEntityType,
} from "@onetool/backend/convex/lib/reportFields";
import { REPORT_SCAN_CEILING } from "@onetool/backend/convex/lib/orgScan";
import {
	resolveReportQueryArgs,
	isDetailModeActive,
	effectiveDetailColumns,
	type ExecuteReportArgs,
} from "@onetool/backend/convex/lib/reportQueryArgs";
import {
	DATE_RANGE_PRESETS,
	normalizeReportConfig,
	type DateRangePreset,
	type ReportConfig as ReportDocConfig,
	type ReportConfigV2,
	type ReportMetric,
	type ReportVisualization,
	type VisualizationOptions,
} from "@onetool/backend/convex/lib/reportConfig";
import { formatCurrency } from "@/lib/money";

export type EntityType = ReportEntityType;

export type VizType = ReportVisualization["type"];

export type MeasureOp = "count" | "sum" | "avg" | "min" | "max";
export type ReportMeasure =
	| { op: "count" }
	| { op: Exclude<MeasureOp, "count">; field: string };

export type ReportComparison = NonNullable<
	NonNullable<ReportConfigV2["date"]>["comparison"]
>;

/** Rail vocabulary for `date.comparison`; "none" is the absent comparison. */
export type CompareMode =
	| "none"
	| "previous_period"
	| "previous_year"
	| "custom";

export const compareModeOptions: { value: CompareMode; label: string }[] = [
	{ value: "none", label: "None" },
	{ value: "previous_period", label: "Previous period" },
	{ value: "previous_year", label: "Previous year" },
	{ value: "custom", label: "Custom range" },
];

/** One label per comparison kind — the number sublabel, chart tooltip, and table header all read it. */
export function comparisonKindLabel(kind: ReportComparison["kind"]): string {
	switch (kind) {
		case "previous_period":
			return "Previous period";
		case "previous_year":
			return "Previous year";
		case "absolute":
			return "Custom range";
	}
}

/**
 * The builder's working state, mirroring ReportConfigV2 plus the UI-level date
 * vocabulary ("custom" + a picked DateRange instead of an absolute range).
 * Converted both ways by builderStateToSaved / savedToBuilderState so preset
 * seeding, edit hydration, the AI apply bridge, save, and the live preview all
 * share one config construction.
 */
export type BuilderConfigState = {
	entityType: EntityType;
	/** v2 date.field override (e.g. invoices paidAt vs issuedDate). */
	dateField?: string;
	/** "all_time" | DateRangePreset | "custom". */
	dateRangePreset: string;
	customDateRange?: DateRange;
	/** Comparison range vocabulary; emitted as date.comparison only where the pipeline supports it. */
	compareMode?: CompareMode;
	compareDateRange?: DateRange;
	/** Callers pass sanitized filters (sanitizeReportFilters). */
	filters?: ReportFilters;
	metric: ReportMetric;
	groupBy?: string;
	segmentBy?: string;
	includeEmptyValues?: boolean;
	columns: string[];
	vizType: VizType;
	vizOptions?: VisualizationOptions;
};

function isDateRangePreset(value: string): value is DateRangePreset {
	return (DATE_RANGE_PRESETS as readonly string[]).includes(value);
}

function customAbsoluteRange(
	range: DateRange | undefined
): { kind: "absolute"; start?: number; end?: number } | undefined {
	const start = range?.from?.getTime();
	const end = range?.to
		? new Date(range.to).setHours(23, 59, 59, 999)
		: undefined;
	if (start === undefined && end === undefined) return undefined;
	return {
		kind: "absolute",
		...(start !== undefined ? { start } : {}),
		...(end !== undefined ? { end } : {}),
	};
}

function buildConfigDate(state: BuilderConfigState): ReportConfigV2["date"] {
	const field = state.dateField;
	const range =
		state.dateRangePreset === "custom"
			? customAbsoluteRange(state.customDateRange)
			: isDateRangePreset(state.dateRangePreset) &&
				  state.dateRangePreset !== "all_time"
				? { kind: "preset" as const, preset: state.dateRangePreset }
				: undefined;
	// No bounds (all-time, unknown preset, custom-with-nothing-picked) — the
	// date object only survives to carry a field override.
	if (!range) {
		return field
			? { field, range: { kind: "preset", preset: "all_time" } }
			: undefined;
	}
	return { ...(field ? { field } : {}), range };
}

/** A comparison needs both ends of the current range to subtract from; all-time and half-open ranges have none. */
export function comparisonRangeBounded(
	date: ReportConfigV2["date"]
): boolean {
	const range = date?.range;
	if (!range) return false;
	if (range.kind === "preset") return range.preset !== "all_time";
	return range.start !== undefined && range.end !== undefined;
}

/** Pie/radar/radial have no second-series encoding, and raw rows aren't aggregated at all. */
export function comparisonAuthorable(
	config: ReportConfigV2,
	vizType: VizType
): boolean {
	if (vizType === "pie" || vizType === "radar" || vizType === "radial") {
		return false;
	}
	return !isDetailModeActive(config, vizType);
}

function buildComparison(
	state: BuilderConfigState
): ReportComparison | undefined {
	const mode = state.compareMode;
	if (mode === undefined || mode === "none") return undefined;
	if (mode !== "custom") return { kind: mode };
	const absolute = customAbsoluteRange(state.compareDateRange);
	if (absolute?.start === undefined || absolute.end === undefined) {
		return undefined;
	}
	return { kind: "absolute", start: absolute.start, end: absolute.end };
}

/** Builder state → the exact (config, visualization) pair that is saved, previewed, and published to the assistant. */
export function builderStateToSaved(state: BuilderConfigState): {
	config: ReportConfigV2;
	visualization: ReportVisualization;
} {
	const visualization: ReportVisualization = {
		type: state.vizType,
		...(state.vizOptions ? { options: state.vizOptions } : {}),
	};

	const date = buildConfigDate(state);
	const config: ReportConfigV2 = {
		version: 2,
		entityType: state.entityType,
		...(date ? { date } : {}),
		...(state.filters ? { filters: state.filters } : {}),
		metric: state.metric,
		...(state.groupBy ? { groupBy: state.groupBy } : {}),
		...(state.segmentBy ? { segmentBy: state.segmentBy } : {}),
		...(state.includeEmptyValues ? { includeEmptyValues: true } : {}),
		...(state.columns.length ? { columns: state.columns } : {}),
	};

	// Gated at emission, not per-handler: raw-rows detail mode is reachable from
	// several controls, so an unsupported comparison must never reach a saved doc.
	const comparison =
		date !== undefined &&
		comparisonRangeBounded(date) &&
		state.segmentBy === undefined &&
		comparisonAuthorable(config, state.vizType)
			? buildComparison(state)
			: undefined;

	return {
		config: comparison
			? { ...config, date: { ...date!, comparison } }
			: config,
		visualization,
	};
}

/** Saved (config, visualization) of either version → builder state. v1 rows expand through the normalizer first. */
export function savedToBuilderState(
	savedConfig: ReportDocConfig,
	savedVisualization: ReportVisualization
): BuilderConfigState {
	const { config, visualization } = normalizeReportConfig(
		savedConfig,
		savedVisualization
	);
	const range = config.date?.range;
	let dateRangePreset = "all_time";
	let customDateRange: DateRange | undefined;
	if (range?.kind === "preset") {
		dateRangePreset = range.preset;
	} else if (
		range?.kind === "absolute" &&
		(range.start !== undefined || range.end !== undefined)
	) {
		dateRangePreset = "custom";
		customDateRange = {
			from: range.start !== undefined ? new Date(range.start) : undefined,
			to: range.end !== undefined ? new Date(range.end) : undefined,
		};
	}
	const comparison = config.date?.comparison;
	let compareMode: CompareMode = "none";
	let compareDateRange: DateRange | undefined;
	if (comparison?.kind === "absolute") {
		compareMode = "custom";
		compareDateRange = {
			from: new Date(comparison.start),
			to: new Date(comparison.end),
		};
	} else if (comparison) {
		compareMode = comparison.kind;
	}
	// isDetailModeActive lets a Table's explicit columns override its grouping,
	// so the builder must show the grouping the report actually renders: none.
	const columns = config.columns ?? [];
	const groupBy =
		visualization.type === "table" && columns.length > 0
			? undefined
			: config.groupBy;
	return {
		entityType: config.entityType,
		dateField: config.date?.field,
		dateRangePreset,
		customDateRange,
		compareMode,
		compareDateRange,
		filters: config.filters,
		metric: config.metric,
		groupBy,
		segmentBy: config.segmentBy,
		includeEmptyValues: config.includeEmptyValues,
		columns,
		vizType: visualization.type,
		vizOptions: visualization.options,
	};
}

// Keyed off the backend catalog so adding a report entity fails web compile
// until it gets a label/description/icon here; display order = catalog order.
const entityDisplay = {
	clients: { label: "Clients", description: "Customers and prospects", icon: Users },
	projects: { label: "Projects", description: "Project information", icon: Briefcase },
	tasks: { label: "Tasks", description: "Tasks and schedule items", icon: ListChecks },
	quotes: { label: "Quotes", description: "Quotes and proposals", icon: FileText },
	invoices: { label: "Invoices", description: "Invoices and revenue", icon: DollarSign },
	payments: { label: "Payments", description: "Payments recorded against invoices", icon: CreditCard },
	quoteLineItems: { label: "Quote Line Items", description: "Individual line items on quotes", icon: ListOrdered },
	invoiceLineItems: { label: "Invoice Line Items", description: "Individual line items on invoices", icon: ReceiptText },
	activities: { label: "Activities", description: "Activity log", icon: TrendingUp },
} satisfies Record<
	ReportEntityType,
	{ label: string; description: string; icon: LucideIcon }
>;

export const entityOptions: {
	value: EntityType;
	label: string;
	description: string;
	icon: LucideIcon;
}[] = REPORT_ENTITY_TYPES.map((value) => ({ value, ...entityDisplay[value] }));

// Canonical list lives in the backend field registry so the builder, the
// assistant's report-config generator, and executeReport can't drift.
export const groupByOptions: Record<string, { value: string; label: string }[]> =
	GROUP_BY_OPTIONS;

// The builder's picker offers only generic registry keys — the legacy magic
// keys (month/client/conversionRate/completionRate) stay in GROUP_BY_OPTIONS
// for the AI vocabulary and label lookups, but their behaviors are authored
// through the metric picker and date-field select since R8b.
export const genericGroupByOptions: Record<
	string,
	{ value: string; label: string }[]
> = Object.fromEntries(
	REPORT_ENTITY_TYPES.map((entity) => [
		entity,
		GROUP_BY_OPTIONS[entity].filter((o) => isGenericGroupBy(entity, o.value)),
	])
);

const RATIO_LABELS: Record<RatioKey, string> = {
	conversionRate: "Conversion rate",
	completionRate: "Completion rate",
};

export type MetricOption = {
	value: string;
	label: string;
	metric: ReportMetric;
};

/** Stable select value for a metric; ratio metrics are addressable since R8b. */
export function metricToValue(metric: ReportMetric): string {
	if (metric.op === "count") return "count";
	if (metric.op === "ratio") return `ratio:${metric.ratioKey}`;
	return `${metric.op}:${metric.field}`;
}

export type MetricAgg = Exclude<MeasureOp, "count">;

export const metricAggOptions: { op: MetricAgg; label: string }[] = [
	{ op: "sum", label: "Sum" },
	{ op: "avg", label: "Average" },
	{ op: "min", label: "Min" },
	{ op: "max", label: "Max" },
];

/** What a metric measures, separated from how it aggregates (d15 amendment). */
export type MetricTarget =
	| { kind: "count" }
	| { kind: "field"; field: string }
	| { kind: "ratio"; ratioKey: RatioKey };

export type MetricTargetOption = {
	value: string;
	label: string;
	group: string;
	target: MetricTarget;
	aggregatable: boolean;
};

function numericFieldsOf(entityType: EntityType) {
	return Object.entries(REPORT_FIELDS[entityType].fields).filter(
		([, def]) => def.type === "number" || def.type === "currency"
	);
}

/**
 * What a metric can measure: the record count, direct numeric/currency fields,
 * and named ratio metrics. Aggregatable targets pair with a separate
 * Sum/Average/Min/Max control.
 */
export function metricTargetOptionsFor(
	entityType: EntityType
): MetricTargetOption[] {
	const options: MetricTargetOption[] = [
		{
			value: "count",
			label: "Count of records",
			group: "Fields",
			target: { kind: "count" },
			aggregatable: false,
		},
	];
	for (const [field, def] of numericFieldsOf(entityType)) {
		options.push({
			value: `field:${field}`,
			label: def.label,
			group: "Fields",
			target: { kind: "field", field },
			aggregatable: true,
		});
	}
	for (const key of RATIO_KEYS) {
		if (RATIO_METRICS[key].entityType !== entityType) continue;
		options.push({
			value: `ratio:${key}`,
			label: RATIO_LABELS[key],
			group: "Ratios",
			target: { kind: "ratio", ratioKey: key },
			aggregatable: false,
		});
	}
	return options;
}

/** Target + aggregation → the saved metric. Non-aggregatable targets ignore `agg`. */
export function buildMetric(target: MetricTarget, agg: MetricAgg): ReportMetric {
	switch (target.kind) {
		case "count":
			return { op: "count" };
		case "field":
			return { op: agg, field: target.field };
		case "ratio":
			return { op: "ratio", ratioKey: target.ratioKey };
	}
}

/** The two controls read from the metric itself — no duplicated picker state. */
export function metricTargetValue(metric: ReportMetric): string {
	if (metric.op === "count") return "count";
	if (metric.op === "ratio") return `ratio:${metric.ratioKey}`;
	return `field:${metric.field}`;
}

/** Undefined where the target is its own aggregation (count, ratio). */
export function metricAggOf(metric: ReportMetric): MetricAgg | undefined {
	if (metric.op === "count" || metric.op === "ratio") return undefined;
	return metric.op;
}

/**
 * The flat metric vocabulary — every target × its allowed aggregations. The
 * builder authors metrics through the split controls; this stays the label
 * lookup for the preview header and the utility bar.
 */
export function metricOptionsFor(entityType: EntityType): MetricOption[] {
	return metricTargetOptionsFor(entityType).flatMap((option) => {
		if (!option.aggregatable) {
			const metric = buildMetric(option.target, "sum");
			return [{ value: metricToValue(metric), label: option.label, metric }];
		}
		return metricAggOptions.map(({ op, label }) => {
			const metric = buildMetric(option.target, op);
			return {
				value: metricToValue(metric),
				label: `${label} of ${option.label}`,
				metric,
			};
		});
	});
}

/** Timestamp fields eligible as the date-range field; the entity default first. */
export function dateFieldOptionsFor(
	entityType: EntityType
): { value: string; label: string }[] {
	const defaultField = getReportDateField(entityType);
	const options = Object.entries(REPORT_FIELDS[entityType].fields)
		.filter(([, def]) => def.type === "timestamp")
		.map(([field, def]) => ({ value: field, label: def.label }));
	options.sort((a, b) =>
		a.value === defaultField ? -1 : b.value === defaultField ? 1 : 0
	);
	return options;
}

/** Rail dropdown order (F1): the two non-chart types first, then the charts. */
export const visualizationOptions: {
	value: VizType;
	label: string;
	icon: LucideIcon;
}[] = [
	// Value stays "number" (schema/presets/saved reports unchanged); the label is
	// Attio's name for a single-value report.
	{ value: "number", label: "Single metric", icon: Hash },
	{ value: "table", label: "Table", icon: TableIcon },
	{ value: "bar", label: "Bar", icon: BarChart3 },
	{ value: "column", label: "Column", icon: ChartColumn },
	// Value stays "line" (schema/presets/saved reports unchanged) — user-facing
	// label + icon reflect the area-chart rendering (see ReportLineChart).
	{ value: "line", label: "Area", icon: AreaChart },
	{ value: "pie", label: "Pie", icon: PieChart },
	{ value: "radar", label: "Radar", icon: Radar },
	{ value: "radial", label: "Radial", icon: Target },
];

/** Table and single-metric render themselves; everything else is a chart. */
export function isChartVizType(type: VizType): boolean {
	return type !== "table" && type !== "number";
}

export const dateRangeOptions = [
	{ value: "all_time", label: "All Time" },
	{ value: "today", label: "Today" },
	{ value: "this_week", label: "This Week" },
	{ value: "this_month", label: "This Month" },
	{ value: "this_quarter", label: "This Quarter" },
	{ value: "this_year", label: "This Year" },
	{ value: "last_7_days", label: "Last 7 Days" },
	{ value: "last_30_days", label: "Last 30 Days" },
	{ value: "last_90_days", label: "Last 90 Days" },
	{ value: "last_year", label: "Last Year" },
	{ value: "custom", label: "Custom Range" },
];

export const entityLabels: Record<string, string> = Object.fromEntries(
	entityOptions.map((o) => [o.value, o.label])
);

export const visualizationIcons: Record<VizType, LucideIcon> = {
	bar: BarChart3,
	column: ChartColumn,
	line: AreaChart,
	pie: PieChart,
	radar: Radar,
	radial: Target,
	table: TableIcon,
	number: Hash,
};

export function formatDate(timestamp: number) {
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function formatRelativeTime(timestamp: number) {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return formatDate(timestamp);
}

export function getDateRange(
	preset: string
): { start?: number; end?: number } | undefined {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const endOfToday = new Date(today);
	endOfToday.setHours(23, 59, 59, 999);

	switch (preset) {
		case "today":
			return { start: today.getTime(), end: endOfToday.getTime() };
		case "this_week": {
			const dayOfWeek = today.getDay();
			const startOfWeek = new Date(today);
			startOfWeek.setDate(today.getDate() - dayOfWeek);
			const endOfWeek = new Date(startOfWeek);
			endOfWeek.setDate(startOfWeek.getDate() + 6);
			endOfWeek.setHours(23, 59, 59, 999);
			return { start: startOfWeek.getTime(), end: endOfWeek.getTime() };
		}
		case "this_month": {
			const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
			const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
			endOfMonth.setHours(23, 59, 59, 999);
			return { start: startOfMonth.getTime(), end: endOfMonth.getTime() };
		}
		case "this_quarter": {
			const quarter = Math.floor(today.getMonth() / 3);
			const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
			const endOfQuarter = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
			endOfQuarter.setHours(23, 59, 59, 999);
			return { start: startOfQuarter.getTime(), end: endOfQuarter.getTime() };
		}
		case "this_year": {
			const startOfYear = new Date(today.getFullYear(), 0, 1);
			const endOfYear = new Date(today.getFullYear(), 11, 31);
			endOfYear.setHours(23, 59, 59, 999);
			return { start: startOfYear.getTime(), end: endOfYear.getTime() };
		}
		case "last_7_days": {
			const start = new Date(today);
			start.setDate(today.getDate() - 6);
			return { start: start.getTime(), end: endOfToday.getTime() };
		}
		case "last_30_days": {
			const start = new Date(today);
			start.setDate(today.getDate() - 29);
			return { start: start.getTime(), end: endOfToday.getTime() };
		}
		case "last_90_days": {
			const start = new Date(today);
			start.setDate(today.getDate() - 89);
			return { start: start.getTime(), end: endOfToday.getTime() };
		}
		case "last_year": {
			const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1);
			const endOfLastYear = new Date(today.getFullYear() - 1, 11, 31);
			endOfLastYear.setHours(23, 59, 59, 999);
			return { start: startOfLastYear.getTime(), end: endOfLastYear.getTime() };
		}
		case "all_time":
		default:
			return undefined;
	}
}

/**
 * Formats a report metric as USD or a plain count. `isCurrency` must come
 * from the result's explicit metadata flags (the unified pipeline emits them
 * only when true; absent means counts) — never from the value's own magnitude.
 */
export function formatReportValue(
	value: number,
	isCurrency: boolean,
	options: { compact?: boolean } = {}
): string {
	if (!isCurrency) {
		return value.toLocaleString("en-US");
	}
	return formatCurrency(value, options.compact ? { compact: true } : { whole: true });
}

// Canonical defaults live in the backend field registry (shared with the
// assistant's report-config generator).
export { DEFAULT_DETAIL_COLUMNS };

// Shared with the assistant's toExecuteReportArgs via the backend contract
// module — both feed the same executeReport query and must never drift.
export { isDetailModeActive, effectiveDetailColumns, resolveReportQueryArgs };
export type {
	ReportConfigV2,
	ReportMetric,
	ReportVisualization,
	VisualizationOptions,
};

export type ReportQueryArgs = ExecuteReportArgs;

/** Shown when a report's underlying query hit the scan ceiling. */
export const TRUNCATION_NOTICE = `Based on the most recent ${REPORT_SCAN_CEILING.toLocaleString(
	"en-US"
)} records — results may be incomplete.`;

/** Same ceiling, but only the comparison scan hit it — the current range is complete. */
export const COMPARE_TRUNCATION_NOTICE = `The comparison range is based on the most recent ${REPORT_SCAN_CEILING.toLocaleString(
	"en-US"
)} records — its figures may be incomplete.`;

/**
 * Signed percent change against a comparison value. Undefined when there is
 * nothing to divide by — callers show the previous figure instead.
 */
export function percentChange(
	current: number,
	previous: number
): string | undefined {
	if (previous === 0) return undefined;
	const change = ((current - previous) / Math.abs(previous)) * 100;
	const rounded = Math.abs(change) < 0.05 ? 0 : change;
	return `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded).toFixed(1)}%`;
}

/** Ratio metrics move in percentage points, so their delta is a subtraction, not a ratio. */
export function pointsChange(current: number, previous: number): string {
	const delta = current - previous;
	const rounded = Math.abs(delta) < 0.05 ? 0 : delta;
	return `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded).toFixed(1)} pts`;
}

