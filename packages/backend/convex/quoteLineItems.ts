import { query, mutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { filterUndefined, requireUpdates } from "./lib/crud";
import { emptyListResult } from "./lib/queries";
import {
	validateQuoteLineItemFields,
	calculateQuoteLineItemAmount,
	recalculateLineItemTotal,
	getNextLineItemSortOrder,
	sortLineItems,
	calculateLineItemStats,
	validateQuoteAccess,
	validateBulkLineItems,
} from "./lib/lineItems";
import {
	optionalUserQuery,
	userMutation,
} from "./lib/factories";

/**
 * Quote Line Item operations
 *
 * Uses shared utilities from lib/lineItems.ts and lib/crud.ts for consistent patterns.
 * Entity-specific business logic remains in this file.
 */

// ============================================================================
// Types
// ============================================================================

type QuoteLineItemDocument = Doc<"quoteLineItems">;
type QuoteLineItemId = Id<"quoteLineItems">;

/**
 * Create a quote line item with automatic orgId assignment
 */
async function createLineItemWithOrg(
	ctx: MutationCtx,
	data: Omit<Doc<"quoteLineItems">, "_id" | "_creationTime" | "orgId">
): Promise<Id<"quoteLineItems">> {
	const userOrgId = await getCurrentUserOrgId(ctx);

	// Validate quote access
	await validateQuoteAccess(ctx, data.quoteId);

	return await ctx.db.insert("quoteLineItems", {
		...data,
		orgId: userOrgId,
	});
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all line items for a specific quote
 */
export const listByQuote = optionalUserQuery({
	args: { quoteId: v.id("quotes") },
	handler: async (ctx, args): Promise<QuoteLineItemDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("quotes", "view");

		const parentQuote = await validateQuoteAccess(ctx, args.quoteId, orgId);

		const lineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
			.collect();

		// All rows share the same parent quote, so one predicate covers the list.
		const scoped = await ctx.applyReadScope("quotes", lineItems, (_row, s) =>
			parentQuote.projectId
				? s.projectIds.has(parentQuote.projectId)
				: s.clientIds.has(parentQuote.clientId)
		);

		return sortLineItems(scoped);
	},
});

/**
 * Get all line items for the current user's organization
 */
export const list = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<QuoteLineItemDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		// Org-wide list: no parent-quote context per row without an extra fetch
		// per distinct quoteId. Level-gate only (see RBAC gating report).
		await ctx.requireLevel("quotes", "view");

		return await ctx.db
			.query("quoteLineItems")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
	},
});

/**
 * Get a specific quote line item by ID
 */
// TODO: Candidate for deletion if confirmed unused.
export const get = optionalUserQuery({
	args: { id: v.id("quoteLineItems") },
	handler: async (ctx, args): Promise<QuoteLineItemDocument | null> => {
		const orgId = ctx.orgId;
		if (!orgId) return null;
		await ctx.requireLevel("quotes", "view");

		try {
			return await ctx.orgEntity("quoteLineItems", args.id);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.startsWith("Entity not found in quoteLineItems")
			) {
				return null;
			}
			if (
				error instanceof Error &&
				error.message.includes("does not belong to your organization")
			) {
				throw new Error("Quote line item does not belong to your organization");
			}
			throw error;
		}
	},
});

/**
 * Get quote line item statistics
 */
// TODO: Candidate for deletion if confirmed unused.
export const getStats = optionalUserQuery({
	args: { quoteId: v.id("quotes") },
	handler: async (ctx, args) => {
		const orgId = ctx.orgId;
		if (!orgId) {
			return {
				totalItems: 0,
				totalAmount: 0,
				averageRate: 0,
				totalQuantity: 0,
			};
		}
		await ctx.requireLevel("quotes", "view");

		await validateQuoteAccess(ctx, args.quoteId, orgId);

		const lineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
			.collect();

		const baseStats = calculateLineItemStats(lineItems, "amount");

		// Calculate average rate (quote-specific)
		const totalRate = lineItems.reduce((sum, item) => sum + item.rate, 0);
		const averageRate = lineItems.length > 0 ? totalRate / lineItems.length : 0;

		return {
			...baseStats,
			averageRate,
		};
	},
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new quote line item
 */
// TODO: Candidate for deletion if confirmed unused.
export const create = userMutation({
	args: {
		quoteId: v.id("quotes"),
		description: v.string(),
		quantity: v.number(),
		unit: v.string(),
		rate: v.number(),
		cost: v.optional(v.number()),
		sortOrder: v.number(),
	},
	handler: async (ctx, args): Promise<QuoteLineItemId> => {
		await ctx.requireLevel("quotes", "modify");

		// Validate all fields using shared utility
		validateQuoteLineItemFields(args, { isUpdate: false });

		const parentQuote = await validateQuoteAccess(ctx, args.quoteId);
		await ctx.requireRecordScope("quotes", () =>
			ctx.actorScope().then((s) =>
				parentQuote.projectId
					? s.projectIds.has(parentQuote.projectId)
					: s.clientIds.has(parentQuote.clientId)
			)
		);

		// Calculate amount
		const amount = calculateQuoteLineItemAmount(args.quantity, args.rate);

		const lineItemId = await createLineItemWithOrg(ctx, {
			...args,
			amount,
		});

		return lineItemId;
	},
});

/**
 * Update a quote line item
 */
export const update = userMutation({
	args: {
		id: v.id("quoteLineItems"),
		quoteId: v.optional(v.id("quotes")),
		description: v.optional(v.string()),
		quantity: v.optional(v.number()),
		unit: v.optional(v.string()),
		rate: v.optional(v.number()),
		cost: v.optional(v.number()),
		sortOrder: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<QuoteLineItemId> => {
		await ctx.requireLevel("quotes", "modify");

		const { id, ...updates } = args;

		// Validate fields using shared utility
		validateQuoteLineItemFields(updates, { isUpdate: true });

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates);
		requireUpdates(filteredUpdates);

		// Get current line item
		const currentLineItem = await ctx.orgEntity("quoteLineItems", id);
		const parentQuote = await ctx.orgEntity("quotes", currentLineItem.quoteId);
		await ctx.requireRecordScope("quotes", () =>
			ctx.actorScope().then((s) =>
				parentQuote.projectId
					? s.projectIds.has(parentQuote.projectId)
					: s.clientIds.has(parentQuote.clientId)
			)
		);

		// Validate new quoteId if changing
		if (filteredUpdates.quoteId) {
			const newParent = await validateQuoteAccess(ctx, filteredUpdates.quoteId);
			// Reassignment: target quote must also be in the actor's scope
			await ctx.requireRecordScope("quotes", () =>
				ctx.actorScope().then((s) =>
					newParent.projectId
						? s.projectIds.has(newParent.projectId)
						: s.clientIds.has(newParent.clientId)
				)
			);
		}

		// Recalculate amount if quantity or rate changed
		if (
			filteredUpdates.quantity !== undefined ||
			filteredUpdates.rate !== undefined
		) {
			(filteredUpdates as Record<string, unknown>).amount =
				recalculateLineItemTotal(filteredUpdates, currentLineItem, "quote");
		}

		await ctx.db.patch(id, filteredUpdates);

		return id;
	},
});

/**
 * Delete a quote line item
 */
export const remove = userMutation({
	args: { id: v.id("quoteLineItems") },
	handler: async (ctx, args): Promise<QuoteLineItemId> => {
		await ctx.requireLevel("quotes", "delete");

		const lineItem = await ctx.orgEntity("quoteLineItems", args.id);
		const parentQuote = await ctx.orgEntity("quotes", lineItem.quoteId);
		await ctx.requireRecordScope("quotes", () =>
			ctx.actorScope().then((s) =>
				parentQuote.projectId
					? s.projectIds.has(parentQuote.projectId)
					: s.clientIds.has(parentQuote.clientId)
			)
		);

		await ctx.db.delete(args.id);
		return args.id;
	},
});

/**
 * Bulk create quote line items
 */
export const bulkCreate = userMutation({
	args: {
		quoteId: v.id("quotes"),
		lineItems: v.array(
			v.object({
				description: v.string(),
				quantity: v.number(),
				unit: v.string(),
				rate: v.number(),
				cost: v.optional(v.number()),
				sortOrder: v.number(),
			})
		),
	},
	handler: async (ctx, args): Promise<QuoteLineItemId[]> => {
		await ctx.requireLevel("quotes", "modify");

		// Validate quote access once
		const parentQuote = await validateQuoteAccess(ctx, args.quoteId);
		await ctx.requireRecordScope("quotes", () =>
			ctx.actorScope().then((s) =>
				parentQuote.projectId
					? s.projectIds.has(parentQuote.projectId)
					: s.clientIds.has(parentQuote.clientId)
			)
		);

		// Validate all items using shared utility
		validateBulkLineItems(args.lineItems, "quote");

		const userOrgId = await getCurrentUserOrgId(ctx);
		const createdIds: QuoteLineItemId[] = [];

		for (const itemData of args.lineItems) {
			// Calculate amount and create item
			const amount = calculateQuoteLineItemAmount(
				itemData.quantity,
				itemData.rate
			);

			const lineItemId = await ctx.db.insert("quoteLineItems", {
				...itemData,
				quoteId: args.quoteId,
				orgId: userOrgId,
				amount,
			});

			createdIds.push(lineItemId);
		}

		return createdIds;
	},
});

/**
 * Reorder quote line items
 */
// TODO: Candidate for deletion if confirmed unused.
export const reorder = userMutation({
	args: {
		quoteId: v.id("quotes"),
		lineItemIds: v.array(v.id("quoteLineItems")),
	},
	handler: async (ctx, args): Promise<void> => {
		await ctx.requireLevel("quotes", "modify");

		const parentQuote = await validateQuoteAccess(ctx, args.quoteId);
		await ctx.requireRecordScope("quotes", () =>
			ctx.actorScope().then((s) =>
				parentQuote.projectId
					? s.projectIds.has(parentQuote.projectId)
					: s.clientIds.has(parentQuote.clientId)
			)
		);

		// Validate that all line items belong to the quote and update sort order
		for (let i = 0; i < args.lineItemIds.length; i++) {
			const lineItem = await ctx.orgEntity(
				"quoteLineItems",
				args.lineItemIds[i]
			);
			if (lineItem.quoteId !== args.quoteId) {
				throw new Error("All line items must belong to the specified quote");
			}
			await ctx.db.patch(args.lineItemIds[i], { sortOrder: i });
		}
	},
});

/**
 * Duplicate a quote line item
 */
// TODO: Candidate for deletion if confirmed unused.
export const duplicate = userMutation({
	args: { id: v.id("quoteLineItems") },
	handler: async (ctx, args): Promise<QuoteLineItemId> => {
		await ctx.requireLevel("quotes", "modify");

		const originalItem = await ctx.orgEntity("quoteLineItems", args.id);
		const parentQuote = await ctx.orgEntity("quotes", originalItem.quoteId);
		await ctx.requireRecordScope("quotes", () =>
			ctx.actorScope().then((s) =>
				parentQuote.projectId
					? s.projectIds.has(parentQuote.projectId)
					: s.clientIds.has(parentQuote.clientId)
			)
		);

		// Get all items for the quote to determine next sort order
		const allItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", originalItem.quoteId))
			.collect();

		const nextSortOrder = getNextLineItemSortOrder(allItems);

		// Create duplicate with incremented sort order
		const duplicateId = await ctx.db.insert("quoteLineItems", {
			quoteId: originalItem.quoteId,
			orgId: originalItem.orgId,
			description: `${originalItem.description} (Copy)`,
			quantity: originalItem.quantity,
			unit: originalItem.unit,
			rate: originalItem.rate,
			amount: originalItem.amount,
			cost: originalItem.cost,
			sortOrder: nextSortOrder,
		});

		return duplicateId;
	},
});
