import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { optionalUserQuery, userMutation } from "./lib/factories";

/**
 * SKU operations with embedded CRUD helpers
 * All SKU-specific logic lives in this file for better organization
 */

// SKU-specific helper functions

/**
 * Get a SKU by ID with organization validation
 */
async function getSKUWithOrgValidation(
	ctx: QueryCtx | MutationCtx,
	id: Id<"skus">
): Promise<Doc<"skus"> | null> {
	const userOrgId = await getCurrentUserOrgId(ctx);
	const sku = await ctx.db.get(id);

	if (!sku) {
		return null;
	}

	if (sku.orgId !== userOrgId) {
		throw new Error("SKU does not belong to your organization");
	}

	return sku;
}

/**
 * Get a SKU by ID, throwing if not found
 */
async function getSKUOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: Id<"skus">
): Promise<Doc<"skus">> {
	const sku = await getSKUWithOrgValidation(ctx, id);
	if (!sku) {
		throw new Error("SKU not found");
	}
	return sku;
}

/**
 * Create a SKU with automatic orgId assignment
 */
async function createSKUWithOrg(
	ctx: MutationCtx,
	data: Omit<Doc<"skus">, "_id" | "_creationTime" | "orgId">
): Promise<Id<"skus">> {
	const userOrgId = await getCurrentUserOrgId(ctx);

	const skuData = {
		...data,
		orgId: userOrgId,
	};

	return await ctx.db.insert("skus", skuData);
}

/**
 * Update a SKU with validation
 */
async function updateSKUWithValidation(
	ctx: MutationCtx,
	id: Id<"skus">,
	updates: Partial<Doc<"skus">>
): Promise<void> {
	// Validate SKU exists and belongs to user's org
	await getSKUOrThrow(ctx, id);

	// Update the SKU
	await ctx.db.patch(id, updates);
}

// Define specific types for SKU operations
type SKUDocument = Doc<"skus">;
type SKUId = Id<"skus">;

/**
 * Get all active SKUs for the current user's organization
 */
export const list = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<SKUDocument[]> => {
		const userOrgId = await getCurrentUserOrgId(ctx);

		const skus = await ctx.db
			.query("skus")
			.withIndex("by_org_active", (q) =>
				q.eq("orgId", userOrgId).eq("isActive", true)
			)
			.collect();

		// Sort by name alphabetically
		return skus.sort((a, b) => a.name.localeCompare(b.name));
	},
});

/**
 * Get all SKUs (including inactive) for the current user's organization
 */
export const listAll = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<SKUDocument[]> => {
		const userOrgId = await getCurrentUserOrgId(ctx);

		const skus = await ctx.db
			.query("skus")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		// Sort by name alphabetically
		return skus.sort((a, b) => a.name.localeCompare(b.name));
	},
});

/**
 * Get a specific SKU by ID
 */
export const get = optionalUserQuery({
	args: { id: v.id("skus") },
	handler: async (ctx, args): Promise<SKUDocument | null> => {
		return await getSKUWithOrgValidation(ctx, args.id);
	},
});

/**
 * Create a new SKU
 */
export const create = userMutation({
	args: {
		name: v.string(),
		unit: v.string(),
		rate: v.number(),
		cost: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<SKUId> => {
		// Validate required fields
		if (!args.name.trim()) {
			throw new Error("SKU name is required");
		}

		if (!args.unit.trim()) {
			throw new Error("Unit is required");
		}

		// Validate numeric values
		if (args.rate < 0) {
			throw new Error("Rate cannot be negative");
		}

		if (args.cost !== undefined && args.cost < 0) {
			throw new Error("Cost cannot be negative");
		}

		const now = Date.now();

		const skuId = await createSKUWithOrg(ctx, {
			name: args.name.trim(),
			unit: args.unit.trim(),
			rate: args.rate,
			cost: args.cost,
			isActive: true,
			createdAt: now,
			updatedAt: now,
		});

		return skuId;
	},
});

/**
 * Update a SKU
 */
export const update = userMutation({
	args: {
		id: v.id("skus"),
		name: v.optional(v.string()),
		unit: v.optional(v.string()),
		rate: v.optional(v.number()),
		cost: v.optional(v.number()),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<SKUId> => {
		const { id, ...updates } = args;

		// Validate fields if being updated
		if (updates.name !== undefined && !updates.name.trim()) {
			throw new Error("SKU name cannot be empty");
		}

		if (updates.unit !== undefined && !updates.unit.trim()) {
			throw new Error("Unit cannot be empty");
		}

		if (updates.rate !== undefined && updates.rate < 0) {
			throw new Error("Rate cannot be negative");
		}

		if (updates.cost !== undefined && updates.cost < 0) {
			throw new Error("Cost cannot be negative");
		}

		// Filter out undefined values and prepare updates
		const filteredUpdates: Partial<SKUDocument> = {};

		if (updates.name !== undefined) {
			filteredUpdates.name = updates.name.trim();
		}
		if (updates.unit !== undefined) {
			filteredUpdates.unit = updates.unit.trim();
		}
		if (updates.rate !== undefined) {
			filteredUpdates.rate = updates.rate;
		}
		if (updates.cost !== undefined) {
			filteredUpdates.cost = updates.cost;
		}
		if (updates.isActive !== undefined) {
			filteredUpdates.isActive = updates.isActive;
		}

		if (Object.keys(filteredUpdates).length === 0) {
			throw new Error("No valid updates provided");
		}

		// Always update the updatedAt timestamp
		filteredUpdates.updatedAt = Date.now();

		await updateSKUWithValidation(ctx, id, filteredUpdates);

		return id;
	},
});

/**
 * Delete a SKU (soft delete by setting isActive to false)
 */
export const remove = userMutation({
	args: { id: v.id("skus") },
	handler: async (ctx, args): Promise<SKUId> => {
		await getSKUOrThrow(ctx, args.id); // Validate access

		await ctx.db.patch(args.id, {
			isActive: false,
			updatedAt: Date.now(),
		});

		return args.id;
	},
});

/**
 * Permanently delete a SKU (hard delete)
 */
export const permanentlyDelete = userMutation({
	args: { id: v.id("skus") },
	handler: async (ctx, args): Promise<SKUId> => {
		await getSKUOrThrow(ctx, args.id); // Validate access
		await ctx.db.delete(args.id);
		return args.id;
	},
});
