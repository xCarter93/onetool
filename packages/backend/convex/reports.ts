import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId, getCurrentUser } from "./lib/auth";
import {
	filterUndefined,
} from "./lib/crud";
import { getOptionalOrgId, emptyListResult } from "./lib/queries";
import { optionalUserQuery, userMutation } from "./lib/factories";

/**
 * Report operations with CRUD helpers
 * Handles saved report configurations for analytics and data visualization
 */

// Report configuration validators
const reportConfigValidator = v.object({
	entityType: v.union(
		v.literal("clients"),
		v.literal("projects"),
		v.literal("tasks"),
		v.literal("quotes"),
		v.literal("invoices"),
		v.literal("activities")
	),
	filters: v.optional(v.any()),
	aggregations: v.optional(
		v.array(
			v.object({
				field: v.string(),
				operation: v.union(
					v.literal("count"),
					v.literal("sum"),
					v.literal("avg"),
					v.literal("min"),
					v.literal("max")
				),
			})
		)
	),
	groupBy: v.optional(v.array(v.string())),
	columns: v.optional(v.array(v.string())),
	dateRange: v.optional(
		v.object({
			start: v.optional(v.number()),
			end: v.optional(v.number()),
		})
	),
});

const visualizationValidator = v.object({
	type: v.union(
		v.literal("table"),
		v.literal("bar"),
		v.literal("column"),
		v.literal("line"),
		v.literal("pie"),
		v.literal("radar"),
		v.literal("radial")
	),
	options: v.optional(v.any()),
});

// ============================================================================
// Query Operations
// ============================================================================

/**
 * List all reports for the current user's organization
 */
export const list = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<Doc<"reports">[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		const reports = await ctx.db
			.query("reports")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		// Sort by most recently updated
		return reports.sort((a, b) => b.updatedAt - a.updatedAt);
	},
});

/**
 * Get a single report by ID
 */
export const get = optionalUserQuery({
	args: { id: v.id("reports") },
	handler: async (ctx, args): Promise<Doc<"reports"> | null> => {
		if (!ctx.orgId) return null;
		try {
			return await ctx.orgEntity("reports", args.id);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Entity not found in reports:")) {
				return null;
			}
			throw error;
		}
	},
});

/**
 * Get reports created by the current user
 */
export const getMyReports = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<Doc<"reports">[]> => {
		const user = await getCurrentUser(ctx);
		if (!user) return emptyListResult();

		const reports = await ctx.db
			.query("reports")
			.withIndex("by_creator", (q) => q.eq("createdBy", user._id))
			.collect();

		return reports.sort((a, b) => b.updatedAt - a.updatedAt);
	},
});

// ============================================================================
// Mutation Operations
// ============================================================================

/**
 * Create a new report
 */
export const create = userMutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		config: reportConfigValidator,
		visualization: visualizationValidator,
		isPublic: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<Id<"reports">> => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("Not authenticated");
		}

		const userOrgId = await getCurrentUserOrgId(ctx);
		if (!userOrgId) {
			throw new Error("No organization found");
		}

		const now = Date.now();

		const reportId = await ctx.db.insert("reports", {
			orgId: userOrgId,
			createdBy: user._id,
			name: args.name,
			description: args.description,
			config: args.config,
			visualization: args.visualization,
			isPublic: args.isPublic ?? false,
			createdAt: now,
			updatedAt: now,
		});

		return reportId;
	},
});

/**
 * Update an existing report
 */
export const update = userMutation({
	args: {
		id: v.id("reports"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		config: v.optional(reportConfigValidator),
		visualization: v.optional(visualizationValidator),
		isPublic: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<Id<"reports">> => {
		const report = await ctx.orgEntity("reports", args.id);

		const { id: _, ...updateFields } = args;
		const updates = filterUndefined({
			...updateFields,
			updatedAt: Date.now(),
		});

		await ctx.db.patch(report._id, updates);
		return report._id;
	},
});

/**
 * Delete a report
 */
export const remove = userMutation({
	args: { id: v.id("reports") },
	handler: async (ctx, args): Promise<void> => {
		const report = await ctx.orgEntity("reports", args.id);
		await ctx.db.delete(report._id);
	},
});

/**
 * Duplicate an existing report
 */
export const duplicate = userMutation({
	args: { id: v.id("reports") },
	handler: async (ctx, args): Promise<Id<"reports">> => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("Not authenticated");
		}

		const report = await ctx.orgEntity("reports", args.id);
		const now = Date.now();

		const newReportId = await ctx.db.insert("reports", {
			orgId: report.orgId,
			createdBy: user._id,
			name: `${report.name} (Copy)`,
			description: report.description,
			config: report.config,
			visualization: report.visualization,
			isPublic: false, // Copies are private by default
			createdAt: now,
			updatedAt: now,
		});

		return newReportId;
	},
});
