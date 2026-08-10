import { v } from "convex/values";
import { mutation } from "./lib/triggers";
import { userQuery } from "./lib/factories";
import { rateLimiter } from "./rateLimits";
import { DateUtils } from "./lib/shared";

/**
 * Community page analytics.
 *
 * Views are counted first-party in Convex rather than through PostHog: no
 * cookie, no CSP work, and the conversion math lands next to the leads it is
 * divided by. `recordView` is public and unauthenticated; `dashboard` is the
 * admin read.
 *
 * Day boundaries follow the org's timezone (UTC when unset), so an evening
 * visit lands on the day the owner experienced it, and the view buckets line
 * up with the lead buckets they are divided by.
 */

/** Calendar arithmetic on a "YYYY-MM-DD" key; Date.UTC absorbs overflow. */
function shiftDayKey(key: string, deltaDays: number): string {
	const [year, month, day] = key.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day + deltaDays))
		.toISOString()
		.slice(0, 10);
}

/** The `days` consecutive keys ending at `lastKey`, oldest first. */
function dayKeysEndingAt(lastKey: string, days: number): string[] {
	const keys: string[] = [];
	for (let i = days - 1; i >= 0; i--) {
		keys.push(shiftDayKey(lastKey, -i));
	}
	return keys;
}

// INTENTIONAL: public, unauthenticated mutation. The page is public, so the
// beacon that counts a visit has to be too. Everything it can do is bounded by
// the rate limiter and by only ever incrementing one counter.
export const recordView = mutation({
	args: {
		slug: v.string(),
		// PUB-19: server-derived in the Next route, never client-supplied.
		ipHash: v.optional(v.string()),
		// Also server-derived (Clerk session in the Next route). Spoofing it
		// only lets a caller suppress their own view, so equality is enough.
		viewerClerkOrgId: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<null> => {
		// A throttled beacon is dropped, not rejected: the visitor has done
		// nothing wrong and there is no UI to show them an error in.
		if (args.ipHash) {
			const perIp = await rateLimiter.limit(ctx, "communityPageViewPerIp", {
				key: args.ipHash,
			});
			if (!perIp.ok) return null;
		}
		const perSlug = await rateLimiter.limit(ctx, "communityPageView", {
			key: args.slug,
		});
		if (!perSlug.ok) return null;

		const page = await ctx.db
			.query("communityPages")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();
		if (!page || !page.isPublic) return null;

		// The owner checking their own page is not traffic. Only the active
		// Clerk org is known here, so a signed-out owner still counts.
		const org = await ctx.db.get(page.orgId);
		if (
			args.viewerClerkOrgId &&
			org?.clerkOrganizationId === args.viewerClerkOrgId
		) {
			return null;
		}

		const day = DateUtils.toLocalDateString(Date.now(), org?.timezone);
		const existing = await ctx.db
			.query("communityPageViews")
			.withIndex("by_page_day", (q) =>
				q.eq("communityPageId", page._id).eq("day", day)
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, { count: existing.count + 1 });
		} else {
			await ctx.db.insert("communityPageViews", {
				orgId: page.orgId,
				communityPageId: page._id,
				day,
				count: 1,
			});
		}
		return null;
	},
});

export interface CommunityDashboard {
	views: number;
	/** Same-length preceding window, so "+18%" means something. */
	viewsPrevious: number;
	requests: number;
	requestsPrevious: number;
	/** Requests ÷ views, as a percentage. Null when there are no views to divide by. */
	conversionPct: number | null;
	/**
	 * Median time from submission to the request leaving "new" — i.e. how fast
	 * it was picked up in OneTool. Replies sent from a mail client are invisible
	 * here, so this must never be labelled as absolute reply time.
	 */
	medianFirstResponseMs: number | null;
	/** Requests still sitting in "new". */
	waitingCount: number;
	series: Array<{ day: string; views: number; requests: number }>;
}

export const dashboard = userQuery({
	args: { days: v.union(v.literal(7), v.literal(30), v.literal(90)) },
	handler: async (ctx, args): Promise<CommunityDashboard> => {
		await ctx.requireLevel("community", "view");

		const org = await ctx.db.get(ctx.orgId);
		const timezone = org?.timezone;

		// Both windows are whole calendar days in the org's timezone, matching
		// the stored view buckets. A rolling "N × 24h" request window would
		// divide requests by a slightly wider pool of views and understate
		// conversion, so leads are bucketed with the same key function.
		const todayKey = DateUtils.toLocalDateString(Date.now(), timezone);
		const keys = dayKeysEndingAt(todayKey, args.days);
		const firstKey = keys[0];
		const previousFirstKey = shiftDayKey(firstKey, -args.days);

		// One scan covers both windows; the current window is the tail of it.
		const viewRows = await ctx.db
			.query("communityPageViews")
			.withIndex("by_org_day", (q) =>
				q.eq("orgId", ctx.orgId).gte("day", previousFirstKey)
			)
			.collect();

		const viewsByDay = new Map<string, number>();
		let views = 0;
		let viewsPrevious = 0;
		for (const row of viewRows) {
			if (row.day >= firstKey) {
				views += row.count;
				viewsByDay.set(row.day, (viewsByDay.get(row.day) ?? 0) + row.count);
			} else {
				viewsPrevious += row.count;
			}
		}

		const leads = await ctx.db
			.query("communityLeads")
			.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
			.order("desc")
			.take(2000);

		const requestsByDay = new Map<string, number>();
		let requests = 0;
		let requestsPrevious = 0;
		let waitingCount = 0;
		const responseTimes: number[] = [];

		for (const lead of leads) {
			if (lead.status === "new") waitingCount++;
			const key = DateUtils.toLocalDateString(lead.submittedAt, timezone);
			if (key >= firstKey) {
				requests++;
				requestsByDay.set(key, (requestsByDay.get(key) ?? 0) + 1);
				if (lead.firstRespondedAt) {
					responseTimes.push(lead.firstRespondedAt - lead.submittedAt);
				}
			} else if (key >= previousFirstKey) {
				requestsPrevious++;
			}
		}

		responseTimes.sort((a, b) => a - b);
		const medianFirstResponseMs = responseTimes.length
			? responseTimes[Math.floor(responseTimes.length / 2)]
			: null;

		return {
			views,
			viewsPrevious,
			requests,
			requestsPrevious,
			conversionPct: views > 0 ? (requests / views) * 100 : null,
			medianFirstResponseMs,
			waitingCount,
			series: keys.map((day) => ({
				day,
				views: viewsByDay.get(day) ?? 0,
				requests: requestsByDay.get(day) ?? 0,
			})),
		};
	},
});
