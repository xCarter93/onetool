/**
 * Saved report config v2: canonical types/validators plus the v1 normalizer.
 *
 * Lifecycle (PRD-reports-redesign §8 d9): zero v1 reports exist in production,
 * so the v1 arm and this normalizer are in-PRD scaffolding. Since R8a every
 * write (builder, presets, AI) emits native v2 and every read normalizes
 * through here; R14 converts the remaining staging rows and then deletes the
 * v1 validator, the union arm, and the expander.
 */
import { v, type Infer } from "convex/values";
import { literals } from "convex-helpers/validators";
import { RATIO_KEYS, reportEntityTypeValidator } from "./reportFields";
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

export const visualizationOptionsValidator = v.object({
	axisLabels: v.optional(v.boolean()),
	showZeros: v.optional(v.boolean()),
	stacked: v.optional(v.boolean()),
	sort: v.optional(literals("value_desc", "value_asc", "label_asc")),
	targetLine: v.optional(v.number()),
	seriesLimit: v.optional(v.number()),
});

export type VisualizationOptions = Infer<typeof visualizationOptionsValidator>;

export const reportVisualizationValidator = v.object({
	type: literals("table", "bar", "column", "line", "pie", "radar", "radial"),
	options: v.optional(visualizationOptionsValidator),
});

export type ReportVisualization = Infer<typeof reportVisualizationValidator>;

export const reportMetricValidator = v.object({
	op: literals("count", "sum", "avg", "min", "max", "ratio", "related"),
	field: v.optional(v.string()),
	ratioKey: v.optional(literals(...RATIO_KEYS)),
	// Related-rollup shape per §3.2; executable from R5.
	related: v.optional(
		v.object({
			entity: reportEntityTypeValidator,
			fk: v.string(),
			field: v.optional(v.string()),
			op: literals("count", "sum", "avg", "min", "max"),
			filters: v.optional(reportFiltersValidator),
		})
	),
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

export const reportConfigV1Validator = v.object({
	entityType: reportEntityTypeValidator,
	filters: v.optional(v.any()),
	aggregations: v.optional(
		v.array(
			v.object({
				field: v.string(),
				operation: literals("count", "sum", "avg", "min", "max"),
			})
		)
	),
	groupBy: v.optional(v.array(v.string())),
	columns: v.optional(v.array(v.string())),
	dateRange: v.optional(
		v.object({ start: v.optional(v.number()), end: v.optional(v.number()) })
	),
});

export type ReportConfigV1 = Infer<typeof reportConfigV1Validator>;

export const reportConfigValidator = v.union(
	reportConfigV1Validator,
	reportConfigV2Validator
);

export type ReportConfig = Infer<typeof reportConfigValidator>;

export function isV2Config(config: ReportConfig): config is ReportConfigV2 {
	return "version" in config && config.version === 2;
}

/** Legacy revenue reports only counted paid invoices (see scanPaidInvoices). */
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
		"Cannot expand legacy revenue report: top-level OR over multi-rule OR groups has no v2 filter representation"
	);
}

/** v1 `config.filters` is untyped — deep shape check before treating it as ReportFilters. */
export function isReportFilters(value: unknown): value is ReportFilters {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as { logic?: unknown; groups?: unknown };
	if (candidate.logic !== "and" && candidate.logic !== "or") return false;
	if (!Array.isArray(candidate.groups)) return false;
	return candidate.groups.every((g) => {
		if (typeof g !== "object" || g === null) return false;
		const group = g as { logic?: unknown; rules?: unknown };
		if (group.logic !== "and" && group.logic !== "or") return false;
		if (!Array.isArray(group.rules)) return false;
		return group.rules.every(
			(r) =>
				typeof r === "object" &&
				r !== null &&
				typeof (r as { field?: unknown }).field === "string"
		);
	});
}

function toAbsoluteRange(
	dateRange: ReportConfigV1["dateRange"]
): { kind: "absolute"; start?: number; end?: number } | undefined {
	if (!dateRange || (dateRange.start === undefined && dateRange.end === undefined)) {
		return undefined;
	}
	return {
		kind: "absolute",
		...(dateRange.start !== undefined ? { start: dateRange.start } : {}),
		...(dateRange.end !== undefined ? { end: dateRange.end } : {}),
	};
}

/**
 * Normalizes any saved (config, visualization) pair to canonical v2. v1 magic
 * groupBy keys expand to explicit v2 configs; the mapping is pinned by the
 * `report-v1-expansion.json` golden, and R4a's dual-run is what proves the
 * expanded configs reproduce legacy output. Expansion assumes the count
 * measure legacy dispatch implied — a v1 aggregation alongside a magic key
 * never routed to dispatch and is dropped here.
 */
export function normalizeReportConfig(
	config: ReportConfig,
	visualization: ReportVisualization
): { config: ReportConfigV2; visualization: ReportVisualization } {
	if (isV2Config(config)) return { config, visualization };

	const filters = isReportFilters(config.filters) ? config.filters : undefined;
	const range = toAbsoluteRange(config.dateRange);
	const groupBy = config.groupBy?.[0];
	const base = {
		version: 2 as const,
		entityType: config.entityType,
		...(filters ? { filters } : {}),
		...(range ? { date: { range } } : {}),
		...(config.columns ? { columns: config.columns } : {}),
	};

	if (config.entityType === "invoices" && (groupBy === "month" || groupBy === "client")) {
		// Legacy revenue: sum of totals over paid invoices, bucketed on paidAt.
		const revenue = {
			...base,
			filters: andPaidRule(filters),
			date: { field: "paidAt", range: range ?? { kind: "preset" as const, preset: "all_time" as const } },
			metric: { op: "sum" as const, field: "total" },
		};
		if (groupBy === "month") {
			return { config: { ...revenue, groupBy: "paidAt_month" }, visualization };
		}
		// Top-10 clients becomes an explicit series limit (§8 d3) — written into
		// options so migrated reports keep behavior if the render default changes.
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

	if (config.entityType === "quotes" && groupBy === "conversionRate") {
		return {
			config: { ...base, metric: { op: "ratio", ratioKey: "conversionRate" } },
			visualization,
		};
	}

	if (config.entityType === "tasks" && groupBy === "completionRate") {
		return {
			config: { ...base, metric: { op: "ratio", ratioKey: "completionRate" } },
			visualization,
		};
	}

	const agg = config.aggregations?.[0];
	const metric: ReportMetric =
		agg && agg.operation !== "count"
			? { op: agg.operation, field: agg.field }
			: { op: "count" };

	// Legacy tasks-by-status was the one zero-filled dispatch output (§8 d11).
	const zeroFill =
		config.entityType === "tasks" && groupBy === "status" && metric.op === "count"
			? { includeEmptyValues: true }
			: {};

	return {
		config: { ...base, metric, ...(groupBy ? { groupBy } : {}), ...zeroFill },
		visualization,
	};
}

