/**
 * Saved report config: canonical v2 types and validators. Every stored report
 * is v2 — the builder, presets and the AI all write it natively.
 */
import { v, type Infer } from "convex/values";
import { literals } from "convex-helpers/validators";
import {
	RATIO_KEYS,
	reportEntityTypeValidator,
	type ReportEntityType,
} from "./reportFields";
import { reportFiltersValidator, type ReportFilters } from "./reportFilters";

export const DATE_RANGE_PRESETS = [
	"all_time",
	"today",
	"this_week",
	"this_month",
	"this_quarter",
	"this_year",
	"last_7_days",
	"last_30_days",
	"last_90_days",
	"last_year",
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const dateRangePresetValidator = literals(...DATE_RANGE_PRESETS);

// showZeros was dropped at R9 (d14): config.includeEmptyValues is the one
// "show zero buckets" switch; nothing ever wrote the viz option.
export const visualizationOptionsValidator = v.object({
	axisLabels: v.optional(v.boolean()),
	stacked: v.optional(v.boolean()),
	sort: v.optional(literals("value_desc", "value_asc", "label_asc")),
	targetLine: v.optional(v.number()),
	seriesLimit: v.optional(v.number()),
});

export type VisualizationOptions = Infer<typeof visualizationOptionsValidator>;

export const reportVisualizationValidator = v.object({
	// "number" (R8b) renders the ungrouped aggregate as a KPI figure.
	type: literals("table", "number", "bar", "column", "line", "pie", "radar", "radial"),
	options: v.optional(visualizationOptionsValidator),
});

export type ReportVisualization = Infer<typeof reportVisualizationValidator>;

export const reportMetricValidator = v.object({
	op: literals("count", "sum", "avg", "min", "max", "ratio"),
	field: v.optional(v.string()),
	ratioKey: v.optional(literals(...RATIO_KEYS)),
});

export type ReportMetric = Infer<typeof reportMetricValidator>;

export const reportDateValidator = v.object({
	/** Overrides the entity's default dateField (e.g. invoices paidAt vs issuedDate). */
	field: v.optional(v.string()),
	range: v.union(
		v.object({ kind: v.literal("preset"), preset: dateRangePresetValidator }),
		v.object({
			kind: v.literal("absolute"),
			start: v.optional(v.number()),
			end: v.optional(v.number()),
		})
	),
	comparison: v.optional(
		v.union(
			v.object({ kind: literals("previous_period", "previous_year") }),
			v.object({ kind: v.literal("absolute"), start: v.number(), end: v.number() })
		)
	),
});

export type ReportDate = Infer<typeof reportDateValidator>;
export type ReportDateRange = ReportDate["range"];
export type ReportDateComparison = NonNullable<ReportDate["comparison"]>;

export const reportConfigV2Validator = v.object({
	version: v.literal(2),
	entityType: reportEntityTypeValidator,
	date: v.optional(reportDateValidator),
	filters: v.optional(reportFiltersValidator),
	metric: reportMetricValidator,
	/** Single dimension; timestamp fields use suffix encoding ("issuedDate_month"). */
	groupBy: v.optional(v.string()),
	segmentBy: v.optional(v.string()),
	includeEmptyValues: v.optional(v.boolean()),
	columns: v.optional(v.array(v.string())),
});

export type ReportConfigV2 = Infer<typeof reportConfigV2Validator>;

/** Revenue group-by keys mean "paid invoices only" (report-fields §8 d3). */
const PAID_RULE = { field: "status", operator: "equals" as const, value: "paid" };

function andPaidRule(filters: ReportFilters | undefined): ReportFilters {
	if (!filters || filters.groups.length === 0) {
		return { logic: "and", groups: [{ logic: "and", rules: [PAID_RULE] }] };
	}
	if (filters.logic === "and") {
		return {
			...filters,
			groups: [...filters.groups, { logic: "and", rules: [PAID_RULE] }],
		};
	}
	// (g1 OR g2) AND paid distributes into each group — sound only when every
	// group is itself a conjunction (or has a single rule).
	if (filters.groups.every((g) => g.logic === "and" || g.rules.length <= 1)) {
		return {
			logic: "or",
			groups: filters.groups.map((g) => ({
				logic: "and",
				rules: [...g.rules, PAID_RULE],
			})),
		};
	}
	throw new Error(
		"Cannot expand revenue report: top-level OR over multi-rule OR groups has no filter representation"
	);
}

export interface GroupByKeyOptions {
	metric?: ReportMetric;
	filters?: ReportFilters;
	range?: ReportDateRange;
	columns?: string[];
	visualization: ReportVisualization;
}

/**
 * Builds a v2 config from the AI's Group-by vocabulary (GROUP_BY_OPTIONS),
 * which still offers four composite keys — invoices `month`/`client`, quotes
 * `conversionRate`, tasks `completionRate` — that stand for whole configs
 * rather than fields. The builder authors those through the metric picker and
 * date-field select instead, so this is the assistant's path only. Composite
 * keys override any caller-supplied metric; plain registry keys pass through.
 */
export function configForGroupByKey(
	entityType: ReportEntityType,
	groupBy: string | undefined,
	options: GroupByKeyOptions
): { config: ReportConfigV2; visualization: ReportVisualization } {
	const { filters, range, columns, visualization } = options;
	const base = {
		version: 2 as const,
		entityType,
		...(filters ? { filters } : {}),
		...(range ? { date: { range } } : {}),
		...(columns ? { columns } : {}),
	};

	if (entityType === "invoices" && (groupBy === "month" || groupBy === "client")) {
		const revenue = {
			...base,
			filters: andPaidRule(filters),
			date: {
				field: "paidAt",
				range: range ?? { kind: "preset" as const, preset: "all_time" as const },
			},
			metric: { op: "sum" as const, field: "total" },
		};
		if (groupBy === "month") {
			return { config: { ...revenue, groupBy: "paidAt_month" }, visualization };
		}
		// Top-10 clients is an explicit series limit (§8 d3) — written into
		// options so the report keeps behavior if the render default changes.
		return {
			config: { ...revenue, groupBy: "clientId" },
			visualization: {
				...visualization,
				options: {
					sort: "value_desc",
					seriesLimit: 10,
					...visualization.options,
				},
			},
		};
	}

	if (entityType === "quotes" && groupBy === "conversionRate") {
		return {
			config: { ...base, metric: { op: "ratio", ratioKey: "conversionRate" } },
			visualization,
		};
	}

	if (entityType === "tasks" && groupBy === "completionRate") {
		return {
			config: { ...base, metric: { op: "ratio", ratioKey: "completionRate" } },
			visualization,
		};
	}

	const metric: ReportMetric = options.metric ?? { op: "count" };

	// Tasks-by-status is the one grouping that zero-fills its option buckets.
	const zeroFill =
		entityType === "tasks" && groupBy === "status" && metric.op === "count"
			? { includeEmptyValues: true }
			: {};

	return {
		config: { ...base, metric, ...(groupBy ? { groupBy } : {}), ...zeroFill },
		visualization,
	};
}

