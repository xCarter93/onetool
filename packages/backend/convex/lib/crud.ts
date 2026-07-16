/**
 * Shared CRUD Utilities for Convex Backend
 *
 * This module provides reusable patterns for common CRUD operations across all entity types.
 * It reduces code duplication and ensures consistent behavior for:
 * - Organization-scoped entity access
 * - Parent entity validation
 * - Error handling
 * - Common query patterns
 */

import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id, TableNames } from "../_generated/dataModel";
import { getCurrentUserOrgId } from "./auth";
import { calculateLineItemAmount } from "./money";

// ============================================================================
// Parent Entity Validation
// ============================================================================

/**
 * Validate that a parent entity exists and belongs to the user's organization.
 *
 * Use this when creating/updating child entities that reference a parent.
 *
 * @param ctx - Query or Mutation context
 * @param table - The parent table name
 * @param id - The parent entity ID
 * @param entityName - Human-readable entity name for error messages
 * @param existingOrgId - Optional pre-fetched org ID to avoid extra auth call
 *
 * @example
 * ```typescript
 * await validateParentAccess(ctx, "clients", args.clientId, "Client");
 * // Now safe to create child entity for this client
 * ```
 */
export async function validateParentAccess<T extends TableNames>(
	ctx: QueryCtx | MutationCtx,
	table: T,
	id: Id<T>,
	entityName: string,
	existingOrgId?: Id<"organizations">
): Promise<Doc<T>> {
	const userOrgId = existingOrgId ?? (await getCurrentUserOrgId(ctx));
	const parent = (await ctx.db.get(id)) as (Doc<T> & { orgId?: Id<"organizations"> }) | null;

	if (!parent) {
		throw new Error(`${entityName} not found`);
	}

	if (parent.orgId && parent.orgId !== userOrgId) {
		throw new Error(`${entityName} does not belong to your organization`);
	}

	return parent;
}

// ============================================================================
// Common Update Helpers
// ============================================================================

/**
 * Filter out undefined values from an updates object.
 *
 * Use this to prepare partial updates for ctx.db.patch()
 *
 * @param updates - Object with optional fields
 * @returns Object with only defined fields
 *
 * @example
 * ```typescript
 * const { id, ...updates } = args;
 * const filteredUpdates = filterUndefined(updates);
 * await ctx.db.patch(id, filteredUpdates);
 * ```
 */
export function filterUndefined<T extends Record<string, unknown>>(
	updates: T
): Partial<T> {
	return Object.fromEntries(
		Object.entries(updates).filter(([, value]) => value !== undefined)
	) as Partial<T>;
}

/**
 * Validate that an updates object has at least one valid field.
 *
 * @param updates - Filtered updates object
 * @throws Error if no valid updates provided
 */
export function requireUpdates(updates: Record<string, unknown>): void {
	if (Object.keys(updates).length === 0) {
		throw new Error("No valid updates provided");
	}
}

// ============================================================================
// Common Validation Helpers
// ============================================================================

/**
 * Common validation checks for string fields
 */
export const StringValidation = {
	/**
	 * Validate a required string field is not empty
	 */
	required(value: string | undefined, fieldName: string): void {
		if (value !== undefined && !value.trim()) {
			throw new Error(`${fieldName} is required`);
		}
	},

	/**
	 * Validate a string field is not empty if provided
	 */
	notEmpty(value: string | undefined, fieldName: string): void {
		if (value !== undefined && !value.trim()) {
			throw new Error(`${fieldName} cannot be empty`);
		}
	},
};

/**
 * Common validation checks for numeric fields
 */
export const NumberValidation = {
	/**
	 * Validate a number is positive (> 0)
	 */
	positive(value: number | undefined, fieldName: string): void {
		if (value !== undefined && value <= 0) {
			throw new Error(`${fieldName} must be positive`);
		}
	},

	/**
	 * Validate a number is non-negative (>= 0)
	 */
	nonNegative(value: number | undefined, fieldName: string): void {
		if (value !== undefined && value < 0) {
			throw new Error(`${fieldName} cannot be negative`);
		}
	},
};

// ============================================================================
// Primary Record Management
// ============================================================================

// Note: Primary record management is entity-specific due to Convex's strong typing.
// Each entity file (clientContacts.ts, clientProperties.ts) implements its own
// handlePrimary function that queries the specific table with the correct index.

// ============================================================================
// Line Item Helpers
// ============================================================================

/**
 * Line item data for bulk operations
 */
interface LineItemData {
	description: string;
	quantity: number;
	sortOrder: number;
}

/**
 * Validate common line item fields
 */
export function validateLineItemFields(
	item: Partial<LineItemData>,
	prefix = ""
): void {
	if (item.description !== undefined && !item.description.trim()) {
		throw new Error(`${prefix}Description is required`);
	}
	if (item.quantity !== undefined && item.quantity <= 0) {
		throw new Error(`${prefix}Quantity must be positive`);
	}
	if (item.sortOrder !== undefined && item.sortOrder < 0) {
		throw new Error(`${prefix}Sort order cannot be negative`);
	}
}

/**
 * Calculate line item total (quantity * rate or quantity * unitPrice)
 */
export function calculateLineItemTotal(quantity: number, rate: number): number {
	return calculateLineItemAmount(quantity, rate);
}

// ============================================================================
// Sorting Helpers
// ============================================================================

// Note: Entity reordering is implemented in entity-specific files due to
// Convex's strong typing. See lib/lineItems.ts for line item reordering.

/**
 * Get the next sort order for a new item in a collection
 *
 * @param items - Existing items with sortOrder field
 * @returns Next sort order value (max + 1 or 0 if empty)
 */
export function getNextSortOrder(items: Array<{ sortOrder: number }>): number {
	if (items.length === 0) return 0;
	return Math.max(...items.map((item) => item.sortOrder)) + 1;
}

// ============================================================================
// Statistics Helpers
// ============================================================================

/**
 * Calculate change type for period-over-period comparisons
 */
export function getChangeType(
	change: number
): "increase" | "decrease" | "neutral" {
	if (change > 0) return "increase";
	if (change < 0) return "decrease";
	return "neutral";
}

/**
 * Calculate period-over-period statistics
 */
export function calculatePeriodStats(
	current: number,
	previous: number
): {
	current: number;
	previous: number;
	change: number;
	changeType: "increase" | "decrease" | "neutral";
} {
	const change = current - previous;
	return {
		current,
		previous,
		change: Math.abs(change),
		changeType: getChangeType(change),
	};
}
