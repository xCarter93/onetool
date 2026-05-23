/**
 * Shared Query Utilities
 *
 * Common patterns for querying data with organization scoping,
 * pagination, filtering, and sorting.
 */

import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { getOrganizationByClerkId } from "./auth";
import { DateUtils } from "./shared";

// ============================================================================
// Types
// ============================================================================

/**
 * Date range for filtering
 */
export interface DateRange {
	start: number;
	end: number;
}

/**
 * Period comparison data
 */
export interface PeriodData {
	thisMonthStart: number;
	lastMonthStart: number;
	lastMonthEnd: number;
}

/**
 * Empty stats return type helper
 */
export interface EmptyStatsResult {
	[key: string]: number | string | boolean | null | undefined;
}

// ============================================================================
// Date Range Helpers
// ============================================================================

/**
 * Get date bounds from optional timestamps (for range queries)
 *
 * Defaults to current month if no range provided
 */
export function getDateRangeBounds(
	from?: number,
	to?: number
): DateRange {
	const now = Date.now();
	const defaultStart = DateUtils.startOfDay(
		new Date(new Date(now).setDate(1)).getTime()
	);
	const defaultEnd = DateUtils.endOfDay(now);

	return {
		start: from ? DateUtils.startOfDay(from) : defaultStart,
		end: to ? DateUtils.endOfDay(to) : defaultEnd,
	};
}

/**
 * Get month comparison period data (this month vs last month)
 */
export function getMonthComparisonPeriods(): PeriodData {
	const now = Date.now();
	const startOfThisMonth = new Date(new Date(now).setDate(1));
	startOfThisMonth.setHours(0, 0, 0, 0);

	const startOfLastMonth = new Date(startOfThisMonth);
	startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);

	const endOfLastMonth = new Date(startOfThisMonth.getTime() - 1);

	return {
		thisMonthStart: startOfThisMonth.getTime(),
		lastMonthStart: startOfLastMonth.getTime(),
		lastMonthEnd: endOfLastMonth.getTime(),
	};
}

/**
 * Get week range (today + next 7 days)
 */
export function getWeekRange(): DateRange {
	const today = DateUtils.startOfDay(Date.now());
	const nextWeek = DateUtils.addDays(today, 7);
	return { start: today, end: nextWeek };
}

// ============================================================================
// Organization Scoping Helpers
// ============================================================================

/**
 * Get the current user's org ID, returning null for unauthenticated users.
 * Useful for queries that should return empty results for unauthenticated users.
 *
 * This function handles unauthenticated users and missing active orgs by
 * returning null instead of throwing.
 */
export async function getOptionalOrgId(
	ctx: QueryCtx | MutationCtx
): Promise<Id<"organizations"> | null> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return null;
	}

	const activeOrgId = extractActiveOrgId(identity);
	if (!activeOrgId) {
		return null;
	}

	const organization = await getOrganizationByClerkId(ctx, activeOrgId);
	return organization?._id ?? null;
}

// Clerk's UserIdentity shape varies (activeOrgId in v6 JWTs, orgId/org_id in
// older custom claims). Read defensively rather than casting blind.
function extractActiveOrgId(identity: unknown): string | null {
	if (typeof identity !== "object" || identity === null) return null;
	const record = identity as Record<string, unknown>;
	const candidates = [record.activeOrgId, record.orgId, record.org_id];
	for (const value of candidates) {
		if (typeof value === "string" && value.length > 0) return value;
	}
	return null;
}

/**
 * Early return helper for queries when user is not authenticated.
 * Returns an appropriate empty value.
 *
 * @example
 * ```typescript
 * const orgId = await getOptionalOrgId(ctx);
 * if (!orgId) return emptyListResult();
 * ```
 */
export function emptyListResult<T>(): T[] {
	return [];
}

/**
 * Create empty stats object with numeric values
 */
export function createEmptyStats<T extends Record<string, number | string | boolean | null>>(
	defaults: T
): T {
	return { ...defaults };
}

// ============================================================================
// Common Query Patterns
// ============================================================================

// Note: Due to Convex's strong typing, generic query functions like queryByOrg
// are implemented inline in each entity file. The patterns above provide
// org ID retrieval and empty result helpers that work across all entity types.
//
// Standard pattern for org-scoped queries:
// ```typescript
// const orgId = await getOptionalOrgId(ctx);
// if (!orgId) return emptyListResult();
//
// return await ctx.db
//   .query("tableName")
//   .withIndex("by_org", (q) => q.eq("orgId", orgId))
//   .collect();
// ```

// ============================================================================
// Filtering Helpers
// ============================================================================

/**
 * Filter items by creation time within a date range
 */
export function filterByCreationTime<T extends { _creationTime: number }>(
	items: T[],
	range: DateRange
): T[] {
	return items.filter(
		(item) =>
			item._creationTime >= range.start && item._creationTime <= range.end
	);
}

/**
 * Filter items by a timestamp field within a date range
 */
export function filterByTimestamp<T extends Record<string, unknown>>(
	items: T[],
	field: keyof T,
	range: DateRange
): T[] {
	return items.filter((item) => {
		const timestamp = item[field];
		if (typeof timestamp !== "number") return false;
		return timestamp >= range.start && timestamp <= range.end;
	});
}

/**
 * Filter items by status
 */
export function filterByStatus<T extends { status: string }>(
	items: T[],
	status: string | string[]
): T[] {
	const statuses = Array.isArray(status) ? status : [status];
	return items.filter((item) => statuses.includes(item.status));
}

// ============================================================================
// Aggregation Helpers
// ============================================================================

/**
 * Sum a numeric field across items
 */
export function sumField<T extends Record<string, unknown>>(
	items: T[],
	field: keyof T
): number {
	return items.reduce((sum, item) => {
		const value = item[field];
		return sum + (typeof value === "number" ? value : 0);
	}, 0);
}

/**
 * Count items by a field value
 */
export function countByField<T extends Record<string, unknown>>(
	items: T[],
	field: keyof T
): Record<string, number> {
	return items.reduce(
		(counts, item) => {
			const value = String(item[field] ?? "unknown");
			counts[value] = (counts[value] || 0) + 1;
			return counts;
		},
		{} as Record<string, number>
	);
}

/**
 * Group items by a field value
 */
export function groupByField<T extends Record<string, unknown>>(
	items: T[],
	field: keyof T
): Record<string, T[]> {
	return items.reduce(
		(groups, item) => {
			const value = String(item[field] ?? "unknown");
			if (!groups[value]) {
				groups[value] = [];
			}
			groups[value].push(item);
			return groups;
		},
		{} as Record<string, T[]>
	);
}

// ============================================================================
// Date Grouping for Charts
// ============================================================================

/**
 * Convert items to chart data points grouped by date
 */
export function toChartData<T extends { _creationTime: number }>(
	items: T[],
	timestampField: keyof T | "_creationTime" = "_creationTime",
	valueField?: keyof T,
	timezone?: string
): Array<{ date: string; count: number; _creationTime: number }> {
	return items.map((item) => {
		const timestamp =
			timestampField === "_creationTime"
				? item._creationTime
				: (item[timestampField] as number);

		return {
			date: DateUtils.toLocalDateString(timestamp, timezone),
			count: valueField ? (item[valueField] as number) : 1,
			_creationTime: timestamp,
		};
	});
}

/**
 * Aggregate chart data by date (sum values on same date)
 */
export function aggregateChartDataByDate(
	data: Array<{ date: string; count: number; _creationTime: number }>
): Array<{ date: string; count: number }> {
	const aggregated = new Map<string, number>();

	for (const point of data) {
		const current = aggregated.get(point.date) || 0;
		aggregated.set(point.date, current + point.count);
	}

	return Array.from(aggregated.entries())
		.map(([date, count]) => ({ date, count }))
		.sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================================
// Pagination Helpers
// ============================================================================

/**
 * Apply offset and limit to an array (basic pagination)
 */
export function paginate<T>(items: T[], offset: number, limit: number): T[] {
	return items.slice(offset, offset + limit);
}

/**
 * Calculate pagination metadata
 */
export function getPaginationMeta(
	totalItems: number,
	offset: number,
	limit: number
): {
	total: number;
	offset: number;
	limit: number;
	hasMore: boolean;
} {
	return {
		total: totalItems,
		offset,
		limit,
		hasMore: offset + limit < totalItems,
	};
}
