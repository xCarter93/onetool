/**
 * Shared contract for turning a report configuration into executeReport args.
 * Both callers — the web builder (report-config.ts resolveReportQueryArgs) and
 * the assistant's config generator (reportConfigGeneration.toExecuteReportArgs)
 * — delegate here so their routing can never drift.
 *
 * Since R8a the input is a saved (config, visualization) pair: v2 configs pass
 * through, v1 rows (staging scaffolding until R14) expand via
 * normalizeReportConfig, and executeReport receives
 * `{ entityType, config, seriesLimit?, detail? }`.
 */
import {
	normalizeReportConfig,
	type ReportConfig,
	type ReportConfigV2,
	type ReportVisualization,
} from "./reportConfig";
import { DEFAULT_DETAIL_COLUMNS, type ReportEntityType } from "./reportFields";

export type ReportVisualizationType = ReportVisualization["type"];

export type ReportAggregationOp = "count" | "sum" | "avg" | "min" | "max";

/** The args shape reportData.executeReport accepts. */
export interface ExecuteReportArgs {
	entityType: ReportEntityType;
	config: ReportConfigV2;
	seriesLimit?: number;
	detail?: { columns: string[] };
}

/**
 * True when the report should render raw rows instead of aggregated groups.
 * Ratio and related metrics always aggregate (they bucket without a groupBy);
 * otherwise no Group by means there's nothing to chart, so ANY viz type falls
 * back to detail rows, and the table view alone has an explicit-columns
 * override.
 */
export function isDetailModeActive(
	config: ReportConfigV2,
	vizType: ReportVisualizationType
): boolean {
	if (config.metric.op === "ratio" || config.metric.op === "related") return false;
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

export function resolveReportQueryArgs(
	savedConfig: ReportConfig,
	visualization: ReportVisualization
): ExecuteReportArgs {
	const { config, visualization: viz } = normalizeReportConfig(
		savedConfig,
		visualization
	);

	const base = { entityType: config.entityType, config };

	if (isDetailModeActive(config, viz.type)) {
		return {
			...base,
			detail: { columns: effectiveDetailColumns(config.entityType, config.columns) },
		};
	}

	const seriesLimit = viz.options?.seriesLimit;
	return { ...base, ...(seriesLimit !== undefined ? { seriesLimit } : {}) };
}
