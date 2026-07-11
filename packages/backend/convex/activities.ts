import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { emptyListResult } from "./lib/queries";
import {
	optionalUserQuery,
	userMutation,
	type UserFunctionExtras,
} from "./lib/factories";
import type { PermissionObject } from "./lib/permissionKeys";

/**
 * Activity operations for activity feed
 *
 * Uses shared query utilities from lib/queries.ts for consistent patterns.
 * Activity-specific logic (like user enrichment) remains here.
 */

// ============================================================================
// Types
// ============================================================================

export interface ActivityWithUser extends Doc<"activities"> {
	user: {
		name: string;
		email: string;
		image: string;
	};
}

// ============================================================================
// Local Helper Functions
// ============================================================================

// Cross-cutting feed: never return an object type the caller can't view (PRD §4.4).
const ENTITY_PERMISSION_OBJECT: Partial<Record<string, PermissionObject>> = {
	client: "clients",
	project: "projects",
	quote: "quotes",
	invoice: "invoices",
	task: "tasks",
};

/** Drop activities whose entity type the caller lacks `view` on (one gateRead per type). */
async function filterByEntityGrant(
	ctx: { gateRead: UserFunctionExtras["gateRead"] },
	activities: Doc<"activities">[]
): Promise<Doc<"activities">[]> {
	const allowed = new Map<string, boolean>();
	for (const activity of activities) {
		if (!allowed.has(activity.entityType)) {
			const object = ENTITY_PERMISSION_OBJECT[activity.entityType];
			allowed.set(
				activity.entityType,
				object ? await ctx.gateRead(object) : true
			);
		}
	}
	return activities.filter((a) => allowed.get(a.entityType) ?? true);
}

/**
 * Enrich activities with user data
 * Fetches user information for each activity and filters out activities with missing users
 */
async function enrichActivitiesWithUsers(
	ctx: QueryCtx,
	activities: Doc<"activities">[]
): Promise<ActivityWithUser[]> {
	const activitiesWithUsers: ActivityWithUser[] = [];

	for (const activity of activities) {
		const activityUser = await ctx.db.get(activity.userId);
		if (activityUser) {
			activitiesWithUsers.push({
				...activity,
				user: {
					name: activityUser.name,
					email: activityUser.email,
					image: activityUser.image,
				},
			});
		}
	}

	return activitiesWithUsers;
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get recent activities for the current organization with time filtering
 */
export const getRecent = optionalUserQuery({
	args: {
		limit: v.optional(v.number()), // Max activities to fetch
	},
	handler: async (ctx, args): Promise<ActivityWithUser[]> => {
		if (!ctx.orgId) return emptyListResult();
		const orgId = ctx.orgId;

		// Query all recent activities for the organization, ordered by timestamp (newest first)
		const activities = await ctx.db
			.query("activities")
			.withIndex("by_org_timestamp", (q) => q.eq("orgId", orgId))
			.order("desc")
			.filter((q) => q.eq(q.field("isVisible"), true))
			.take(args.limit || 1000); // Default to last 1000 activities

		return await enrichActivitiesWithUsers(
			ctx,
			await filterByEntityGrant(ctx, activities)
		);
	},
});

/**
 * Get activities by type for the current organization
 */
// TODO: Candidate for deletion if confirmed unused.
export const getByType = optionalUserQuery({
	args: {
		activityType: v.union(
			v.literal("client_created"),
			v.literal("client_updated"),
			v.literal("project_created"),
			v.literal("project_updated"),
			v.literal("project_completed"),
			v.literal("quote_created"),
			v.literal("quote_sent"),
			v.literal("quote_approved"),
			v.literal("quote_declined"),
			v.literal("invoice_created"),
			v.literal("invoice_sent"),
			v.literal("invoice_paid"),
			v.literal("task_created"),
			v.literal("task_completed"),
			v.literal("user_invited"),
			v.literal("user_removed"),
			v.literal("organization_updated")
		),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<ActivityWithUser[]> => {
		if (!ctx.orgId) return emptyListResult();
		const orgId = ctx.orgId;

		const activities = await ctx.db
			.query("activities")
			.withIndex("by_type", (q) =>
				q.eq("orgId", orgId).eq("activityType", args.activityType)
			)
			.order("desc")
			.filter((q) => q.eq(q.field("isVisible"), true))
			.take(args.limit || 25);

		return await enrichActivitiesWithUsers(
			ctx,
			await filterByEntityGrant(ctx, activities)
		);
	},
});

/**
 * Get activities for a specific entity
 */
// TODO: Candidate for deletion if confirmed unused.
export const getByEntity = optionalUserQuery({
	args: {
		entityType: v.union(
			v.literal("client"),
			v.literal("project"),
			v.literal("quote"),
			v.literal("invoice"),
			v.literal("task"),
			v.literal("user"),
			v.literal("organization")
		),
		entityId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<ActivityWithUser[]> => {
		if (!ctx.orgId) return emptyListResult();
		const orgId = ctx.orgId;

		const entityObject = ENTITY_PERMISSION_OBJECT[args.entityType];
		if (entityObject) await ctx.requireLevel(entityObject, "view");

		const activities = await ctx.db
			.query("activities")
			.withIndex("by_entity", (q) =>
				q.eq("entityType", args.entityType).eq("entityId", args.entityId)
			)
			.filter((q) =>
				q.and(q.eq(q.field("orgId"), orgId), q.eq(q.field("isVisible"), true))
			)
			.order("desc")
			.take(args.limit || 25);

		return await enrichActivitiesWithUsers(ctx, activities);
	},
});

/**
 * Get activity count for the current organization
 */
// TODO: Candidate for deletion if confirmed unused.
export const getCount = optionalUserQuery({
	args: {
		dayRange: v.optional(v.number()),
		activityType: v.optional(
			v.union(
				v.literal("client_created"),
				v.literal("client_updated"),
				v.literal("project_created"),
				v.literal("project_updated"),
				v.literal("project_completed"),
				v.literal("quote_created"),
				v.literal("quote_sent"),
				v.literal("quote_approved"),
				v.literal("quote_declined"),
				v.literal("invoice_created"),
				v.literal("invoice_sent"),
				v.literal("invoice_paid"),
				v.literal("task_created"),
				v.literal("task_completed"),
				v.literal("user_invited"),
				v.literal("user_removed"),
				v.literal("organization_updated")
			)
		),
	},
	handler: async (ctx, args): Promise<number> => {
		if (!ctx.orgId) return 0;
		const orgId = ctx.orgId;

		// Calculate timestamp filter if dayRange is provided
		let timestampFilter: number | undefined;
		if (args.dayRange) {
			const daysInMs = args.dayRange * 24 * 60 * 60 * 1000;
			timestampFilter = Date.now() - daysInMs;
		}

		// Build the query based on filters
		let activities;

		if (args.activityType) {
			activities = await ctx.db
				.query("activities")
				.withIndex("by_type", (q) =>
					q.eq("orgId", orgId).eq("activityType", args.activityType!)
				)
				.filter((q) => q.eq(q.field("isVisible"), true))
				.collect();
		} else {
			activities = await ctx.db
				.query("activities")
				.withIndex("by_org_timestamp", (q) => {
					if (timestampFilter) {
						return q.eq("orgId", orgId).gte("timestamp", timestampFilter);
					} else {
						return q.eq("orgId", orgId);
					}
				})
				.filter((q) => q.eq(q.field("isVisible"), true))
				.collect();
		}

		return (await filterByEntityGrant(ctx, activities)).length;
	},
});
