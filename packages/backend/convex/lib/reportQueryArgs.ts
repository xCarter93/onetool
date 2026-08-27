/**
 * Shared contract for turning a report configuration into executeReport args.
 * Both callers — the web builder (report-config.ts resolveReportQueryArgs) and
 * the assistant's config generator (reportConfigGeneration.toExecuteReportArgs)
 * — delegate here so their routing can never drift.
 *
 * Callers normalize their own measure semantics before calling: the web passes
 * its `aggregation` through raw (an explicit { op: "count" } forces the generic
 * pipeline even on a legacy groupBy), while the assistant path collapses
 * count/fieldless measures to undefined first.
 */
import type { ReportFilters } from "./reportFilters";
import {
	DEFAULT_DETAIL_COLUMNS,
	usesLegacyDispatch,
	type ReportEntityType,
} from "./reportFields";

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
	groupBy?: string;
	dateRange?: { start?: number; end?: number };
	filters?: ReportFilters;
	aggregation?: { op: ReportAggregationOp; field?: string };
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
 * Once a groupBy IS set: a legacy-dispatch groupBy (status, leadSource,
 * month, ...) with no measure must omit `aggregation` so runReportByConfig
 * keeps its exact historical output, while a generic-only groupBy (e.g.
 * issuedDate_month, assigneeUserId) needs an explicit { op: "count" } so the
 * generic pipeline runs instead of legacy dispatch silently falling back to
 * the entity default.
 */
export function resolveReportQueryArgs(input: ReportQueryArgsInput): ExecuteReportArgs {
	const base = {
		entityType: input.entityType,
		groupBy: input.groupBy,
		dateRange: input.dateRange,
		filters: input.filters,
	};

	if (isDetailModeActive(input.visualization, input.groupBy, input.columns)) {
		return {
			...base,
			detail: { columns: effectiveDetailColumns(input.entityType, input.columns) },
		};
	}

	// isDetailModeActive already returned above whenever groupBy is unset, so
	// groupBy is guaranteed defined past this point.
	const aggregation =
		input.measure ??
		(usesLegacyDispatch(input.entityType, input.groupBy!)
			? undefined
			: { op: "count" as const });

	return { ...base, ...(aggregation ? { aggregation } : {}) };
}
