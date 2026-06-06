import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getOrgTimezoneById } from "./lib/organization";
import { DateUtils } from "./lib/shared";
import {
	getOptionalOrgId,
	filterByCreationTime,
	filterByTimestamp,
	countByField,
	paginate,
	getPaginationMeta,
	DateRange,
} from "./lib/queries";
import { optionalUserQuery, userMutation } from "./lib/factories";

/**
 * Report Data Queries
 * Provides aggregated data for report visualizations and analytics
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
	};
}

export interface PaginatedReportDataResult extends ReportDataResult {
	nextCursor?: string;
	hasMore: boolean;
}

// Empty result helpers for unauthenticated users
const emptyReportResult = (): ReportDataResult => ({ data: [], total: 0 });
const emptyPaginatedResult = (): PaginatedReportDataResult => ({
	data: [],
	total: 0,
	hasMore: false,
});

// ============================================================================
// Validators
// ============================================================================

const dateRangeValidator = v.optional(
	v.object({
		start: v.optional(v.number()),
		end: v.optional(v.number()),
	})
);

const paginationValidator = {
	limit: v.optional(v.number()),
	cursor: v.optional(v.string()),
};

// ============================================================================
// Date Utilities (Report-Specific)
// ============================================================================

/**
 * Date bounds result with optional filter flag.
 * Different from lib/queries.ts getDateRangeBounds - this supports "all time" queries
 * when no date range is specified (returns hasDateFilter: false).
 */
interface DateBoundsResult {
	start?: number;
	end?: number;
	hasDateFilter: boolean;
}

/**
 * Get normalized date bounds for a date range.
 * Returns undefined bounds if no date range is specified (meaning "all time").
 */
function getDateBounds(dateRange?: {
	start?: number;
	end?: number;
}): DateBoundsResult {
	if (!dateRange || (!dateRange.start && !dateRange.end)) {
		return { start: undefined, end: undefined, hasDateFilter: false };
	}

	const now = Date.now();
	const start = dateRange.start
		? DateUtils.startOfDay(dateRange.start)
		: undefined;
	const end = dateRange.end
		? DateUtils.endOfDay(dateRange.end)
		: DateUtils.endOfDay(now);

	return { start, end, hasDateFilter: true };
}

/**
 * Apply date filtering to items if a date range is provided.
 * Handles the "all time" case by returning all items when hasDateFilter is false.
 */
function applyDateFilter<T extends { _creationTime: number }>(
	items: T[],
	bounds: DateBoundsResult,
	timestampField: keyof T | "_creationTime" = "_creationTime"
): T[] {
	if (!bounds.hasDateFilter || !bounds.start || !bounds.end) {
		return items;
	}

	const range: DateRange = { start: bounds.start, end: bounds.end };

	if (timestampField === "_creationTime") {
		return filterByCreationTime(items, range);
	}

	return filterByTimestamp(items, timestampField, range);
}

// ============================================================================
// Date Grouping Utilities
// ============================================================================

type Granularity = "day" | "week" | "month";

/**
 * Get a date key for grouping based on granularity
 */
function getDateKey(
	timestamp: number,
	granularity: Granularity,
	timezone?: string
): string {
	const dateStr = DateUtils.toLocalDateString(timestamp, timezone);

	switch (granularity) {
		case "day":
			return dateStr; // YYYY-MM-DD
		case "week": {
			const date = new Date(timestamp);
			const dayOfWeek = date.getDay();
			const weekStart = new Date(date);
			weekStart.setDate(date.getDate() - dayOfWeek);
			return DateUtils.toLocalDateString(weekStart.getTime(), timezone);
		}
		case "month":
		default:
			return dateStr.substring(0, 7); // YYYY-MM
	}
}

/**
 * Format a date key into a human-readable label
 */
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

/**
 * Group items by date and return aggregated data points
 */
function groupByDate<T>(
	items: T[],
	getTimestamp: (item: T) => number,
	granularity: Granularity,
	timezone?: string
): AggregatedDataPoint[] {
	const dateCounts: Record<string, number> = {};

	for (const item of items) {
		const dateKey = getDateKey(getTimestamp(item), granularity, timezone);
		dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
	}

	return Object.entries(dateCounts)
		.map(([dateKey, count]) => ({
			label: formatDateLabel(dateKey, granularity),
			value: count,
			metadata: { dateKey },
		}))
		.sort((a, b) => {
			const aKey = a.metadata?.dateKey as string;
			const bKey = b.metadata?.dateKey as string;
			return aKey.localeCompare(bKey);
		});
}

// ============================================================================
// Pagination Utilities
// ============================================================================

function encodeCursor(offset: number): string {
	return Buffer.from(offset.toString()).toString("base64");
}

function decodeCursor(cursor?: string): number {
	if (!cursor) return 0;
	try {
		return parseInt(Buffer.from(cursor, "base64").toString("utf-8"), 10);
	} catch {
		return 0;
	}
}

// ============================================================================
// Label Formatting Utilities
// ============================================================================

/**
 * Capitalize words split by a separator
 */
function capitalizeWords(text: string, separator: string | RegExp): string {
	return text
		.split(separator)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

/**
 * Convert status counts to data points with formatted labels
 */
function statusCountsToDataPoints(
	counts: Record<string, number>,
	labelMap?: Record<string, string>,
	filterZero = true
): AggregatedDataPoint[] {
	const entries = Object.entries(counts);
	const filtered = filterZero ? entries.filter(([, count]) => count > 0) : entries;

	return filtered.map(([status, count]) => ({
		label: labelMap?.[status] ?? capitalizeWords(status, "-"),
		value: count,
	}));
}

// ============================================================================
// Public Query Exports
// ============================================================================

// Client Reports
export const queryClientsByStatus = optionalUserQuery({
	args: { dateRange: dateRangeValidator },
	handler: async (ctx, args) => _queryClientsByStatus(ctx, args),
});

export const queryClientsByLeadSource = optionalUserQuery({
	args: { dateRange: dateRangeValidator },
	handler: async (ctx, args) => _queryClientsByLeadSource(ctx, args),
});

export const queryClientsByCreationDate = optionalUserQuery({
	args: {
		dateRange: dateRangeValidator,
		granularity: v.optional(
			v.union(v.literal("day"), v.literal("week"), v.literal("month"))
		),
	},
	handler: async (ctx, args) => _queryClientsByCreationDate(ctx, args),
});

// Project Reports
export const queryProjectsByStatus = optionalUserQuery({
	args: { dateRange: dateRangeValidator },
	handler: async (ctx, args) => _queryProjectsByStatus(ctx, args),
});

export const queryProjectsByType = optionalUserQuery({
	args: { dateRange: dateRangeValidator },
	handler: async (ctx, args) => _queryProjectsByType(ctx, args),
});

export const queryProjectsByCreationDate = optionalUserQuery({
	args: {
		dateRange: dateRangeValidator,
		granularity: v.optional(
			v.union(v.literal("day"), v.literal("week"), v.literal("month"))
		),
	},
	handler: async (ctx, args) => _queryProjectsByCreationDate(ctx, args),
});

// Task Reports
export const queryTasksByStatus = optionalUserQuery({
	args: { dateRange: dateRangeValidator },
	handler: async (ctx, args) => _queryTasksByStatus(ctx, args),
});

export const queryTaskCompletionRate = optionalUserQuery({
	args: { dateRange: dateRangeValidator },
	handler: async (ctx, args) => _queryTaskCompletionRate(ctx, args),
});

export const queryTasksByDate = optionalUserQuery({
	args: {
		dateRange: dateRangeValidator,
		granularity: v.optional(
			v.union(v.literal("day"), v.literal("week"), v.literal("month"))
		),
	},
	handler: async (ctx, args) => _queryTasksByDate(ctx, args),
});

// Quote Reports
export const queryQuotesByStatus = optionalUserQuery({
	args: { dateRange: dateRangeValidator },
	handler: async (ctx, args) => _queryQuotesByStatus(ctx, args),
});

export const queryQuoteConversionRate = optionalUserQuery({
	args: { dateRange: dateRangeValidator },
	handler: async (ctx, args) => _queryQuoteConversionRate(ctx, args),
});

// Invoice Reports
export const queryInvoicesByStatus = optionalUserQuery({
	args: { dateRange: dateRangeValidator },
	handler: async (ctx, args) => _queryInvoicesByStatus(ctx, args),
});

export const queryRevenueByMonth = optionalUserQuery({
	args: { dateRange: dateRangeValidator },
	handler: async (ctx, args) => _queryRevenueByMonth(ctx, args),
});

export const queryRevenueByClient = optionalUserQuery({
	args: {
		dateRange: dateRangeValidator,
		limit: v.optional(v.number()),
		cursor: v.optional(v.string()),
	},
	handler: async (ctx, args) => _queryRevenueByClient(ctx, args),
});

// Activity Reports
export const queryActivitiesByType = optionalUserQuery({
	args: { dateRange: dateRangeValidator },
	handler: async (ctx, args) => _queryActivitiesByType(ctx, args),
});

export const queryActivitiesByDate = optionalUserQuery({
	args: {
		dateRange: dateRangeValidator,
		granularity: v.optional(
			v.union(v.literal("day"), v.literal("week"), v.literal("month"))
		),
	},
	handler: async (ctx, args) => _queryActivitiesByDate(ctx, args),
});

// ============================================================================
// Internal Query Implementations
// ============================================================================

async function _queryClientsByStatus(
	ctx: QueryCtx,
	args: { dateRange?: { start?: number; end?: number } }
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);

	const allClients = await ctx.db
		.query("clients")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();

	const clients = applyDateFilter(allClients, bounds);

	const statusCounts = countByField(clients, "status");
	// Ensure all expected statuses are present
	const normalizedCounts = {
		lead: 0,
		active: 0,
		inactive: 0,
		archived: 0,
		...statusCounts,
	};

	const statusLabels: Record<string, string> = {
		lead: "Prospective",
		active: "Active",
		inactive: "Inactive",
		archived: "Archived",
	};

	const data = statusCountsToDataPoints(normalizedCounts, statusLabels, true);

	return {
		data,
		total: clients.length,
		metadata: {
			entityType: "clients",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: "status",
		},
	};
}

async function _queryClientsByLeadSource(
	ctx: QueryCtx,
	args: { dateRange?: { start?: number; end?: number } }
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);

	const allClients = await ctx.db
		.query("clients")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();

	const clients = applyDateFilter(allClients, bounds);

	const sourceCounts: Record<string, number> = {};
	for (const client of clients) {
		const source = client.leadSource || "unknown";
		sourceCounts[source] = (sourceCounts[source] || 0) + 1;
	}

	const data: AggregatedDataPoint[] = Object.entries(sourceCounts)
		.map(([source, count]) => ({
			label: capitalizeWords(source, "-"),
			value: count,
		}))
		.sort((a, b) => b.value - a.value);

	return {
		data,
		total: clients.length,
		metadata: {
			entityType: "clients",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: "leadSource",
		},
	};
}

async function _queryClientsByCreationDate(
	ctx: QueryCtx,
	args: {
		dateRange?: { start?: number; end?: number };
		granularity?: Granularity;
	}
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);
	const granularity = args.granularity || "month";
	const timezone = await getOrgTimezoneById(ctx, orgId);

	const allClients = await ctx.db
		.query("clients")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();

	const clients = applyDateFilter(allClients, bounds);

	const data = groupByDate(
		clients,
		(c) => c._creationTime,
		granularity,
		timezone
	);

	return {
		data,
		total: clients.length,
		metadata: {
			entityType: "clients",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: `creationDate_${granularity}`,
		},
	};
}

async function _queryProjectsByStatus(
	ctx: QueryCtx,
	args: { dateRange?: { start?: number; end?: number } }
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);

	const allProjects = await ctx.db
		.query("projects")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();

	const projects = applyDateFilter(allProjects, bounds);

	const statusCounts = countByField(projects, "status");
	const normalizedCounts = {
		planned: 0,
		"in-progress": 0,
		completed: 0,
		cancelled: 0,
		...statusCounts,
	};

	const data = statusCountsToDataPoints(normalizedCounts, undefined, true);

	return {
		data,
		total: projects.length,
		metadata: {
			entityType: "projects",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: "status",
		},
	};
}

async function _queryProjectsByType(
	ctx: QueryCtx,
	args: { dateRange?: { start?: number; end?: number } }
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);

	const allProjects = await ctx.db
		.query("projects")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();

	const projects = applyDateFilter(allProjects, bounds);

	const typeCounts = countByField(projects, "projectType");
	const normalizedCounts = {
		"one-off": 0,
		recurring: 0,
		...typeCounts,
	};

	const typeLabels: Record<string, string> = {
		"one-off": "One-off",
		recurring: "Recurring",
	};

	const data = statusCountsToDataPoints(normalizedCounts, typeLabels, true);

	return {
		data,
		total: projects.length,
		metadata: {
			entityType: "projects",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: "projectType",
		},
	};
}

async function _queryProjectsByCreationDate(
	ctx: QueryCtx,
	args: {
		dateRange?: { start?: number; end?: number };
		granularity?: Granularity;
	}
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);
	const granularity = args.granularity || "month";
	const timezone = await getOrgTimezoneById(ctx, orgId);

	const allProjects = await ctx.db
		.query("projects")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();

	const projects = applyDateFilter(allProjects, bounds);

	const data = groupByDate(
		projects,
		(p) => p._creationTime,
		granularity,
		timezone
	);

	return {
		data,
		total: projects.length,
		metadata: {
			entityType: "projects",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: `creationDate_${granularity}`,
		},
	};
}

async function _queryTasksByStatus(
	ctx: QueryCtx,
	args: { dateRange?: { start?: number; end?: number } }
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);

	const allTasks = await ctx.db
		.query("tasks")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();

	// Tasks use 'date' field instead of _creationTime
	const tasks = applyDateFilter(allTasks, bounds, "date" as keyof typeof allTasks[0]);

	const statusCounts = countByField(tasks, "status");
	const normalizedCounts = {
		pending: 0,
		"in-progress": 0,
		completed: 0,
		cancelled: 0,
		...statusCounts,
	};

	// Include all statuses for tasks (no filtering of zero values)
	const data = statusCountsToDataPoints(normalizedCounts, undefined, false);

	return {
		data,
		total: tasks.length,
		metadata: {
			entityType: "tasks",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: "status",
		},
	};
}

async function _queryTaskCompletionRate(
	ctx: QueryCtx,
	args: { dateRange?: { start?: number; end?: number } }
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);

	const allTasks = await ctx.db
		.query("tasks")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();

	const tasks = applyDateFilter(allTasks, bounds, "date" as keyof typeof allTasks[0]);

	const totalTasks = tasks.length;
	const completedTasks = tasks.filter((t) => t.status === "completed").length;
	const pendingTasks = tasks.filter(
		(t) => t.status === "pending" || t.status === "in-progress"
	).length;

	const completionRate =
		totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

	const data: AggregatedDataPoint[] = [
		{ label: "Completed", value: completedTasks },
		{ label: "Pending", value: pendingTasks },
	];

	return {
		data,
		total: completionRate,
		metadata: {
			entityType: "tasks",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: "completionRate",
		},
	};
}

async function _queryTasksByDate(
	ctx: QueryCtx,
	args: {
		dateRange?: { start?: number; end?: number };
		granularity?: Granularity;
	}
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);
	const granularity = args.granularity || "month";
	const timezone = await getOrgTimezoneById(ctx, orgId);

	const allTasks = await ctx.db
		.query("tasks")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();

	const tasks = applyDateFilter(allTasks, bounds, "date" as keyof typeof allTasks[0]);

	const data = groupByDate(tasks, (t) => t.date, granularity, timezone);

	return {
		data,
		total: tasks.length,
		metadata: {
			entityType: "tasks",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: `date_${granularity}`,
		},
	};
}

async function _queryQuotesByStatus(
	ctx: QueryCtx,
	args: { dateRange?: { start?: number; end?: number } }
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);

	const allQuotes = await ctx.db
		.query("quotes")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();

	const quotes = applyDateFilter(allQuotes, bounds);

	const statusData: Record<string, { count: number; total: number }> = {
		draft: { count: 0, total: 0 },
		sent: { count: 0, total: 0 },
		approved: { count: 0, total: 0 },
		declined: { count: 0, total: 0 },
		expired: { count: 0, total: 0 },
	};

	for (const quote of quotes) {
		if (statusData[quote.status]) {
			statusData[quote.status].count++;
			statusData[quote.status].total += quote.total;
		}
	}

	const data: AggregatedDataPoint[] = Object.entries(statusData)
		.filter(([, info]) => info.count > 0)
		.map(([status, info]) => ({
			label: status.charAt(0).toUpperCase() + status.slice(1),
			value: info.count,
			metadata: { totalValue: info.total },
		}));

	const totalValue = quotes.reduce((sum, q) => sum + q.total, 0);

	return {
		data,
		total: totalValue,
		metadata: {
			entityType: "quotes",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: "status",
		},
	};
}

async function _queryQuoteConversionRate(
	ctx: QueryCtx,
	args: { dateRange?: { start?: number; end?: number } }
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);

	const allQuotes = await ctx.db
		.query("quotes")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();

	const quotes = applyDateFilter(allQuotes, bounds);

	const sentOrResolved = quotes.filter((q) =>
		["sent", "approved", "declined", "expired"].includes(q.status)
	);
	const approved = quotes.filter((q) => q.status === "approved");

	const conversionRate =
		sentOrResolved.length > 0
			? Math.round((approved.length / sentOrResolved.length) * 100)
			: 0;

	const data: AggregatedDataPoint[] = [
		{ label: "Approved", value: approved.length },
		{ label: "Not Approved", value: sentOrResolved.length - approved.length },
	];

	return {
		data,
		total: conversionRate,
		metadata: {
			entityType: "quotes",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: "conversionRate",
		},
	};
}

async function _queryInvoicesByStatus(
	ctx: QueryCtx,
	args: { dateRange?: { start?: number; end?: number } }
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);

	const allInvoices = await ctx.db
		.query("invoices")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();

	// Invoices use issuedDate field
	const invoices = applyDateFilter(allInvoices, bounds, "issuedDate" as keyof typeof allInvoices[0]);

	const statusData: Record<string, { count: number; total: number }> = {
		draft: { count: 0, total: 0 },
		sent: { count: 0, total: 0 },
		paid: { count: 0, total: 0 },
		overdue: { count: 0, total: 0 },
		cancelled: { count: 0, total: 0 },
	};

	for (const invoice of invoices) {
		if (statusData[invoice.status]) {
			statusData[invoice.status].count++;
			statusData[invoice.status].total += invoice.total;
		}
	}

	const data: AggregatedDataPoint[] = Object.entries(statusData)
		.filter(([, info]) => info.count > 0)
		.map(([status, info]) => ({
			label: status.charAt(0).toUpperCase() + status.slice(1),
			value: info.count,
			metadata: { totalValue: info.total },
		}));

	const totalValue = invoices.reduce((sum, inv) => sum + inv.total, 0);

	return {
		data,
		total: totalValue,
		metadata: {
			entityType: "invoices",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: "status",
		},
	};
}

async function _queryRevenueByMonth(
	ctx: QueryCtx,
	args: { dateRange?: { start?: number; end?: number } }
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);
	const timezone = await getOrgTimezoneById(ctx, orgId);

	const allInvoices = await ctx.db
		.query("invoices")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.filter((q) =>
			q.and(
				q.eq(q.field("status"), "paid"),
				q.neq(q.field("paidAt"), undefined)
			)
		)
		.collect();

	// Filter by paidAt for revenue queries
	const invoices = applyDateFilter(allInvoices, bounds, "paidAt" as keyof typeof allInvoices[0]);

	const monthlyRevenue: Record<string, number> = {};
	for (const invoice of invoices) {
		if (invoice.paidAt) {
			const dateStr = DateUtils.toLocalDateString(invoice.paidAt, timezone);
			const monthKey = dateStr.substring(0, 7);
			monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + invoice.total;
		}
	}

	const data: AggregatedDataPoint[] = Object.entries(monthlyRevenue)
		.map(([month, value]) => ({
			label: month,
			value,
		}))
		.sort((a, b) => a.label.localeCompare(b.label));

	const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);

	return {
		data,
		total: totalRevenue,
		metadata: {
			entityType: "invoices",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: "month",
		},
	};
}

async function _queryRevenueByClient(
	ctx: QueryCtx,
	args: {
		dateRange?: { start?: number; end?: number };
		limit?: number;
		cursor?: string;
	}
): Promise<PaginatedReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyPaginatedResult();

	const bounds = getDateBounds(args.dateRange);
	const limit = args.limit || 50;
	const offset = decodeCursor(args.cursor);

	const allInvoices = await ctx.db
		.query("invoices")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.filter((q) =>
			q.and(
				q.eq(q.field("status"), "paid"),
				q.neq(q.field("paidAt"), undefined)
			)
		)
		.collect();

	const invoices = applyDateFilter(allInvoices, bounds, "paidAt" as keyof typeof allInvoices[0]);

	// Aggregate revenue by client
	const clientRevenue: Record<string, number> = {};
	for (const invoice of invoices) {
		const clientId = invoice.clientId.toString();
		clientRevenue[clientId] = (clientRevenue[clientId] || 0) + invoice.total;
	}

	// Sort by revenue descending
	const sortedClientIds = Object.entries(clientRevenue)
		.sort(([, a], [, b]) => b - a)
		.map(([id]) => id);

	// Apply pagination
	const paginatedClientIds = paginate(sortedClientIds, offset, limit);
	const paginationMeta = getPaginationMeta(sortedClientIds.length, offset, limit);

	// Batch fetch client names
	const clientIdsToFetch = paginatedClientIds.map((id) => id as Id<"clients">);
	const clientDocs = await Promise.all(
		clientIdsToFetch.map((id) => ctx.db.get(id))
	);

	const clientNameMap = new Map<string, string>();
	clientDocs.forEach((client, index) => {
		const clientId = clientIdsToFetch[index];
		clientNameMap.set(clientId, client?.companyName || "Unknown Client");
	});

	const data: AggregatedDataPoint[] = paginatedClientIds.map((clientId) => ({
		label: clientNameMap.get(clientId) || "Unknown Client",
		value: clientRevenue[clientId],
		metadata: { clientId },
	}));

	const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);

	return {
		data,
		total: totalRevenue,
		hasMore: paginationMeta.hasMore,
		nextCursor: paginationMeta.hasMore ? encodeCursor(offset + limit) : undefined,
		metadata: {
			entityType: "invoices",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: "client",
		},
	};
}

async function _queryActivitiesByType(
	ctx: QueryCtx,
	args: { dateRange?: { start?: number; end?: number } }
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);

	const allActivities = await ctx.db
		.query("activities")
		.withIndex("by_org_timestamp", (q) => q.eq("orgId", orgId))
		.collect();

	const activities = applyDateFilter(allActivities, bounds, "timestamp" as keyof typeof allActivities[0]);

	const typeCounts = countByField(activities, "activityType");

	const data: AggregatedDataPoint[] = Object.entries(typeCounts)
		.map(([type, count]) => ({
			label: capitalizeWords(type, "_"),
			value: count,
		}))
		.sort((a, b) => b.value - a.value);

	return {
		data,
		total: activities.length,
		metadata: {
			entityType: "activities",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: "activityType",
		},
	};
}

async function _queryActivitiesByDate(
	ctx: QueryCtx,
	args: {
		dateRange?: { start?: number; end?: number };
		granularity?: Granularity;
	}
): Promise<ReportDataResult> {
	const orgId = await getOptionalOrgId(ctx);
	if (!orgId) return emptyReportResult();

	const bounds = getDateBounds(args.dateRange);
	const granularity = args.granularity || "month";
	const timezone = await getOrgTimezoneById(ctx, orgId);

	const allActivities = await ctx.db
		.query("activities")
		.withIndex("by_org_timestamp", (q) => q.eq("orgId", orgId))
		.collect();

	const activities = applyDateFilter(allActivities, bounds, "timestamp" as keyof typeof allActivities[0]);

	const data = groupByDate(activities, (a) => a.timestamp, granularity, timezone);

	return {
		data,
		total: activities.length,
		metadata: {
			entityType: "activities",
			dateRange:
				bounds.hasDateFilter && bounds.start && bounds.end
					? { start: bounds.start, end: bounds.end }
					: undefined,
			groupBy: `timestamp_${granularity}`,
		},
	};
}

// ============================================================================
// Generic Report Execution
// ============================================================================

/**
 * Internal helper to run report queries by entity type and groupBy
 */
async function runReportByConfig(
	ctx: QueryCtx,
	entityType: string,
	groupBy: string | undefined,
	dateRange: { start?: number; end?: number } | undefined
): Promise<ReportDataResult> {
	// Check for time-based groupings
	const timeGroupingMatch = groupBy?.match(
		/^(creationDate|date|timestamp)_(day|week|month)$/
	);

	if (timeGroupingMatch) {
		const granularity = timeGroupingMatch[2] as Granularity;
		switch (entityType) {
			case "clients":
				return await _queryClientsByCreationDate(ctx, { dateRange, granularity });
			case "projects":
				return await _queryProjectsByCreationDate(ctx, { dateRange, granularity });
			case "tasks":
				return await _queryTasksByDate(ctx, { dateRange, granularity });
			case "activities":
				return await _queryActivitiesByDate(ctx, { dateRange, granularity });
			default:
				return emptyReportResult();
		}
	}

	switch (entityType) {
		case "clients":
			if (groupBy === "leadSource") {
				return await _queryClientsByLeadSource(ctx, { dateRange });
			}
			return await _queryClientsByStatus(ctx, { dateRange });

		case "projects":
			if (groupBy === "projectType") {
				return await _queryProjectsByType(ctx, { dateRange });
			}
			return await _queryProjectsByStatus(ctx, { dateRange });

		case "tasks":
			if (groupBy === "completionRate") {
				return await _queryTaskCompletionRate(ctx, { dateRange });
			}
			return await _queryTasksByStatus(ctx, { dateRange });

		case "quotes":
			if (groupBy === "conversionRate") {
				return await _queryQuoteConversionRate(ctx, { dateRange });
			}
			return await _queryQuotesByStatus(ctx, { dateRange });

		case "invoices":
			if (groupBy === "month") {
				return await _queryRevenueByMonth(ctx, { dateRange });
			}
			if (groupBy === "client") {
				const result = await _queryRevenueByClient(ctx, { dateRange, limit: 10 });
				return {
					data: result.data,
					total: result.total,
					metadata: result.metadata,
				};
			}
			return await _queryInvoicesByStatus(ctx, { dateRange });

		case "activities":
			return await _queryActivitiesByType(ctx, { dateRange });

		default:
			return emptyReportResult();
	}
}

/**
 * Execute a report based on saved configuration
 */
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
	},
	handler: async (ctx, args): Promise<ReportDataResult> => {
		return await runReportByConfig(
			ctx,
			args.entityType,
			args.groupBy,
			args.dateRange
		);
	},
});

// ============================================================================
// Paginated List Queries
// ============================================================================

export const queryClientsListPaginated = optionalUserQuery({
	args: {
		dateRange: dateRangeValidator,
		...paginationValidator,
	},
	handler: async (ctx, args): Promise<PaginatedReportDataResult> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyPaginatedResult();

		const bounds = getDateBounds(args.dateRange);
		const limit = args.limit || 50;
		const offset = decodeCursor(args.cursor);

		const allClients = await ctx.db
			.query("clients")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		const clients = applyDateFilter(allClients, bounds);

		const paginatedClients = paginate(clients, offset, limit);
		const paginationMeta = getPaginationMeta(clients.length, offset, limit);

		const data: AggregatedDataPoint[] = paginatedClients.map((client) => ({
			label: client.companyName,
			value: 1,
			metadata: {
				clientId: client._id,
				status: client.status,
				leadSource: client.leadSource,
			},
		}));

		return {
			data,
			total: clients.length,
			hasMore: paginationMeta.hasMore,
			nextCursor: paginationMeta.hasMore ? encodeCursor(offset + limit) : undefined,
			metadata: {
				entityType: "clients",
				dateRange:
					bounds.hasDateFilter && bounds.start && bounds.end
						? { start: bounds.start, end: bounds.end }
						: undefined,
			},
		};
	},
});

export const queryProjectsListPaginated = optionalUserQuery({
	args: {
		dateRange: dateRangeValidator,
		...paginationValidator,
	},
	handler: async (ctx, args): Promise<PaginatedReportDataResult> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyPaginatedResult();

		const bounds = getDateBounds(args.dateRange);
		const limit = args.limit || 50;
		const offset = decodeCursor(args.cursor);

		const allProjects = await ctx.db
			.query("projects")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		const projects = applyDateFilter(allProjects, bounds);

		const paginatedProjects = paginate(projects, offset, limit);
		const paginationMeta = getPaginationMeta(projects.length, offset, limit);

		const data: AggregatedDataPoint[] = paginatedProjects.map((project) => ({
			label: project.title,
			value: 1,
			metadata: {
				projectId: project._id,
				status: project.status,
				projectType: project.projectType,
			},
		}));

		return {
			data,
			total: projects.length,
			hasMore: paginationMeta.hasMore,
			nextCursor: paginationMeta.hasMore ? encodeCursor(offset + limit) : undefined,
			metadata: {
				entityType: "projects",
				dateRange:
					bounds.hasDateFilter && bounds.start && bounds.end
						? { start: bounds.start, end: bounds.end }
						: undefined,
			},
		};
	},
});

export const queryInvoicesListPaginated = optionalUserQuery({
	args: {
		dateRange: dateRangeValidator,
		...paginationValidator,
	},
	handler: async (ctx, args): Promise<PaginatedReportDataResult> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyPaginatedResult();

		const bounds = getDateBounds(args.dateRange);
		const limit = args.limit || 50;
		const offset = decodeCursor(args.cursor);

		const allInvoices = await ctx.db
			.query("invoices")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		const invoices = applyDateFilter(allInvoices, bounds, "issuedDate" as keyof typeof allInvoices[0]);

		const paginatedInvoices = paginate(invoices, offset, limit);
		const paginationMeta = getPaginationMeta(invoices.length, offset, limit);

		const data: AggregatedDataPoint[] = paginatedInvoices.map((invoice) => ({
			label: invoice.invoiceNumber || `Invoice ${invoice._id}`,
			value: invoice.total,
			metadata: {
				invoiceId: invoice._id,
				status: invoice.status,
				clientId: invoice.clientId,
			},
		}));

		const totalValue = invoices.reduce((sum, inv) => sum + inv.total, 0);

		return {
			data,
			total: totalValue,
			hasMore: paginationMeta.hasMore,
			nextCursor: paginationMeta.hasMore ? encodeCursor(offset + limit) : undefined,
			metadata: {
				entityType: "invoices",
				dateRange:
					bounds.hasDateFilter && bounds.start && bounds.end
						? { start: bounds.start, end: bounds.end }
						: undefined,
			},
		};
	},
});
