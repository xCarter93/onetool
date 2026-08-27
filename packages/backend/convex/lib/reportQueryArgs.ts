/**
 * Shared contract for turning a report configuration into executeReport args.
 * Both callers — the web builder (report-config.ts resolveReportQueryArgs) and
 * the assistant's config generator (reportConfigGeneration.toExecuteReportArgs)
 * — delegate here so their routing can never drift.
 *
 * Since R4c every request executes as a v2 config: the input's v1-shaped state
 * (including magic groupBy keys like "month"/"conversionRate", which the pre-R8
 * builder still offers) runs through normalizeReportConfig, and executeReport
 * receives `{ entityType, config, seriesLimit?, detail? }`. The legacy args are
 * deleted at R14 (§8 d11).
 */
import type { ReportFilters } from "./reportFilters";
import {
	normalizeReportConfig,
	type ReportConfigV2,
} from "./reportConfig";
import { DEFAULT_DETAIL_COLUMNS, type ReportEntityType } from "./reportFields";

export type ReportVisualizationType =
	| "table"
	| "bar"
	| "column"
	| "line"
	| "pie"
	| "radar"
	| "radial";

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
 * Charts require a Group by (Slice 3-D3: chart renders above the data table,
 * fed by the same grouped query) — with no Group by, there's nothing to
 * chart, so ANY viz type (table or chart) falls back to detail rows. Beyond
 * that, only the table view has its own explicit-columns override.
 */
export function isDetailModeActive(
	vizType: ReportVisualizationType,
	groupBy: string | undefined,
	columns: string[] | undefined
): boolean {
	if (!groupBy) return true;
	return vizType === "table" && (columns?.length ?? 0) > 0;
}

/** Columns to actually query/display in detail mode — falls back to a sensible per-entity default so the table (and its Columns checklist) never looks empty. */
export function effectiveDetailColumns(
	entityType: ReportEntityType,
	columns: string[] | undefined
): string[] {
	return columns && columns.length > 0 ? columns : DEFAULT_DETAIL_COLUMNS[entityType];
}

export interface ReportQueryArgsInput {
	entityType: ReportEntityType;
	groupBy?: string;
	dateRange?: { start?: number; end?: number };
	filters?: ReportFilters;
	/** Caller-normalized measure — see module doc. */
	measure?: { op: ReportAggregationOp; field?: string };
	columns?: string[];
	visualization: ReportVisualizationType;
}

/**
 * "Group by: None" always means raw-row detail mode (with default columns if
 * none are checked) — for every viz type, not just table, since a chart with
 * nothing to group on has nothing to chart above (see isDetailModeActive).
 *
 * A non-count measure missing its field is forwarded with an empty field so
 * executeReport's validateAggregation rejects it, matching the pre-R4c error.
 */
export function resolveReportQueryArgs(input: ReportQueryArgsInput): ExecuteReportArgs {
	const measure = input.measure;
	const { config, visualization } = normalizeReportConfig(
		{
			entityType: input.entityType,
			...(input.groupBy ? { groupBy: [input.groupBy] } : {}),
			...(input.dateRange ? { dateRange: input.dateRange } : {}),
			...(input.filters ? { filters: input.filters } : {}),
			...(measure && measure.op !== "count"
				? { aggregations: [{ field: measure.field ?? "", operation: measure.op }] }
				: {}),
			...(input.columns ? { columns: input.columns } : {}),
		},
		{ type: input.visualization }
	);

	const base = { entityType: input.entityType, config };

	if (isDetailModeActive(input.visualization, input.groupBy, input.columns)) {
		return {
			...base,
			detail: { columns: effectiveDetailColumns(input.entityType, input.columns) },
		};
	}

	const seriesLimit = visualization.options?.seriesLimit;
	return { ...base, ...(seriesLimit !== undefined ? { seriesLimit } : {}) };
}
