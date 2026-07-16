/**
 * Shared Line Items Utilities
 *
 * Provides common functionality for line item operations across quotes and invoices.
 * Reduces code duplication between invoiceLineItems.ts and quoteLineItems.ts.
 */

import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import { getCurrentUserOrgId } from "./auth";
import { calculateLineItemAmount, sumMoney } from "./money";

// ============================================================================
// Types
// ============================================================================

/**
 * Base line item fields common to both quote and invoice line items
 */
export interface BaseLineItemData {
	description: string;
	quantity: number;
	sortOrder: number;
}

/**
 * Quote line item specific fields
 */
export interface QuoteLineItemData extends BaseLineItemData {
	unit: string;
	rate: number;
	cost?: number;
	amount?: number; // calculated: quantity * rate
}

/**
 * Invoice line item specific fields
 */
export interface InvoiceLineItemData extends BaseLineItemData {
	unitPrice: number;
	total?: number; // calculated: quantity * unitPrice
}

/**
 * Statistics for line items
 */
export interface LineItemStats {
	totalItems: number;
	totalAmount: number;
	totalQuantity: number;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate base line item fields
 */
export function validateBaseLineItemFields(
	data: Partial<BaseLineItemData>,
	context: { isUpdate?: boolean; prefix?: string } = {}
): void {
	const { isUpdate = false, prefix = "" } = context;

	// Description validation
	if (data.description !== undefined) {
		if (!data.description.trim()) {
			throw new Error(
				isUpdate
					? `${prefix}Description cannot be empty`
					: `${prefix}Description is required`
			);
		}
	}

	// Quantity validation (isFinite also rejects NaN, which slips past `<= 0`
	// and would poison the stored amount and every roll-up above it)
	if (
		data.quantity !== undefined &&
		(!Number.isFinite(data.quantity) || data.quantity <= 0)
	) {
		throw new Error(`${prefix}Quantity must be a positive number`);
	}

	// Sort order validation
	if (data.sortOrder !== undefined && data.sortOrder < 0) {
		throw new Error(`${prefix}Sort order cannot be negative`);
	}
}

/**
 * Validate quote line item specific fields
 */
export function validateQuoteLineItemFields(
	data: Partial<QuoteLineItemData>,
	context: { isUpdate?: boolean; prefix?: string } = {}
): void {
	const { isUpdate = false, prefix = "" } = context;

	// Validate base fields
	validateBaseLineItemFields(data, context);

	// Unit validation
	if (data.unit !== undefined && !data.unit.trim()) {
		throw new Error(
			isUpdate
				? `${prefix}Unit cannot be empty`
				: `${prefix}Unit is required`
		);
	}

	// Rate validation
	if (data.rate !== undefined && (!Number.isFinite(data.rate) || data.rate < 0)) {
		throw new Error(`${prefix}Rate must be a non-negative number`);
	}

	// Cost validation
	if (data.cost !== undefined && (!Number.isFinite(data.cost) || data.cost < 0)) {
		throw new Error(`${prefix}Cost must be a non-negative number`);
	}
}

/**
 * Validate invoice line item specific fields
 */
export function validateInvoiceLineItemFields(
	data: Partial<InvoiceLineItemData>,
	context: { isUpdate?: boolean; prefix?: string } = {}
): void {
	const { prefix = "" } = context;

	// Validate base fields
	validateBaseLineItemFields(data, context);

	// Unit price validation
	if (
		data.unitPrice !== undefined &&
		(!Number.isFinite(data.unitPrice) || data.unitPrice < 0)
	) {
		throw new Error(`${prefix}Unit price must be a non-negative number`);
	}
}

// ============================================================================
// Calculations
// ============================================================================

/**
 * Calculate amount for quote line item
 */
export function calculateQuoteLineItemAmount(
	quantity: number,
	rate: number
): number {
	return calculateLineItemAmount(quantity, rate);
}

/**
 * Calculate total for invoice line item
 */
export function calculateInvoiceLineItemTotal(
	quantity: number,
	unitPrice: number
): number {
	return calculateLineItemAmount(quantity, unitPrice);
}

/**
 * Recalculate line item total based on updated fields
 */
export function recalculateLineItemTotal<
	T extends { quantity?: number; rate?: number; unitPrice?: number }
>(
	updates: T,
	currentItem: { quantity: number; rate?: number; unitPrice?: number },
	type: "quote" | "invoice"
): number {
	const quantity = updates.quantity ?? currentItem.quantity;
	const priceField = type === "quote" ? "rate" : "unitPrice";
	const price =
		(updates as Record<string, number | undefined>)[priceField] ??
		(currentItem as Record<string, number | undefined>)[priceField] ??
		0;

	return type === "quote"
		? calculateQuoteLineItemAmount(quantity, price)
		: calculateInvoiceLineItemTotal(quantity, price);
}

// ============================================================================
// Common Operations
// ============================================================================

/**
 * Get next sort order for a new line item
 */
export function getNextLineItemSortOrder(
	items: Array<{ sortOrder: number }>
): number {
	if (items.length === 0) return 0;
	return Math.max(...items.map((item) => item.sortOrder)) + 1;
}

/**
 * Sort line items by sortOrder
 */
export function sortLineItems<T extends { sortOrder: number }>(items: T[]): T[] {
	return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Calculate line items statistics
 */
export function calculateLineItemStats<
	T extends { quantity: number; total?: number; amount?: number }
>(items: T[], totalField: "total" | "amount" = "total"): LineItemStats {
	return {
		totalItems: items.length,
		totalAmount: sumMoney(
			items.map(
				(item) => (item as Record<string, number | undefined>)[totalField] ?? 0
			)
		),
		totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
	};
}

// ============================================================================
// Parent Validation Helpers
// ============================================================================

/**
 * Validate invoice access for line item operations
 */
export async function validateInvoiceAccess(
	ctx: QueryCtx | MutationCtx,
	invoiceId: Id<"invoices">,
	existingOrgId?: Id<"organizations">
): Promise<Doc<"invoices">> {
	const userOrgId = existingOrgId ?? (await getCurrentUserOrgId(ctx));
	const invoice = await ctx.db.get(invoiceId);

	if (!invoice) {
		throw new Error("Invoice not found");
	}

	if (invoice.orgId !== userOrgId) {
		throw new Error("Invoice does not belong to your organization");
	}

	return invoice;
}

/**
 * Validate quote access for line item operations
 */
export async function validateQuoteAccess(
	ctx: QueryCtx | MutationCtx,
	quoteId: Id<"quotes">,
	existingOrgId?: Id<"organizations">
): Promise<Doc<"quotes">> {
	const userOrgId = existingOrgId ?? (await getCurrentUserOrgId(ctx));
	const quote = await ctx.db.get(quoteId);

	if (!quote) {
		throw new Error("Quote not found");
	}

	if (quote.orgId !== userOrgId) {
		throw new Error("Quote does not belong to your organization");
	}

	return quote;
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Validate all items in a bulk create operation
 */
export function validateBulkLineItems<T extends BaseLineItemData>(
	items: T[],
	type: "quote" | "invoice"
): void {
	for (let i = 0; i < items.length; i++) {
		const prefix = `Item ${i + 1}: `;

		if (type === "quote") {
			validateQuoteLineItemFields(
				items[i] as unknown as Partial<QuoteLineItemData>,
				{ prefix }
			);
		} else {
			validateInvoiceLineItemFields(
				items[i] as unknown as Partial<InvoiceLineItemData>,
				{ prefix }
			);
		}
	}
}

// Note: Reorder functions for specific line item types are implemented
// in their respective entity files (invoiceLineItems.ts, quoteLineItems.ts)
// due to Convex's strong typing requirements for ctx.db.patch().
//
// The pattern is:
// ```typescript
// export const reorder = mutation({
//   args: { invoiceId: v.id("invoices"), itemIds: v.array(v.id("invoiceLineItems")) },
//   handler: async (ctx, args) => {
//     await validateInvoiceAccess(ctx, args.invoiceId);
//     for (let i = 0; i < args.itemIds.length; i++) {
//       const item = await ctx.orgEntity("invoiceLineItems", args.itemIds[i]);
//       if (item.invoiceId !== args.invoiceId) throw new Error("Invalid item");
//       await ctx.db.patch(args.itemIds[i], { sortOrder: i });
//     }
//   },
// });
// ```
