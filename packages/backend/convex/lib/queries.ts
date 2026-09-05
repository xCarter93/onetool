/**
 * Shared query utilities: org-id resolution, empty results, and the date
 * ranges the home dashboard reads.
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
	// Read the clock only for a missing bound: Convex expires cached results
	// early for any query that touches Date.now().
	return {
		start: from
			? DateUtils.startOfDay(from)
			: DateUtils.startOfDay(new Date(new Date(Date.now()).setDate(1)).getTime()),
		end: to ? DateUtils.endOfDay(to) : DateUtils.endOfDay(Date.now()),
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
