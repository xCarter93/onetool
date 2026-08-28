/**
 * Shared contract for turning a saved (config, visualization) pair into
 * executeReport args. Both callers — the web builder (report-config.ts
 * resolveReportQueryArgs) and the assistant's config generator
 * (reportConfigGeneration.toExecuteReportArgs) — delegate here so their
 * routing can never drift.
 */
import type { ReportConfigV2, ReportVisualization } from "./reportConfig";
import { DEFAULT_DETAIL_COLUMNS, type ReportEntityType } from "./reportFields";

export type ReportVisualizationType = ReportVisualization["type"];

export type ReportAggregationOp = "count" | "sum" | "avg" | "min" | "max";

/** The args shape reportData.executeReport accepts. */
export interface ExecuteReportArgs {
	entityType: ReportEntityType;
	config: ReportConfigV2;
	seriesLimit?: number;
	sort?: "value_desc" | "value_asc" | "label_asc";
	detail?: { columns: string[] };
}

/**
 * True when the report should render raw rows instead of aggregated groups.
 * Ratio metrics always aggregate (they bucket without a groupBy); otherwise no
 * Group by means there's nothing to chart, so ANY viz type falls back to detail
 * rows, and the table view alone has an explicit-columns override.
 */
export function isDetailModeActive(
	config: ReportConfigV2,
	vizType: ReportVisualizationType
): boolean {
	if (config.metric.op === "ratio") return false;
	// Number is the scalar aggregate ("Total" point), never raw rows.
	if (vizType === "number") return false;
	if (!config.groupBy) return true;
	return vizType === "table" && (config.columns?.length ?? 0) > 0;
}

/** Columns to actually query/display in detail mode — falls back to a sensible per-entity default so the table (and its Columns checklist) never looks empty. */
export function effectiveDetailColumns(
	entityType: ReportEntityType,
	columns: string[] | undefined
): string[] {
	return columns && columns.length > 0 ? columns : DEFAULT_DETAIL_COLUMNS[entityType];
}

/** A comparison range needs two bounded windows to compare. */
function hasBoundedRange(config: ReportConfigV2): boolean {
	const range = config.date?.range;
	if (!range) return false;
	if (range.kind === "preset") return range.preset !== "all_time";
	return range.start !== undefined && range.end !== undefined;
}

/**
 * Whether a saved `date.comparison` actually runs (R11). Detail rows have no
 * buckets to pair; share-of-total charts have no second series to draw; an
 * unbounded range has no previous window; segments already own the second
 * dimension. Anything else reaches executeReport with the comparison intact.
 */
export function comparisonIsExecutable(
	config: ReportConfigV2,
	vizType: ReportVisualizationType
): boolean {
	if (!config.date?.comparison) return false;
	if (isDetailModeActive(config, vizType)) return false;
	if (vizType === "pie" || vizType === "radar" || vizType === "radial") return false;
	if (!hasBoundedRange(config)) return false;
	return !config.segmentBy;
}

function withoutComparison(config: ReportConfigV2): ReportConfigV2 {
	if (!config.date?.comparison) return config;
	const { comparison: _dropped, ...date } = config.date;
	return { ...config, date };
}

export function resolveReportQueryArgs(
	savedConfig: ReportConfigV2,
	viz: ReportVisualization
): ExecuteReportArgs {
	const config = comparisonIsExecutable(savedConfig, viz.type)
		? savedConfig
		: withoutComparison(savedConfig);

	const base = { entityType: config.entityType, config };

	if (isDetailModeActive(config, viz.type)) {
		return {
			...base,
			detail: { columns: effectiveDetailColumns(config.entityType, config.columns) },
		};
	}

	const seriesLimit = viz.options?.seriesLimit;
	const sort = viz.options?.sort;
	return {
		...base,
		...(seriesLimit !== undefined ? { seriesLimit } : {}),
		...(sort !== undefined ? { sort } : {}),
	};
}
