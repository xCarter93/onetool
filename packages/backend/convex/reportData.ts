import { QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getOrgTimezoneById } from "./lib/organization";
import { DateUtils } from "./lib/shared";
import { getOptionalOrgId } from "./lib/queries";
import { optionalUserQuery } from "./lib/factories";
import {
	scanOrgTable,
	REPORT_SCAN_CEILING,
	type ReportTable,
} from "./lib/orgScan";
import {
	getReportField,
	getReportDateField,
	type ReportEntityType,
} from "./lib/reportFields";
import {
	reportFiltersValidator,
	evaluateReportFilters,
	type ReportFilters,
} from "./lib/reportFilters";

/**
 * Report Data Queries
 * Provides aggregated data for report visualizations and analytics.
 *
 * executeReport is the only public export — it dispatches to a bounded,
 * org-scoped index scan (never `.collect()`s a whole org table) and groups
 * in memory. Legacy groupBy string literals (status, leadSource, month, ...)
 * keep their exact historical output shapes; `filters` and `aggregation` are
 * additive new capabilities layered on top via a generic pipeline.
 */

// ============================================================================
// Types
// ============================================================================

export interface AggregatedDataPoint {
	label: string;
	value: number;
	metadata?: Record<string, unknown>;
}

export interface ReportDataResult {
	data: AggregatedDataPoint[];
	total: number;
	metadata?: {
		entityType: string;
		dateRange?: { start: number; end: number };
		groupBy?: string;
		truncated?: boolean;
		totalIsCurrency?: boolean;
		itemValueIsCurrency?: boolean;
	};
}

type Row = Record<string, unknown>;

const emptyReportResult = (): ReportDataResult => ({ data: [], total: 0 });

// ============================================================================
// Validators
// ============================================================================

const dateRangeValidator = v.optional(
	v.object({
		start: v.optional(v.number()),
		end: v.optional(v.number()),
	})
);

const aggregationValidator = v.optional(
	v.object({
		op: v.union(
			v.literal("count"),
			v.literal("sum"),
			v.literal("avg"),
			v.literal("min"),
			v.literal("max")
		),
		field: v.optional(v.string()),
	})
);

type AggregationOp = "count" | "sum" | "avg" | "min" | "max";
interface Aggregation {
	op: AggregationOp;
	field?: string;
}

// ============================================================================
// Date Bounds (exact millisecond bounds — no server-local re-clamping)
// ============================================================================

interface DateBoundsResult {
	start?: number;
	end?: number;
	hasDateFilter: boolean;
}

/**
 * Resolve date bounds for a date range. The caller (frontend) computes any
 * day-boundary clamping it wants before sending start/end — the backend
 * treats these as exact millisecond bounds. Returns hasDateFilter: false for
 * "all time" (no start or end supplied).
 */
function resolveDateBounds(dateRange?: {
	start?: number;
	end?: number;
}): DateBoundsResult {
	if (!dateRange || (dateRange.start === undefined && dateRange.end === undefined)) {
		return { hasDateFilter: false };
	}
	return {
		start: dateRange.start,
		end: dateRange.end ?? Date.now(),
		hasDateFilter: true,
	};
}

function inDateBounds(value: unknown, bounds: DateBoundsResult): boolean {
	if (!bounds.hasDateFilter) return true;
	if (typeof value !== "number") return false;
	if (bounds.start !== undefined && value < bounds.start) return false;
	if (bounds.end !== undefined && value > bounds.end) return false;
	return true;
}

function metadataDateRange(bounds: DateBoundsResult): { start: number; end: number } | undefined {
	if (!bounds.hasDateFilter || bounds.start === undefined || bounds.end === undefined) {
		return undefined;
	}
	return { start: bounds.start, end: bounds.end };
}

// ============================================================================
// Date Grouping Utilities
// ============================================================================

type Granularity = "day" | "week" | "month";

/** Sunday week-start, computed in the given IANA timezone (not server-local). */
function weekStartKey(timestamp: number, timezone?: string): string {
	const dateStr = DateUtils.toLocalDateString(timestamp, timezone);
	const d = new Date(dateStr + "T00:00:00Z");
	const dayOfWeek = d.getUTCDay();
	d.setUTCDate(d.getUTCDate() - dayOfWeek);
	return d.toISOString().split("T")[0];
}

function getDateKey(timestamp: number, granularity: Granularity, timezone?: string): string {
	switch (granularity) {
		case "day":
			return DateUtils.toLocalDateString(timestamp, timezone);
		case "week":
			return weekStartKey(timestamp, timezone);
		case "month":
		default:
			return DateUtils.toLocalDateString(timestamp, timezone).substring(0, 7);
	}
}

function formatDateLabel(dateKey: string, granularity: Granularity): string {
	switch (granularity) {
		case "day": {
			const date = new Date(dateKey + "T12:00:00");
			return date.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
		}
		case "week": {
			const date = new Date(dateKey + "T12:00:00");
			return `Week of ${date.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			})}`;
		}
		case "month":
		default: {
			const [year, month] = dateKey.split("-");
			const date = new Date(parseInt(year), parseInt(month) - 1, 1);
			return date.toLocaleDateString("en-US", {
				month: "short",
				year: "numeric",
			});
		}
	}
}

function groupByDate(
	rows: Row[],
	getTimestamp: (row: Row) => number,
	granularity: Granularity,
	timezone: string | undefined,
	aggregation?: Aggregation
): AggregatedDataPoint[] {
	const buckets: Record<string, Row[]> = {};
	for (const row of rows) {
		const key = getDateKey(getTimestamp(row), granularity, timezone);
		(buckets[key] ??= []).push(row);
	}

	return Object.entries(buckets)
		.map(([dateKey, bucketRows]) => ({
			label: formatDateLabel(dateKey, granularity),
			value: computeAggregateValue(bucketRows, aggregation),
			metadata: { dateKey },
		}))
		.sort((a, b) => {
			const aKey = a.metadata?.dateKey as string;
			const bKey = b.metadata?.dateKey as string;
			return aKey.localeCompare(bKey);
		});
}

// ============================================================================
// Label / Value Formatting Utilities
// ============================================================================

function capitalizeWords(text: string, separator: string | RegExp): string {
	return text
		.split(separator)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function num(value: unknown): number {
	return typeof value === "number" ? value : 0;
}

function str(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function countsToDataPoints(
	counts: Record<string, number>,
	labelMap?: Record<string, string>,
	filterZero = true
): AggregatedDataPoint[] {
	const entries = Object.entries(counts);
	const filtered = filterZero ? entries.filter(([, count]) => count > 0) : entries;
	return filtered.map(([key, count]) => ({
		label: labelMap?.[key] ?? capitalizeWords(key, "-"),
		value: count,
	}));
}

function countByField(rows: Row[], field: string): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const row of rows) {
		const value = String(row[field] ?? "unknown");
		counts[value] = (counts[value] ?? 0) + 1;
	}
	return counts;
}

// ============================================================================
// Generic Aggregation
// ============================================================================

function computeAggregateValue(rows: Row[], aggregation?: Aggregation): number {
	const op = aggregation?.op ?? "count";
	if (op === "count") return rows.length;

	const field = aggregation?.field;
	const nums = field
		? rows.map((r) => r[field]).filter((v): v is number => typeof v === "number")
		: [];
	if (nums.length === 0) return 0;

	switch (op) {
		case "sum":
			return nums.reduce((a, b) => a + b, 0);
		case "avg":
			return nums.reduce((a, b) => a + b, 0) / nums.length;
		case "min":
			return Math.min(...nums);
		case "max":
			return Math.max(...nums);
	}
}

// ============================================================================
// Filter / Aggregation Validation
// ============================================================================

function validateFilters(entityType: ReportEntityType, filters?: ReportFilters): void {
	if (!filters) return;
	for (const group of filters.groups) {
		for (const rule of group.rules) {
			if (!getReportField(entityType, rule.field)) {
				throw new ConvexError(
					`Unknown report filter field "${rule.field}" for entity "${entityType}"`
				);
			}
		}
	}
}

function validateAggregation(entityType: ReportEntityType, aggregation?: Aggregation): void {
	if (!aggregation || aggregation.op === "count") return;
	if (!aggregation.field) {
		throw new ConvexError(`Aggregation op "${aggregation.op}" requires a field`);
	}
	const def = getReportField(entityType, aggregation.field);
	if (!def) {
		throw new ConvexError(
			`Unknown report aggregation field "${aggregation.field}" for entity "${entityType}"`
		);
	}
	if (def.type !== "number" && def.type !== "currency") {
		throw new ConvexError(
			`Report aggregation field "${aggregation.field}" is not numeric for entity "${entityType}"`
		);
	}
}

function validateGroupByField(entityType: ReportEntityType, field: string): void {
	if (!getReportField(entityType, field)) {
		throw new ConvexError(
			`Unknown report groupBy field "${field}" for entity "${entityType}"`
		);
	}
}

// ============================================================================
// Scanning helper
// ============================================================================

async function scanFiltered(
	ctx: QueryCtx,
	table: ReportTable,
	orgId: Id<"organizations">,
	dateField: string,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<{ rows: Row[]; truncated: boolean }> {
	const predicate = (row: Row) => {
		if (!inDateBounds(row[dateField], bounds)) return false;
		if (filters && !evaluateReportFilters(row, filters)) return false;
		return true;
	};

	// Early-exit only applies when the date filter is on _creationTime, since
	// the scan is creation-desc — anything past the bound genuinely can't match.
	const stopBelowCreationTime =
		dateField === "_creationTime" && bounds.hasDateFilter && bounds.start !== undefined
			? bounds.start
			: undefined;

	const { matches, truncated } = await scanOrgTable(ctx, table, orgId, {
		predicate,
		maxScan: REPORT_SCAN_CEILING,
		stopBelowCreationTime,
	});

	return { rows: matches, truncated };
}

// ============================================================================
// Generic aggregation pipeline (new capability — used only when args.aggregation is set)
// ============================================================================

const timeGroupingRegex = /^([a-zA-Z_]+)_(day|week|month)$/;

async function runGenericAggregation(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	entityType: ReportEntityType,
	groupBy: string | undefined,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined,
	aggregation: Aggregation,
	timezone: string | undefined
): Promise<ReportDataResult> {
	const dateField = getReportDateField(entityType);
	const { rows, truncated } = await scanFiltered(
		ctx,
		entityType,
		orgId,
		dateField,
		bounds,
		filters
	);

	let data: AggregatedDataPoint[];

	const timeMatch = groupBy?.match(timeGroupingRegex);
	if (timeMatch) {
		const field = timeMatch[1];
		const granularity = timeMatch[2] as Granularity;
		const fieldDef = getReportField(entityType, field);
		if (!fieldDef) {
			throw new ConvexError(
				`Unknown report groupBy time field "${field}" for entity "${entityType}"`
			);
		}
		if (fieldDef.type !== "timestamp") {
			throw new ConvexError(
				`Report groupBy time field "${field}" is not a timestamp for entity "${entityType}"`
			);
		}
		data = groupByDate(rows, (r) => num(r[field]), granularity, timezone, aggregation);
	} else if (groupBy) {
		validateGroupByField(entityType, groupBy);
		if (getReportField(entityType, groupBy)?.type === "timestamp") {
			throw new ConvexError(
				`Report groupBy field "${groupBy}" is a timestamp — use "${groupBy}_day", "${groupBy}_week", or "${groupBy}_month"`
			);
		}
		const buckets: Record<string, Row[]> = {};
		for (const row of rows) {
			const raw = row[groupBy];
			const key =
				raw === undefined || raw === null || raw === "" ? "unknown" : String(raw);
			(buckets[key] ??= []).push(row);
		}
		data = Object.entries(buckets)
			.map(([key, bucketRows]) => ({
				label: capitalizeWords(key, "-"),
				value: computeAggregateValue(bucketRows, aggregation),
			}))
			.sort((a, b) => b.value - a.value);
	} else {
		data = [{ label: "Total", value: computeAggregateValue(rows, aggregation) }];
	}

	const total = computeAggregateValue(rows, aggregation);
	const fieldDef = aggregation.field ? getReportField(entityType, aggregation.field) : undefined;
	const isCurrency = aggregation.op !== "count" && fieldDef?.type === "currency";

	return {
		data,
		total,
		metadata: {
			entityType,
			dateRange: metadataDateRange(bounds),
			groupBy,
			truncated,
			totalIsCurrency: isCurrency,
			itemValueIsCurrency: isCurrency,
		},
	};
}

// ============================================================================
// Legacy per-entity implementations (exact historical output shapes)
// ============================================================================

async function scanEntity(
	ctx: QueryCtx,
	entityType: ReportEntityType,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<{ rows: Row[]; truncated: boolean }> {
	return scanFiltered(ctx, entityType, orgId, getReportDateField(entityType), bounds, filters);
}

async function queryClientsByStatus(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "clients", orgId, bounds, filters);
	const counts = countByField(rows, "status");
	const normalized = { lead: 0, active: 0, inactive: 0, archived: 0, ...counts };
	const labels: Record<string, string> = {
		lead: "Prospective",
		active: "Active",
		inactive: "Inactive",
		archived: "Archived",
	};
	return {
		data: countsToDataPoints(normalized, labels, true),
		total: rows.length,
		metadata: {
			entityType: "clients",
			dateRange: metadataDateRange(bounds),
			groupBy: "status",
			truncated,
		},
	};
}

async function queryClientsByLeadSource(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "clients", orgId, bounds, filters);
	const sourceCounts: Record<string, number> = {};
	for (const row of rows) {
		const source = str(row.leadSource) || "unknown";
		sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
	}
	const data = Object.entries(sourceCounts)
		.map(([source, count]) => ({ label: capitalizeWords(source, "-"), value: count }))
		.sort((a, b) => b.value - a.value);
	return {
		data,
		total: rows.length,
		metadata: {
			entityType: "clients",
			dateRange: metadataDateRange(bounds),
			groupBy: "leadSource",
			truncated,
		},
	};
}

async function queryClientsByCreationDate(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined,
	granularity: Granularity,
	timezone: string | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "clients", orgId, bounds, filters);
	const data = groupByDate(rows, (r) => r._creationTime as number, granularity, timezone);
	return {
		data,
		total: rows.length,
		metadata: {
			entityType: "clients",
			dateRange: metadataDateRange(bounds),
			groupBy: `creationDate_${granularity}`,
			truncated,
		},
	};
}

async function queryProjectsByStatus(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "projects", orgId, bounds, filters);
	const counts = countByField(rows, "status");
	const normalized = { planned: 0, "in-progress": 0, completed: 0, cancelled: 0, ...counts };
	return {
		data: countsToDataPoints(normalized, undefined, true),
		total: rows.length,
		metadata: {
			entityType: "projects",
			dateRange: metadataDateRange(bounds),
			groupBy: "status",
			truncated,
		},
	};
}

async function queryProjectsByType(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "projects", orgId, bounds, filters);
	const counts = countByField(rows, "projectType");
	const normalized = { "one-off": 0, recurring: 0, ...counts };
	const labels: Record<string, string> = { "one-off": "One-off", recurring: "Recurring" };
	return {
		data: countsToDataPoints(normalized, labels, true),
		total: rows.length,
		metadata: {
			entityType: "projects",
			dateRange: metadataDateRange(bounds),
			groupBy: "projectType",
			truncated,
		},
	};
}

async function queryProjectsByCreationDate(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined,
	granularity: Granularity,
	timezone: string | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "projects", orgId, bounds, filters);
	const data = groupByDate(rows, (r) => r._creationTime as number, granularity, timezone);
	return {
		data,
		total: rows.length,
		metadata: {
			entityType: "projects",
			dateRange: metadataDateRange(bounds),
			groupBy: `creationDate_${granularity}`,
			truncated,
		},
	};
}

async function queryTasksByStatus(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "tasks", orgId, bounds, filters);
	const counts = countByField(rows, "status");
	const normalized = { pending: 0, "in-progress": 0, completed: 0, cancelled: 0, ...counts };
	return {
		data: countsToDataPoints(normalized, undefined, false),
		total: rows.length,
		metadata: {
			entityType: "tasks",
			dateRange: metadataDateRange(bounds),
			groupBy: "status",
			truncated,
		},
	};
}

async function queryTaskCompletionRate(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "tasks", orgId, bounds, filters);
	const totalTasks = rows.length;
	const completedTasks = rows.filter((r) => r.status === "completed").length;
	const pendingTasks = rows.filter(
		(r) => r.status === "pending" || r.status === "in-progress"
	).length;
	const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
	return {
		data: [
			{ label: "Completed", value: completedTasks },
			{ label: "Pending", value: pendingTasks },
		],
		total: completionRate,
		metadata: {
			entityType: "tasks",
			dateRange: metadataDateRange(bounds),
			groupBy: "completionRate",
			truncated,
		},
	};
}

async function queryTasksByDate(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined,
	granularity: Granularity,
	timezone: string | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "tasks", orgId, bounds, filters);
	const data = groupByDate(rows, (r) => num(r.date), granularity, timezone);
	return {
		data,
		total: rows.length,
		metadata: {
			entityType: "tasks",
			dateRange: metadataDateRange(bounds),
			groupBy: `date_${granularity}`,
			truncated,
		},
	};
}

const QUOTE_STATUSES = ["draft", "sent", "approved", "declined", "expired"] as const;

async function queryQuotesByStatus(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "quotes", orgId, bounds, filters);
	const statusData: Record<string, { count: number; total: number }> = {};
	for (const s of QUOTE_STATUSES) statusData[s] = { count: 0, total: 0 };

	for (const row of rows) {
		const status = str(row.status);
		if (statusData[status]) {
			statusData[status].count++;
			statusData[status].total += num(row.total);
		}
	}

	const data: AggregatedDataPoint[] = Object.entries(statusData)
		.filter(([, info]) => info.count > 0)
		.map(([status, info]) => ({
			label: status.charAt(0).toUpperCase() + status.slice(1),
			value: info.count,
			metadata: { totalValue: info.total },
		}));

	const totalValue = rows.reduce((sum, r) => sum + num(r.total), 0);

	return {
		data,
		total: totalValue,
		metadata: {
			entityType: "quotes",
			dateRange: metadataDateRange(bounds),
			groupBy: "status",
			truncated,
			totalIsCurrency: true,
		},
	};
}

async function queryQuoteConversionRate(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "quotes", orgId, bounds, filters);
	const sentOrResolved = rows.filter((r) =>
		["sent", "approved", "declined", "expired"].includes(str(r.status))
	);
	const approved = rows.filter((r) => r.status === "approved");
	const conversionRate =
		sentOrResolved.length > 0
			? Math.round((approved.length / sentOrResolved.length) * 100)
			: 0;
	return {
		data: [
			{ label: "Approved", value: approved.length },
			{ label: "Not Approved", value: sentOrResolved.length - approved.length },
		],
		total: conversionRate,
		metadata: {
			entityType: "quotes",
			dateRange: metadataDateRange(bounds),
			groupBy: "conversionRate",
			truncated,
		},
	};
}

const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "cancelled"] as const;

async function queryInvoicesByStatus(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "invoices", orgId, bounds, filters);
	const statusData: Record<string, { count: number; total: number }> = {};
	for (const s of INVOICE_STATUSES) statusData[s] = { count: 0, total: 0 };

	for (const row of rows) {
		const status = str(row.status);
		if (statusData[status]) {
			statusData[status].count++;
			statusData[status].total += num(row.total);
		}
	}

	const data: AggregatedDataPoint[] = Object.entries(statusData)
		.filter(([, info]) => info.count > 0)
		.map(([status, info]) => ({
			label: status.charAt(0).toUpperCase() + status.slice(1),
			value: info.count,
			metadata: { totalValue: info.total },
		}));

	const totalValue = rows.reduce((sum, r) => sum + num(r.total), 0);

	return {
		data,
		total: totalValue,
		metadata: {
			entityType: "invoices",
			dateRange: metadataDateRange(bounds),
			groupBy: "status",
			truncated,
			totalIsCurrency: true,
		},
	};
}

/** Revenue reports (month/client) key off paidAt, not the entity's default dateField (issuedDate). */
async function scanPaidInvoices(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<{ rows: Row[]; truncated: boolean }> {
	const predicate = (row: Row) => {
		if (row.status !== "paid" || row.paidAt === undefined || row.paidAt === null) {
			return false;
		}
		if (!inDateBounds(row.paidAt, bounds)) return false;
		if (filters && !evaluateReportFilters(row, filters)) return false;
		return true;
	};
	const { matches, truncated } = await scanOrgTable(ctx, "invoices", orgId, {
		predicate,
		maxScan: REPORT_SCAN_CEILING,
	});
	return { rows: matches, truncated };
}

async function queryRevenueByMonth(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined,
	timezone: string | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanPaidInvoices(ctx, orgId, bounds, filters);

	const monthlyRevenue: Record<string, number> = {};
	for (const row of rows) {
		const dateStr = DateUtils.toLocalDateString(num(row.paidAt), timezone);
		const monthKey = dateStr.substring(0, 7);
		monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] ?? 0) + num(row.total);
	}

	const data: AggregatedDataPoint[] = Object.entries(monthlyRevenue)
		.map(([month, value]) => ({ label: month, value }))
		.sort((a, b) => a.label.localeCompare(b.label));

	const totalRevenue = rows.reduce((sum, r) => sum + num(r.total), 0);

	return {
		data,
		total: totalRevenue,
		metadata: {
			entityType: "invoices",
			dateRange: metadataDateRange(bounds),
			groupBy: "month",
			truncated,
			totalIsCurrency: true,
			itemValueIsCurrency: true,
		},
	};
}

async function queryRevenueByClient(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanPaidInvoices(ctx, orgId, bounds, filters);

	const clientRevenue: Record<string, number> = {};
	for (const row of rows) {
		const clientId = String(row.clientId);
		clientRevenue[clientId] = (clientRevenue[clientId] ?? 0) + num(row.total);
	}

	const top10 = Object.entries(clientRevenue)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 10);

	const clientDocs = await Promise.all(
		top10.map(([id]) => ctx.db.get(id as Id<"clients">))
	);

	const data: AggregatedDataPoint[] = top10.map(([clientId, revenue], index) => ({
		label: clientDocs[index]?.companyName || "Unknown Client",
		value: revenue,
		metadata: { clientId },
	}));

	const totalRevenue = rows.reduce((sum, r) => sum + num(r.total), 0);

	return {
		data,
		total: totalRevenue,
		metadata: {
			entityType: "invoices",
			dateRange: metadataDateRange(bounds),
			groupBy: "client",
			truncated,
			totalIsCurrency: true,
			itemValueIsCurrency: true,
		},
	};
}

async function queryActivitiesByType(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "activities", orgId, bounds, filters);
	const typeCounts = countByField(rows, "activityType");
	const data = Object.entries(typeCounts)
		.map(([type, count]) => ({ label: capitalizeWords(type, "_"), value: count }))
		.sort((a, b) => b.value - a.value);
	return {
		data,
		total: rows.length,
		metadata: {
			entityType: "activities",
			dateRange: metadataDateRange(bounds),
			groupBy: "activityType",
			truncated,
		},
	};
}

async function queryActivitiesByDate(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined,
	granularity: Granularity,
	timezone: string | undefined
): Promise<ReportDataResult> {
	const { rows, truncated } = await scanEntity(ctx, "activities", orgId, bounds, filters);
	const data = groupByDate(rows, (r) => num(r.timestamp), granularity, timezone);
	return {
		data,
		total: rows.length,
		metadata: {
			entityType: "activities",
			dateRange: metadataDateRange(bounds),
			groupBy: `timestamp_${granularity}`,
			truncated,
		},
	};
}

// ============================================================================
// Generic Report Execution (legacy dispatch — preserves exact historical shapes)
// ============================================================================

async function runReportByConfig(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	entityType: ReportEntityType,
	groupBy: string | undefined,
	dateRange: { start?: number; end?: number } | undefined,
	filters: ReportFilters | undefined
): Promise<ReportDataResult> {
	const bounds = resolveDateBounds(dateRange);
	const timeGroupingMatch = groupBy?.match(
		/^(creationDate|date|timestamp)_(day|week|month)$/
	);

	if (timeGroupingMatch) {
		const granularity = timeGroupingMatch[2] as Granularity;
		const timezone = await getOrgTimezoneById(ctx, orgId);
		switch (entityType) {
			case "clients":
				return await queryClientsByCreationDate(ctx, orgId, bounds, filters, granularity, timezone);
			case "projects":
				return await queryProjectsByCreationDate(ctx, orgId, bounds, filters, granularity, timezone);
			case "tasks":
				return await queryTasksByDate(ctx, orgId, bounds, filters, granularity, timezone);
			case "activities":
				return await queryActivitiesByDate(ctx, orgId, bounds, filters, granularity, timezone);
			default:
				return emptyReportResult();
		}
	}

	switch (entityType) {
		case "clients":
			if (groupBy === "leadSource") {
				return await queryClientsByLeadSource(ctx, orgId, bounds, filters);
			}
			return await queryClientsByStatus(ctx, orgId, bounds, filters);

		case "projects":
			if (groupBy === "projectType") {
				return await queryProjectsByType(ctx, orgId, bounds, filters);
			}
			return await queryProjectsByStatus(ctx, orgId, bounds, filters);

		case "tasks":
			if (groupBy === "completionRate") {
				return await queryTaskCompletionRate(ctx, orgId, bounds, filters);
			}
			return await queryTasksByStatus(ctx, orgId, bounds, filters);

		case "quotes":
			if (groupBy === "conversionRate") {
				return await queryQuoteConversionRate(ctx, orgId, bounds, filters);
			}
			return await queryQuotesByStatus(ctx, orgId, bounds, filters);

		case "invoices":
			if (groupBy === "month") {
				const timezone = await getOrgTimezoneById(ctx, orgId);
				return await queryRevenueByMonth(ctx, orgId, bounds, filters, timezone);
			}
			if (groupBy === "client") {
				return await queryRevenueByClient(ctx, orgId, bounds, filters);
			}
			return await queryInvoicesByStatus(ctx, orgId, bounds, filters);

		case "activities":
			return await queryActivitiesByType(ctx, orgId, bounds, filters);

		default:
			return emptyReportResult();
	}
}

// ============================================================================
// Public export
// ============================================================================

export const executeReport = optionalUserQuery({
	args: {
		entityType: v.union(
			v.literal("clients"),
			v.literal("projects"),
			v.literal("tasks"),
			v.literal("quotes"),
			v.literal("invoices"),
			v.literal("activities")
		),
		groupBy: v.optional(v.string()),
		dateRange: dateRangeValidator,
		filters: v.optional(reportFiltersValidator),
		aggregation: aggregationValidator,
	},
	handler: async (ctx, args): Promise<ReportDataResult> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyReportResult();

		const entityType = args.entityType as ReportEntityType;
		const filters = args.filters as ReportFilters | undefined;
		const aggregation = args.aggregation as Aggregation | undefined;

		validateFilters(entityType, filters);
		validateAggregation(entityType, aggregation);

		if (aggregation) {
			const bounds = resolveDateBounds(args.dateRange);
			const timezone = await getOrgTimezoneById(ctx, orgId);
			return await runGenericAggregation(
				ctx,
				orgId,
				entityType,
				args.groupBy,
				bounds,
				filters,
				aggregation,
				timezone
			);
		}

		return await runReportByConfig(ctx, orgId, entityType, args.groupBy, args.dateRange, filters);
	},
});

// Re-export field registry types for internal reuse (e.g. by future callers
// that want to introspect what a report can filter/group on).
export type { ReportEntityType } from "./lib/reportFields";
export { REPORT_FIELDS } from "./lib/reportFields";
