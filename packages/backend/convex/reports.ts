import { query } from "./_generated/server";
import { mutation } from "./lib/triggers";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId, getCurrentUser } from "./lib/auth";
import {
	filterUndefined,
} from "./lib/crud";
import { emptyListResult } from "./lib/queries";
import { optionalUserQuery, userMutation } from "./lib/factories";
import type { MutationCtx } from "./_generated/server";
import {
	METERS,
	entitlementsFromIdentity,
	requireMeter,
} from "./lib/entitlements";
import {
	reportConfigValidator,
	reportVisualizationValidator,
} from "./lib/reportConfig";

/**
 * Saved-report slot check (current-count semantics): creating past the cap
 * refuses, deleting frees a slot, edit/run/view/export are never gated.
 * Orgs already over the cap are grandfathered — existing rows stay, creation
 * refuses until they're back under.
 */
async function assertSavedReportSlot(
	ctx: MutationCtx,
	orgId: Id<"organizations">
): Promise<void> {
	const { plan } = await entitlementsFromIdentity(ctx);
	const cap = METERS.savedReports[plan];
	if (cap === null) return;
	const existing = await ctx.db
		.query("reports")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.take(cap);
	await requireMeter(ctx, orgId, "savedReports", plan, {
		usedOverride: existing.length,
	});
}

/**
 * Report operations with CRUD helpers
 * Handles saved report configurations for analytics and data visualization
 */

// ============================================================================
// Query Operations
// ============================================================================

/**
 * List all reports for the current user's organization
 */
export const list = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<Doc<"reports">[]> => {
		if (!ctx.orgId) return emptyListResult();
		await ctx.requireLevel("reports", "view");
		const orgId = ctx.orgId;

		const reports = await ctx.db
			.query("reports")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		// Sort by most recently updated
		const sorted = reports.sort((a, b) => b.updatedAt - a.updatedAt);
		return await ctx.scopedToActor("reports", sorted, (r) => r.createdBy);
	},
});

/**
 * Get a single report by ID
 */
export const get = optionalUserQuery({
	args: { id: v.id("reports") },
	handler: async (ctx, args): Promise<Doc<"reports"> | null> => {
		if (!ctx.orgId) return null;
		await ctx.requireLevel("reports", "view");
		let report: Doc<"reports">;
		try {
			report = await ctx.orgEntity("reports", args.id);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Entity not found in reports:")) {
				return null;
			}
			throw error;
		}
		await ctx.requireRecordScope("reports", () => report.createdBy === ctx.user._id);
		return report;
	},
});

/**
 * Get reports created by the current user
 */
export const getMyReports = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<Doc<"reports">[]> => {
		if (!ctx.user) return emptyListResult();
		await ctx.requireLevel("reports", "view");
		const user = await getCurrentUser(ctx);
		if (!user) return emptyListResult();

		const reports = await ctx.db
			.query("reports")
			.withIndex("by_creator", (q) => q.eq("createdBy", user._id))
			.collect();

		// by_creator isn't org-scoped; a user in several orgs would otherwise see
		// the reports they authored in all of them from any one workspace.
		const sorted = reports
			.filter((report) => report.orgId === ctx.orgId)
			.sort((a, b) => b.updatedAt - a.updatedAt);
		return await ctx.scopedToActor("reports", sorted, (r) => r.createdBy);
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
		// Writes emit native v2 since R8a; the v1 arm stays readable until the R14 cutover.
		config: reportConfigValidator,
		visualization: reportVisualizationValidator,
		isPublic: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<Id<"reports">> => {
		await ctx.requireLevel("reports", "modify");
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("Not authenticated");
		}

		const userOrgId = await getCurrentUserOrgId(ctx);
		if (!userOrgId) {
			throw new Error("No organization found");
		}

		await assertSavedReportSlot(ctx, userOrgId);

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
		visualization: v.optional(reportVisualizationValidator),
		isPublic: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<Id<"reports">> => {
		await ctx.requireLevel("reports", "modify");
		const report = await ctx.orgEntity("reports", args.id);
		await ctx.requireRecordScope("reports", () => report.createdBy === ctx.user._id);

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
		await ctx.requireLevel("reports", "delete");
		const report = await ctx.orgEntity("reports", args.id);
		await ctx.requireRecordScope("reports", () => report.createdBy === ctx.user._id);
		await ctx.db.delete(report._id);
	},
});

/**
 * Duplicate an existing report
 */
export const duplicate = userMutation({
	args: { id: v.id("reports") },
	handler: async (ctx, args): Promise<Id<"reports">> => {
		await ctx.requireLevel("reports", "modify");
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("Not authenticated");
		}

		const report = await ctx.orgEntity("reports", args.id);
		// Scoped members may only duplicate their own reports (source content copy)
		await ctx.requireRecordScope("reports", () => report.createdBy === ctx.user._id);
		await assertSavedReportSlot(ctx, report.orgId);
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
