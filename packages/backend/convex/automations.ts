import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";

/**
 * Workflow Automation operations with embedded CRUD helpers
 * All automation-specific logic lives in this file for better organization
 */

// Type definitions
type AutomationDocument = Doc<"workflowAutomations">;
type AutomationId = Id<"workflowAutomations">;

// Reusable validators for automation trigger and nodes
const triggerObjectTypeValidator = v.union(
	v.literal("client"),
	v.literal("project"),
	v.literal("quote"),
	v.literal("invoice"),
	v.literal("task")
);

const conditionOperatorValidator = v.union(
	v.literal("equals"),
	v.literal("not_equals"),
	v.literal("contains"),
	v.literal("exists")
);

const actionTargetTypeValidator = v.union(
	v.literal("self"),
	v.literal("project"),
	v.literal("client"),
	v.literal("quote"),
	v.literal("invoice")
);

const nodeValidator = v.object({
	id: v.string(),
	type: v.union(v.literal("condition"), v.literal("action")),
	condition: v.optional(
		v.object({
			field: v.string(),
			operator: conditionOperatorValidator,
			value: v.any(),
		})
	),
	action: v.optional(
		v.object({
			targetType: actionTargetTypeValidator,
			actionType: v.literal("update_status"),
			newStatus: v.string(),
		})
	),
	nextNodeId: v.optional(v.string()),
	elseNodeId: v.optional(v.string()),
});

// Automation-specific helper functions

/**
 * Get an automation by ID with organization validation
 */
async function getAutomationWithOrgValidation(
	ctx: QueryCtx | MutationCtx,
	id: AutomationId
): Promise<AutomationDocument | null> {
	const userOrgId = await getCurrentUserOrgId(ctx);
	const automation = await ctx.db.get(id);

	if (!automation) {
		return null;
	}

	if (automation.orgId !== userOrgId) {
		throw new Error("Automation does not belong to your organization");
	}

	return automation;
}

/**
 * Get an automation by ID, throwing if not found
 */
async function getAutomationOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: AutomationId
): Promise<AutomationDocument> {
	const automation = await getAutomationWithOrgValidation(ctx, id);
	if (!automation) {
		throw new Error("Automation not found");
	}
	return automation;
}

/**
 * Create an automation with automatic orgId and createdBy assignment
 */
async function createAutomationWithOrg(
	ctx: MutationCtx,
	data: Omit<
		AutomationDocument,
		"_id" | "_creationTime" | "orgId" | "createdBy" | "createdAt" | "updatedAt"
	>
): Promise<AutomationId> {
	const userOrgId = await getCurrentUserOrgId(ctx);
	const user = await getCurrentUserOrThrow(ctx);
	const now = Date.now();

	const automationData = {
		...data,
		orgId: userOrgId,
		createdBy: user._id,
		createdAt: now,
		updatedAt: now,
	};

	return await ctx.db.insert("workflowAutomations", automationData);
}

/**
 * Update an automation with validation
 */
async function updateAutomationWithValidation(
	ctx: MutationCtx,
	id: AutomationId,
	updates: Partial<AutomationDocument>
): Promise<void> {
	// Validate automation exists and belongs to user's org
	await getAutomationOrThrow(ctx, id);

	// Update the automation
	await ctx.db.patch(id, updates);
}

/**
 * Get all automations for the current user's organization
 */
export const list = query({
	args: {},
	handler: async (ctx): Promise<AutomationDocument[]> => {
		const userOrgId = await getCurrentUserOrgId(ctx);

		const automations = await ctx.db
			.query("workflowAutomations")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		// Sort by name alphabetically
		return automations.sort((a, b) => a.name.localeCompare(b.name));
	},
});

/**
 * Get all active automations for the current user's organization
 */
export const listActive = query({
	args: {},
	handler: async (ctx): Promise<AutomationDocument[]> => {
		const userOrgId = await getCurrentUserOrgId(ctx);

		const automations = await ctx.db
			.query("workflowAutomations")
			.withIndex("by_org_active", (q) =>
				q.eq("orgId", userOrgId).eq("isActive", true)
			)
			.collect();

		return automations.sort((a, b) => a.name.localeCompare(b.name));
	},
});

/**
 * Get a specific automation by ID
 */
export const get = query({
	args: { id: v.id("workflowAutomations") },
	handler: async (ctx, args): Promise<AutomationDocument | null> => {
		return await getAutomationWithOrgValidation(ctx, args.id);
	},
});

/**
 * Create a new automation
 */
export const create = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		trigger: v.object({
			objectType: triggerObjectTypeValidator,
			fromStatus: v.optional(v.string()),
			toStatus: v.string(),
		}),
		nodes: v.array(nodeValidator),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<AutomationId> => {
		// Validate required fields
		if (!args.name.trim()) {
			throw new Error("Automation name is required");
		}

		if (!args.trigger.toStatus.trim()) {
			throw new Error("Trigger status is required");
		}

		// Validate nodes array
		if (args.nodes.length === 0) {
			throw new Error("At least one node is required");
		}

		// Validate each node has the right structure
		for (const node of args.nodes) {
			// Ensure nodes don't have both condition and action
			if (node.condition && node.action) {
				throw new Error(
					`Node ${node.id} cannot have both condition and action defined`
				);
			}

			if (node.type === "condition" && !node.condition) {
				throw new Error(
					`Condition node ${node.id} must have a condition defined`
				);
			}
			if (node.type === "action" && !node.action) {
				throw new Error(`Action node ${node.id} must have an action defined`);
			}
		}

		const automationId = await createAutomationWithOrg(ctx, {
			name: args.name.trim(),
			description: args.description?.trim(),
			isActive: args.isActive ?? false,
			trigger: {
				objectType: args.trigger.objectType,
				fromStatus: args.trigger.fromStatus?.trim(),
				toStatus: args.trigger.toStatus.trim(),
			},
			nodes: args.nodes,
		});

		return automationId;
	},
});

/**
 * Update an automation
 */
export const update = mutation({
	args: {
		id: v.id("workflowAutomations"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
		trigger: v.optional(
			v.object({
				objectType: triggerObjectTypeValidator,
				fromStatus: v.optional(v.string()),
				toStatus: v.string(),
			})
		),
		nodes: v.optional(v.array(nodeValidator)),
	},
	handler: async (ctx, args): Promise<AutomationId> => {
		const { id, ...updates } = args;

		// Validate fields if being updated
		if (updates.name !== undefined && !updates.name.trim()) {
			throw new Error("Automation name cannot be empty");
		}

		if (updates.trigger?.toStatus !== undefined && !updates.trigger.toStatus.trim()) {
			throw new Error("Trigger status cannot be empty");
		}

		if (updates.nodes !== undefined) {
			if (updates.nodes.length === 0) {
				throw new Error("At least one node is required");
			}

			// Validate each node has the right structure
			for (const node of updates.nodes) {
				// Ensure nodes don't have both condition and action
				if (node.condition && node.action) {
					throw new Error(
						`Node ${node.id} cannot have both condition and action defined`
					);
				}

				if (node.type === "condition" && !node.condition) {
					throw new Error(
						`Condition node ${node.id} must have a condition defined`
					);
				}
				if (node.type === "action" && !node.action) {
					throw new Error(
						`Action node ${node.id} must have an action defined`
					);
				}
			}
		}

		// Filter out undefined values and prepare updates
		const filteredUpdates: Partial<AutomationDocument> = {};

		if (updates.name !== undefined) {
			filteredUpdates.name = updates.name.trim();
		}
		if (updates.description !== undefined) {
			filteredUpdates.description = updates.description.trim();
		}
		if (updates.isActive !== undefined) {
			filteredUpdates.isActive = updates.isActive;
		}
		if (updates.trigger !== undefined) {
			filteredUpdates.trigger = {
				objectType: updates.trigger.objectType,
				fromStatus: updates.trigger.fromStatus?.trim(),
				toStatus: updates.trigger.toStatus.trim(),
			};
		}
		if (updates.nodes !== undefined) {
			filteredUpdates.nodes = updates.nodes;
		}

		if (Object.keys(filteredUpdates).length === 0) {
			throw new Error("No valid updates provided");
		}

		// Always update the updatedAt timestamp
		filteredUpdates.updatedAt = Date.now();

		await updateAutomationWithValidation(ctx, id, filteredUpdates);

		return id;
	},
});

/**
 * Toggle an automation's active status
 */
export const toggleActive = mutation({
	args: { id: v.id("workflowAutomations") },
	handler: async (ctx, args): Promise<AutomationId> => {
		const automation = await getAutomationOrThrow(ctx, args.id);

		await ctx.db.patch(args.id, {
			isActive: !automation.isActive,
			updatedAt: Date.now(),
		});

		return args.id;
	},
});

/**
 * Delete an automation (hard delete)
 */
export const remove = mutation({
	args: { id: v.id("workflowAutomations") },
	handler: async (ctx, args): Promise<AutomationId> => {
		await getAutomationOrThrow(ctx, args.id); // Validate access

		// Also delete associated execution logs
		const executions = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_automation", (q) => q.eq("automationId", args.id))
			.collect();

		for (const execution of executions) {
			await ctx.db.delete(execution._id);
		}

		await ctx.db.delete(args.id);
		return args.id;
	},
});

/**
 * Get execution logs for an automation
 */
export const getExecutions = query({
	args: {
		automationId: v.id("workflowAutomations"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		// Validate access to the automation
		await getAutomationOrThrow(ctx, args.automationId);

		const limit = args.limit ?? 50;

		const executions = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_automation", (q) => q.eq("automationId", args.automationId))
			.order("desc")
			.take(limit);

		return executions;
	},
});

