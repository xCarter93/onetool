import { query, mutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { filterUndefined, requireUpdates } from "./lib/crud";
import { emptyListResult } from "./lib/queries";
import {
	validateInvoiceAccess,
	validateInvoiceLineItemFields,
	calculateInvoiceLineItemTotal,
	sortLineItems,
	getNextLineItemSortOrder,
} from "./lib/lineItems";
import {
	optionalUserQuery,
	userMutation,
} from "./lib/factories";

/**
 * Invoice Line Item operations
 *
 * Uses shared utilities from:
 * - lib/crud.ts for common CRUD patterns
 * - lib/queries.ts for query helpers
 * - lib/lineItems.ts for line item validation and calculations
 */

/**
 * Create an invoice line item with automatic orgId assignment
 */
async function createLineItemWithOrg(
	ctx: MutationCtx,
	data: Omit<Doc<"invoiceLineItems">, "_id" | "_creationTime" | "orgId">
): Promise<Id<"invoiceLineItems">> {
	const userOrgId = await getCurrentUserOrgId(ctx);

	// Validate invoice access
	await validateInvoiceAccess(ctx, data.invoiceId);

	return await ctx.db.insert("invoiceLineItems", {
		...data,
		orgId: userOrgId,
	});
}

// Define specific types for invoice line item operations
type InvoiceLineItemDocument = Doc<"invoiceLineItems">;
type InvoiceLineItemId = Id<"invoiceLineItems">;

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all line items for a specific invoice
 */
// TODO: Candidate for deletion if confirmed unused.
export const listByInvoice = optionalUserQuery({
	args: { invoiceId: v.id("invoices") },
	handler: async (ctx, args): Promise<InvoiceLineItemDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("invoices", "view");

		const parentInvoice = await validateInvoiceAccess(ctx, args.invoiceId, orgId);

		const lineItems = await ctx.db
			.query("invoiceLineItems")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
			.collect();

		// All rows share one parent invoice — scope check runs once, not per row.
		const scoped = await ctx.applyReadScope("invoices", lineItems, (_row, s) =>
			parentInvoice.projectId
				? s.projectIds.has(parentInvoice.projectId)
				: s.clientIds.has(parentInvoice.clientId)
		);

		return sortLineItems(scoped);
	},
});

/**
 * Get all line items for the current user's organization
 */
// TODO: Candidate for deletion if confirmed unused.
export const list = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<InvoiceLineItemDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		// Rows span arbitrary invoices; scoping would require a per-row parent
		// fetch. Level-gate only — see report.
		await ctx.requireLevel("invoices", "view");

		return await ctx.db
			.query("invoiceLineItems")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
	},
});

/**
 * Get a specific invoice line item by ID
 */
// TODO: Candidate for deletion if confirmed unused.
export const get = optionalUserQuery({
	args: { id: v.id("invoiceLineItems") },
	handler: async (ctx, args): Promise<InvoiceLineItemDocument | null> => {
		if (!ctx.orgId) return null;
		await ctx.requireLevel("invoices", "view");

		try {
			return await ctx.orgEntity("invoiceLineItems", args.id);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.startsWith("Entity not found in invoiceLineItems")
			) {
				return null;
			}
			if (
				error instanceof Error &&
				error.message.includes("does not belong to your organization")
			) {
				throw new Error("Invoice line item does not belong to your organization");
			}
			throw error;
		}
	},
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new invoice line item
 */
// TODO: Candidate for deletion if confirmed unused.
export const create = userMutation({
	args: {
		invoiceId: v.id("invoices"),
		description: v.string(),
		quantity: v.number(),
		unitPrice: v.number(),
		sortOrder: v.number(),
	},
	handler: async (ctx, args): Promise<InvoiceLineItemId> => {
		await ctx.requireLevel("invoices", "modify");
		const parentInvoice = await validateInvoiceAccess(ctx, args.invoiceId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);

		// Validate line item fields
		validateInvoiceLineItemFields(args);

		// Calculate total
		const total = calculateInvoiceLineItemTotal(args.quantity, args.unitPrice);

		const lineItemId = await createLineItemWithOrg(ctx, {
			...args,
			total,
		});

		return lineItemId;
	},
});

/**
 * Update an invoice line item
 */
// TODO: Candidate for deletion if confirmed unused.
export const update = userMutation({
	args: {
		id: v.id("invoiceLineItems"),
		invoiceId: v.optional(v.id("invoices")),
		description: v.optional(v.string()),
		quantity: v.optional(v.number()),
		unitPrice: v.optional(v.number()),
		sortOrder: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<InvoiceLineItemId> => {
		await ctx.requireLevel("invoices", "modify");
		const { id, ...updates } = args;

		// Validate fields if being updated
		validateInvoiceLineItemFields(updates, { isUpdate: true });

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates);
		requireUpdates(filteredUpdates);

		// Get current line item to calculate new total if needed
		const currentLineItem = await ctx.orgEntity("invoiceLineItems", id);
		const parentInvoice = await validateInvoiceAccess(
			ctx,
			currentLineItem.invoiceId,
			ctx.orgId
		);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);

		// Validate new invoiceId if changing
		if (filteredUpdates.invoiceId) {
			const newParent = await validateInvoiceAccess(ctx, filteredUpdates.invoiceId);
			// Reassignment: target invoice must also be in the actor's scope
			await ctx.requireRecordScope("invoices", () =>
				ctx.actorScope().then((s) =>
					newParent.projectId
						? s.projectIds.has(newParent.projectId)
						: s.clientIds.has(newParent.clientId)
				)
			);
		}

		// Recalculate total if quantity or unit price changed
		const quantity = filteredUpdates.quantity ?? currentLineItem.quantity;
		const unitPrice = filteredUpdates.unitPrice ?? currentLineItem.unitPrice;

		if (
			filteredUpdates.quantity !== undefined ||
			filteredUpdates.unitPrice !== undefined
		) {
			(filteredUpdates as Partial<InvoiceLineItemDocument>).total =
				calculateInvoiceLineItemTotal(quantity, unitPrice);
		}

		await ctx.db.patch(id, filteredUpdates);

		return id;
	},
});

/**
 * Delete an invoice line item
 */
// TODO: Candidate for deletion if confirmed unused.
export const remove = userMutation({
	args: { id: v.id("invoiceLineItems") },
	handler: async (ctx, args): Promise<InvoiceLineItemId> => {
		await ctx.requireLevel("invoices", "delete");
		const lineItem = await ctx.orgEntity("invoiceLineItems", args.id);
		const parentInvoice = await validateInvoiceAccess(
			ctx,
			lineItem.invoiceId,
			ctx.orgId
		);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);
		await ctx.db.delete(args.id);
		return args.id;
	},
});

/**
 * Bulk create invoice line items
 */
// TODO: Candidate for deletion if confirmed unused.
export const bulkCreate = userMutation({
	args: {
		invoiceId: v.id("invoices"),
		lineItems: v.array(
			v.object({
				description: v.string(),
				quantity: v.number(),
				unitPrice: v.number(),
				sortOrder: v.number(),
			})
		),
	},
	handler: async (ctx, args): Promise<InvoiceLineItemId[]> => {
		await ctx.requireLevel("invoices", "modify");
		// Validate invoice access once
		const parentInvoice = await validateInvoiceAccess(ctx, args.invoiceId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);

		const userOrgId = await getCurrentUserOrgId(ctx);
		const createdIds: InvoiceLineItemId[] = [];

		for (let i = 0; i < args.lineItems.length; i++) {
			const itemData = args.lineItems[i];

			// Validate each item
			validateInvoiceLineItemFields(itemData, { prefix: `Item ${i + 1}: ` });

			// Calculate total and create item
			const total = calculateInvoiceLineItemTotal(
				itemData.quantity,
				itemData.unitPrice
			);

			const lineItemId = await ctx.db.insert("invoiceLineItems", {
				...itemData,
				invoiceId: args.invoiceId,
				orgId: userOrgId,
				total,
			});

			createdIds.push(lineItemId);
		}

		return createdIds;
	},
});

/**
 * Reorder invoice line items
 */
// TODO: Candidate for deletion if confirmed unused.
export const reorder = userMutation({
	args: {
		invoiceId: v.id("invoices"),
		lineItemIds: v.array(v.id("invoiceLineItems")),
	},
	handler: async (ctx, args): Promise<void> => {
		await ctx.requireLevel("invoices", "modify");
		const parentInvoice = await validateInvoiceAccess(ctx, args.invoiceId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);

		// Validate that all line items belong to the invoice
		for (const lineItemId of args.lineItemIds) {
			const lineItem = await ctx.orgEntity("invoiceLineItems", lineItemId);
			if (lineItem.invoiceId !== args.invoiceId) {
				throw new Error("All line items must belong to the specified invoice");
			}
		}

		// Update sort order for each item
		for (let i = 0; i < args.lineItemIds.length; i++) {
			await ctx.db.patch(args.lineItemIds[i], {
				sortOrder: i,
			});
		}
	},
});

/**
 * Duplicate an invoice line item
 */
// TODO: Candidate for deletion if confirmed unused.
export const duplicate = userMutation({
	args: { id: v.id("invoiceLineItems") },
	handler: async (ctx, args): Promise<InvoiceLineItemId> => {
		await ctx.requireLevel("invoices", "modify");
		const originalItem = await ctx.orgEntity("invoiceLineItems", args.id);
		const parentInvoice = await validateInvoiceAccess(
			ctx,
			originalItem.invoiceId,
			ctx.orgId
		);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);

		// Get the highest sort order for the invoice to append the duplicate
		const allItems = await ctx.db
			.query("invoiceLineItems")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", originalItem.invoiceId))
			.collect();

		const newSortOrder = getNextLineItemSortOrder(allItems);

		// Create duplicate with incremented sort order
		const duplicateId = await ctx.db.insert("invoiceLineItems", {
			invoiceId: originalItem.invoiceId,
			orgId: originalItem.orgId,
			description: `${originalItem.description} (Copy)`,
			quantity: originalItem.quantity,
			unitPrice: originalItem.unitPrice,
			total: originalItem.total,
			sortOrder: newSortOrder,
		});

		return duplicateId;
	},
});

/**
 * Get invoice line item statistics
 */
// TODO: Candidate for deletion if confirmed unused.
export const getStats = optionalUserQuery({
	args: { invoiceId: v.id("invoices") },
	handler: async (ctx, args) => {
		const orgId = ctx.orgId;
		if (!orgId) {
			return {
				totalItems: 0,
				totalAmount: 0,
				averageUnitPrice: 0,
				totalQuantity: 0,
				highestAmount: 0,
				lowestAmount: 0,
			};
		}

		await ctx.requireLevel("invoices", "view");
		const parentInvoice = await validateInvoiceAccess(ctx, args.invoiceId, orgId);

		const allLineItems = await ctx.db
			.query("invoiceLineItems")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
			.collect();
		// All rows share one parent invoice — scope check runs once, not per row.
		const lineItems = await ctx.applyReadScope(
			"invoices",
			allLineItems,
			(_row, s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
		);

		const stats = {
			totalItems: lineItems.length,
			totalAmount: 0,
			averageUnitPrice: 0,
			totalQuantity: 0,
			highestAmount: 0,
			lowestAmount: Number.MAX_VALUE,
		};

		let totalUnitPrice = 0;

		lineItems.forEach((item: InvoiceLineItemDocument) => {
			stats.totalAmount += item.total;
			stats.totalQuantity += item.quantity;
			totalUnitPrice += item.unitPrice;

			if (item.total > stats.highestAmount) {
				stats.highestAmount = item.total;
			}

			if (item.total < stats.lowestAmount) {
				stats.lowestAmount = item.total;
			}
		});

		if (lineItems.length > 0) {
			stats.averageUnitPrice = totalUnitPrice / lineItems.length;
		} else {
			stats.lowestAmount = 0;
		}

		return stats;
	},
});
