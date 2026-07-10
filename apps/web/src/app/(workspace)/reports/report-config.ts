import {
	AreaChart,
	BarChart3,
	Briefcase,
	ChartColumn,
	DollarSign,
	FileText,
	ListChecks,
	PieChart,
	Radar,
	Table as TableIcon,
	Target,
	TrendingUp,
	Users,
	type LucideIcon,
} from "lucide-react";
import type { ReportFilters } from "@onetool/backend/convex/lib/reportFilters";
import {
	DEFAULT_DETAIL_COLUMNS,
	GROUP_BY_OPTIONS,
	usesLegacyDispatch,
} from "@onetool/backend/convex/lib/reportFields";
import { REPORT_SCAN_CEILING } from "@onetool/backend/convex/lib/orgScan";

export type EntityType =
	| "clients"
	| "projects"
	| "tasks"
	| "quotes"
	| "invoices"
	| "activities";

export type VizType = "table" | "bar" | "column" | "line" | "pie" | "radar" | "radial";

export type MeasureOp = "count" | "sum" | "avg" | "min" | "max";
export type ReportMeasure =
	| { op: "count" }
	| { op: Exclude<MeasureOp, "count">; field: string };

export type ReportConfigShape = {
	entityType: EntityType;
	groupBy?: string[];
	dateRange?: { start?: number; end?: number };
	filters?: ReportFilters;
	aggregation?: ReportMeasure;
	/** Registry field names for detail-mode table columns; table viz only. */
	columns?: string[];
};

/**
 * Shape persisted to `reports.config` (matches packages/backend/convex/reports.ts
 * `reportConfigValidator`) — distinct from ReportConfigShape because saved
 * aggregations are a single-entry array keyed `operation`, not the `aggregation`
 * object executeReport takes (`op`). Count is represented by omitting
 * `aggregations` entirely (field is required for non-count operations).
 */
export type ReportSavedConfigShape = {
	entityType: EntityType;
	groupBy?: string[];
	dateRange?: { start?: number; end?: number };
	filters?: ReportFilters;
	aggregations?: { field: string; operation: Exclude<MeasureOp, "count"> }[];
	columns?: string[];
};

export const entityOptions: {
	value: EntityType;
	label: string;
	description: string;
	icon: LucideIcon;
}[] = [
	{ value: "clients", label: "Clients", description: "Customers and prospects", icon: Users },
	{ value: "projects", label: "Projects", description: "Project information", icon: Briefcase },
	{ value: "tasks", label: "Tasks", description: "Tasks and schedule items", icon: ListChecks },
	{ value: "quotes", label: "Quotes", description: "Quotes and proposals", icon: FileText },
	{ value: "invoices", label: "Invoices", description: "Invoices and revenue", icon: DollarSign },
	{ value: "activities", label: "Activities", description: "Activity log", icon: TrendingUp },
];

// Canonical list lives in the backend field registry so the builder, the
// assistant's report-config generator, and executeReport can't drift.
export const groupByOptions: Record<string, { value: string; label: string }[]> =
	GROUP_BY_OPTIONS;

export const visualizationOptions: {
	value: VizType;
	label: string;
	icon: LucideIcon;
}[] = [
	{ value: "bar", label: "Bar", icon: BarChart3 },
	{ value: "column", label: "Column", icon: ChartColumn },
	// Value stays "line" (schema/presets/saved reports unchanged) — user-facing
	// label + icon reflect the area-chart rendering (see ReportLineChart).
	{ value: "line", label: "Area", icon: AreaChart },
	{ value: "pie", label: "Pie", icon: PieChart },
	{ value: "radar", label: "Radar", icon: Radar },
	{ value: "radial", label: "Radial", icon: Target },
	{ value: "table", label: "Table", icon: TableIcon },
];

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
 * Decides whether a report's `total` and per-item `value`s are dollar
 * amounts, mirroring the semantics of packages/backend/convex/reportData.ts.
 * Charts must use this instead of inferring currency from value magnitude —
 * a magnitude heuristic mislabels a count (e.g. 12 invoices) as a dollar
 * figure when the real `total` prop is a much larger sum (e.g. $40,000).
 */
export function getReportValueTypes(
	entityType: string,
	groupBy?: string
): { totalIsCurrency: boolean; itemValueIsCurrency: boolean } {
	// conversionRate / completionRate reports: total is a 0-100 rate, items are counts.
	if (groupBy === "conversionRate" || groupBy === "completionRate") {
		return { totalIsCurrency: false, itemValueIsCurrency: false };
	}
	if (entityType === "invoices") {
		// "month"/"client" groupBy = revenue aggregates (item value already $).
		// default/"status" groupBy = per-status counts (dollar total lives in
		// each item's metadata.totalValue, not the item's `value` itself).
		return {
			totalIsCurrency: true,
			itemValueIsCurrency: groupBy === "month" || groupBy === "client",
		};
	}
	if (entityType === "quotes") {
		return { totalIsCurrency: true, itemValueIsCurrency: false };
	}
	return { totalIsCurrency: false, itemValueIsCurrency: false };
}

/**
 * Formats a report metric as USD or a plain count. `isCurrency` must come
 * from getReportValueTypes (or be otherwise explicit) — never from the
 * value's own magnitude.
 */
export function formatReportValue(
	value: number,
	isCurrency: boolean,
	options: { compact?: boolean } = {}
): string {
	if (!isCurrency) {
		return value.toLocaleString("en-US");
	}
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		notation: options.compact ? "compact" : "standard",
		maximumFractionDigits: options.compact ? 1 : 0,
	}).format(value);
}

// Canonical defaults live in the backend field registry (shared with the
// assistant's report-config generator).
export { DEFAULT_DETAIL_COLUMNS };

/**
 * True when the report should render raw rows instead of aggregated groups.
 * Charts require a Group by (Slice 3-D3: chart renders above the data table,
 * fed by the same grouped query) — with no Group by, there's nothing to
 * chart, so ANY viz type (table or chart) falls back to detail rows. Beyond
 * that, only the table view has its own explicit-columns override.
 */
export function isDetailModeActive(
	vizType: VizType,
	groupBy: string | undefined,
	columns: string[] | undefined
): boolean {
	if (!groupBy) return true;
	return vizType === "table" && (columns?.length ?? 0) > 0;
}

/** Columns to actually query/display in detail mode — falls back to a sensible per-entity default so the table (and its Columns checklist) never looks empty. */
export function effectiveDetailColumns(
	entityType: EntityType,
	columns: string[] | undefined
): string[] {
	return columns && columns.length > 0 ? columns : DEFAULT_DETAIL_COLUMNS[entityType];
}

export type ReportQueryArgs = {
	entityType: EntityType;
	groupBy?: string;
	dateRange?: { start?: number; end?: number };
	filters?: ReportFilters;
	aggregation?: ReportMeasure;
	detail?: { columns: string[] };
};

/**
 * Single source of truth for turning a builder/saved config into
 * executeReport args — must mirror the backend's toExecuteReportArgs
 * (reportConfigGeneration.ts) exactly, since both feed the same
 * executeReport query.
 *
 * "Group by: None" always means raw-row detail mode (with default columns
 * if none are checked) — this applies to every viz type, not just table,
 * since a chart with nothing to group on has nothing to chart above (see
 * isDetailModeActive). Once a groupBy IS set, chart views must send an
 * explicit `aggregation` (count included) when they don't already have a
 * measure — the backend's legacy dispatch (runReportByConfig) silently
 * re-groups by status when both `groupBy` and `aggregation` are omitted,
 * which is wrong for an intentional grouping.
 *
 * For a count measure with a groupBy set, whether that omission is safe
 * depends on the groupBy: legacy-dispatch values (status, leadSource,
 * creationDate_*, etc.) must still omit `aggregation` to hit the legacy
 * dispatch unchanged, but generic-only values (e.g. issuedDate_month,
 * assigneeUserId) need an explicit `{ op: "count" }` so the generic
 * pipeline runs instead of legacy dispatch silently falling back to the
 * entity default.
 */
export function resolveReportQueryArgs(
	config: ReportConfigShape,
	vizType: VizType
): ReportQueryArgs {
	const groupBy = config.groupBy?.[0];
	const base = {
		entityType: config.entityType,
		groupBy,
		dateRange: config.dateRange,
		filters: config.filters,
	};

	if (isDetailModeActive(vizType, groupBy, config.columns)) {
		return {
			...base,
			detail: { columns: effectiveDetailColumns(config.entityType, config.columns) },
		};
	}

	// isDetailModeActive already returned above whenever groupBy is unset, so
	// groupBy is guaranteed defined past this point.
	let aggregation: ReportMeasure | undefined;
	if (config.aggregation) {
		aggregation = config.aggregation;
	} else if (usesLegacyDispatch(config.entityType, groupBy!)) {
		aggregation = undefined;
	} else {
		aggregation = { op: "count" };
	}

	return { ...base, aggregation };
}

/** Shown when a report's underlying query hit the scan ceiling. */
export const TRUNCATION_NOTICE = `Based on the most recent ${REPORT_SCAN_CEILING.toLocaleString(
	"en-US"
)} records — results may be incomplete.`;

export function detectDateRangePreset(dateRange: {
	start?: number;
	end?: number;
}): string {
	if (!dateRange.start) return "all_time";

	const now = new Date();
	const startDate = new Date(dateRange.start);

	if (
		startDate.getMonth() === now.getMonth() &&
		startDate.getFullYear() === now.getFullYear() &&
		startDate.getDate() === 1
	) {
		return "this_month";
	}

	const currentQuarter = Math.floor(now.getMonth() / 3);
	const startQuarter = Math.floor(startDate.getMonth() / 3);
	if (startQuarter === currentQuarter && startDate.getFullYear() === now.getFullYear()) {
		return "this_quarter";
	}

	if (
		startDate.getFullYear() === now.getFullYear() &&
		startDate.getMonth() === 0 &&
		startDate.getDate() === 1
	) {
		return "this_year";
	}

	return "all_time";
}

/**
 * Map a concrete ms date range (e.g. from the assistant's configureReport
 * tool) onto builder state. detectDateRangePreset only recognizes a few
 * current-period presets and never returns "custom", so any other real
 * range must land on the custom preset — mapping it to "all_time" would
 * silently drop the bound.
 */
export function dateRangeToBuilderState(
	dateRange: { start?: number; end?: number } | null | undefined
): {
	preset: string;
	customRange?: { from: Date | undefined; to: Date | undefined };
} {
	if (
		!dateRange ||
		(dateRange.start === undefined && dateRange.end === undefined)
	) {
		return { preset: "all_time" };
	}
	const preset = detectDateRangePreset(dateRange);
	if (preset !== "all_time") return { preset };
	return {
		preset: "custom",
		customRange: {
			from:
				dateRange.start !== undefined ? new Date(dateRange.start) : undefined,
			to: dateRange.end !== undefined ? new Date(dateRange.end) : undefined,
		},
	};
}
