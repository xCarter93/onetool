import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { ActivityHelpers } from "./lib/activities";
import { AggregateHelpers } from "./lib/aggregates";
import { BusinessUtils } from "./lib/shared";
import {
	getEntityWithOrgValidation,
	getEntityOrThrow,
	validateParentAccess,
	filterUndefined,
	requireUpdates,
} from "./lib/crud";
import { getOptionalOrgId, emptyListResult } from "./lib/queries";
import { emitStatusChangeEvent } from "./eventBus";

/**
 * Quote operations
 *
 * Uses shared CRUD utilities from lib/crud.ts for consistent patterns.
 * Entity-specific business logic (like quote numbering, status transitions,
 * BoldSign integration) remains here.
 */

// ============================================================================
// Local Helper Functions (entity-specific logic only)
// ============================================================================

/**
 * Get a quote with org validation (wrapper for shared utility)
 */
async function getQuoteWithValidation(
	ctx: QueryCtx | MutationCtx,
	id: Id<"quotes">
): Promise<Doc<"quotes"> | null> {
	return await getEntityWithOrgValidation(ctx, "quotes", id, "Quote");
}

/**
 * Get a quote, throwing if not found (wrapper for shared utility)
 */
async function getQuoteOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: Id<"quotes">
): Promise<Doc<"quotes">> {
	return await getEntityOrThrow(ctx, "quotes", id, "Quote");
}

/**
 * Validate client access (wrapper for shared utility)
 */
async function validateClientAccess(
	ctx: QueryCtx | MutationCtx,
	clientId: Id<"clients">,
	existingOrgId?: Id<"organizations">
): Promise<void> {
	await validateParentAccess(ctx, "clients", clientId, "Client", existingOrgId);
}

/**
 * Validate project access (wrapper for shared utility)
 */
async function validateProjectAccess(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
	existingOrgId?: Id<"organizations">
): Promise<void> {
	await validateParentAccess(
		ctx,
		"projects",
		projectId,
		"Project",
		existingOrgId
	);
}

/**
 * Calculate quote totals based on line items
 */
async function calculateQuoteTotals(
	ctx: QueryCtx | MutationCtx,
	quoteId: Id<"quotes">,
	options?: {
		discountEnabled?: boolean;
		discountAmount?: number;
		discountType?: "percentage" | "fixed";
		taxEnabled?: boolean;
		taxRate?: number;
	}
): Promise<{ subtotal: number; taxAmount: number; total: number }> {
	// Get all line items for the quote
	const lineItems = await ctx.db
		.query("quoteLineItems")
		.withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
		.collect();

	// Calculate subtotal
	const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

	// Apply discount if enabled
	let discountedSubtotal = subtotal;
	if (options?.discountEnabled && options.discountAmount) {
		discountedSubtotal = BusinessUtils.applyDiscount(
			subtotal,
			options.discountAmount,
			options.discountType === "percentage"
		);
	}

	// Calculate tax
	let taxAmount = 0;
	if (options?.taxEnabled && options.taxRate) {
		taxAmount = BusinessUtils.calculateTax(discountedSubtotal, options.taxRate);
	}

	// Calculate total
	const total = discountedSubtotal + taxAmount;

	return {
		subtotal,
		taxAmount,
		total,
	};
}

/**
 * Generate the next sequential quote number for an organization
 * Uses a counter stored in the organization for O(1) performance
 */
async function generateNextQuoteNumber(
	ctx: MutationCtx,
	orgId: Id<"organizations">
): Promise<string> {
	const org = await ctx.db.get(orgId);
	if (!org) {
		throw new Error("Organization not found");
	}

	let nextNumber: number;

	// If organization doesn't have a lastQuoteNumber (legacy), scan all quotes once
	if (org.lastQuoteNumber === undefined) {
		const quotes = await ctx.db
			.query("quotes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		let maxNumber = 0;
		for (const quote of quotes) {
			if (quote.quoteNumber) {
				// Extract number from format Q-000001
				const match = quote.quoteNumber.match(/^Q-(\d+)$/);
				if (match) {
					const num = parseInt(match[1], 10);
					if (num > maxNumber) {
						maxNumber = num;
					}
				}
			}
		}
		nextNumber = maxNumber + 1;
	} else {
		// Use the counter - much faster!
		nextNumber = org.lastQuoteNumber + 1;
	}

	// Update the organization's counter
	await ctx.db.patch(orgId, { lastQuoteNumber: nextNumber });

	// Format with leading zeros (6 digits)
	return `Q-${nextNumber.toString().padStart(6, "0")}`;
}

/**
 * Create a quote with automatic orgId assignment
 */
async function createQuoteWithOrg(
	ctx: MutationCtx,
	data: Omit<Doc<"quotes">, "_id" | "_creationTime" | "orgId">
): Promise<Id<"quotes">> {
	const userOrgId = await getCurrentUserOrgId(ctx);

	// Validate client access
	await validateClientAccess(ctx, data.clientId);

	// Validate project access if provided
	if (data.projectId) {
		await validateProjectAccess(ctx, data.projectId);
	}

	// Auto-generate quote number if not provided
	const quoteNumber =
		data.quoteNumber || (await generateNextQuoteNumber(ctx, userOrgId));

	const quoteData = {
		...data,
		quoteNumber,
		orgId: userOrgId,
	};

	return await ctx.db.insert("quotes", quoteData);
}

/**
 * Update a quote with validation
 */
async function updateQuoteWithValidation(
	ctx: MutationCtx,
	id: Id<"quotes">,
	updates: Partial<Doc<"quotes">>
): Promise<void> {
	// Validate quote exists and belongs to user's org
	await getQuoteOrThrow(ctx, id);

	// Validate new client if being updated
	if (updates.clientId) {
		await validateClientAccess(ctx, updates.clientId);
	}

	// Validate new project if being updated
	if (updates.projectId) {
		await validateProjectAccess(ctx, updates.projectId);
	}

	// Update the quote
	await ctx.db.patch(id, updates);
}

// Define specific types for quote operations
type QuoteDocument = Doc<"quotes">;
type QuoteId = Id<"quotes">;

// Interface for quote statistics
interface QuoteStats {
	total: number;
	byStatus: {
		draft: number;
		sent: number;
		approved: number;
		declined: number;
		expired: number;
	};
	totalValue: number;
	averageValue: number;
	approvalRate: number;
	thisMonth: number;
}

/**
 * Get all quotes for the current user's organization with calculated totals
 * Optimized to avoid N+1 query problem by batching line item fetches
 */
export const list = query({
	args: {
		status: v.optional(
			v.union(
				v.literal("draft"),
				v.literal("sent"),
				v.literal("approved"),
				v.literal("declined"),
				v.literal("expired")
			)
		),
		clientId: v.optional(v.id("clients")),
		projectId: v.optional(v.id("projects")),
	},
	handler: async (ctx, args): Promise<QuoteDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		let quotes: QuoteDocument[];

		if (args.projectId) {
			await validateProjectAccess(ctx, args.projectId, orgId);
			quotes = await ctx.db
				.query("quotes")
				.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
				.collect();
		} else if (args.clientId) {
			await validateClientAccess(ctx, args.clientId, orgId);
			quotes = await ctx.db
				.query("quotes")
				.withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
				.collect();
		} else if (args.status) {
			quotes = await ctx.db
				.query("quotes")
				.withIndex("by_status", (q) =>
					q.eq("orgId", orgId).eq("status", args.status!)
				)
				.collect();
		} else {
			quotes = await ctx.db
				.query("quotes")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect();
		}

		// Batch fetch ALL line items for ALL quotes in a single query
		// This avoids N+1 query problem (1 query for quotes + 1 query for all line items = 2 total)
		const allLineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		// Group line items by quoteId for O(1) lookup
		const lineItemsByQuote = new Map<Id<"quotes">, typeof allLineItems>();
		for (const item of allLineItems) {
			const existing = lineItemsByQuote.get(item.quoteId) || [];
			existing.push(item);
			lineItemsByQuote.set(item.quoteId, existing);
		}

		// Calculate totals for each quote using in-memory data
		const quotesWithCalculatedTotals = quotes.map((quote) => {
			const lineItems = lineItemsByQuote.get(quote._id) || [];

			// Calculate subtotal
			const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

			// Apply discount if enabled
			let discountedSubtotal = subtotal;
			if (quote.discountEnabled && quote.discountAmount) {
				discountedSubtotal = BusinessUtils.applyDiscount(
					subtotal,
					quote.discountAmount,
					quote.discountType === "percentage"
				);
			}

			// Calculate tax
			let taxAmount = 0;
			if (quote.taxEnabled && quote.taxRate) {
				taxAmount = BusinessUtils.calculateTax(
					discountedSubtotal,
					quote.taxRate
				);
			}

			// Calculate total
			const total = discountedSubtotal + taxAmount;

			return {
				...quote,
				subtotal,
				total,
				taxAmount,
			};
		});

		// Sort by creation time (newest first)
		return quotesWithCalculatedTotals.sort(
			(a, b) => b._creationTime - a._creationTime
		);
	},
});

/**
 * Get a specific quote by ID with calculated totals from line items
 */
export const get = query({
	args: { id: v.id("quotes") },
	handler: async (ctx, args): Promise<QuoteDocument | null> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		const quote = await getQuoteWithValidation(ctx, args.id);
		if (!quote) return null;

		// Calculate totals from line items
		const calculatedTotals = await calculateQuoteTotals(ctx, args.id, {
			discountEnabled: quote.discountEnabled,
			discountAmount: quote.discountAmount,
			discountType: quote.discountType,
			taxEnabled: quote.taxEnabled,
			taxRate: quote.taxRate,
		});

		// Return quote with calculated totals (overriding stored values)
		return {
			...quote,
			subtotal: calculatedTotals.subtotal,
			total: calculatedTotals.total,
			taxAmount: calculatedTotals.taxAmount,
		};
	},
});

/**
 * Create a new quote
 */
export const create = mutation({
	args: {
		clientId: v.id("clients"),
		projectId: v.optional(v.id("projects")),
		title: v.optional(v.string()),
		quoteNumber: v.optional(v.string()),
		status: v.union(
			v.literal("draft"),
			v.literal("sent"),
			v.literal("approved"),
			v.literal("declined"),
			v.literal("expired")
		),
		subtotal: v.number(),
		discountEnabled: v.optional(v.boolean()),
		discountAmount: v.optional(v.number()),
		discountType: v.optional(
			v.union(v.literal("percentage"), v.literal("fixed"))
		),
		taxEnabled: v.optional(v.boolean()),
		taxRate: v.optional(v.number()),
		taxAmount: v.optional(v.number()),
		total: v.number(),
		validUntil: v.optional(v.number()),
		clientMessage: v.optional(v.string()),
		terms: v.optional(v.string()),
		pdfSettings: v.optional(
			v.object({
				showQuantities: v.boolean(),
				showUnitPrices: v.boolean(),
				showLineItemTotals: v.boolean(),
				showTotals: v.boolean(),
			})
		),
	},
	handler: async (ctx, args): Promise<QuoteId> => {
		// Validate financial values
		if (args.subtotal < 0) {
			throw new Error("Subtotal cannot be negative");
		}

		if (args.total < 0) {
			throw new Error("Total cannot be negative");
		}

		if (args.discountEnabled && args.discountAmount !== undefined) {
			if (args.discountAmount < 0) {
				throw new Error("Discount amount cannot be negative");
			}
			if (args.discountType === "percentage" && args.discountAmount > 100) {
				throw new Error("Percentage discount cannot exceed 100%");
			}
		}

		if (args.taxEnabled && args.taxRate !== undefined && args.taxRate < 0) {
			throw new Error("Tax rate cannot be negative");
		}

		// Validate expiration date
		if (args.validUntil && args.validUntil <= Date.now()) {
			throw new Error("Valid until date must be in the future");
		}

		// Type assertion needed because schema still has deprecated publicToken field
		const quoteId = await createQuoteWithOrg(ctx, args as any);

		// Get the created quote for activity logging and aggregates
		const quote = await ctx.db.get(quoteId);
		if (quote) {
			const client = await ctx.db.get(quote.clientId);
			await ActivityHelpers.quoteCreated(
				ctx,
				quote as QuoteDocument,
				client?.companyName || "Unknown Client"
			);
			await AggregateHelpers.addQuote(ctx, quote as QuoteDocument);
		}

		return quoteId;
	},
});

/**
 * Update a quote
 */
export const update = mutation({
	args: {
		id: v.id("quotes"),
		clientId: v.optional(v.id("clients")),
		projectId: v.optional(v.id("projects")),
		title: v.optional(v.string()),
		quoteNumber: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("draft"),
				v.literal("sent"),
				v.literal("approved"),
				v.literal("declined"),
				v.literal("expired")
			)
		),
		subtotal: v.optional(v.number()),
		discountEnabled: v.optional(v.boolean()),
		discountAmount: v.optional(v.number()),
		discountType: v.optional(
			v.union(v.literal("percentage"), v.literal("fixed"))
		),
		taxEnabled: v.optional(v.boolean()),
		taxRate: v.optional(v.number()),
		taxAmount: v.optional(v.number()),
		total: v.optional(v.number()),
		validUntil: v.optional(v.number()),
		clientMessage: v.optional(v.string()),
		terms: v.optional(v.string()),
		pdfSettings: v.optional(
			v.object({
				showQuantities: v.boolean(),
				showUnitPrices: v.boolean(),
				showLineItemTotals: v.boolean(),
				showTotals: v.boolean(),
			})
		),
		// Countersignature settings
		requiresCountersignature: v.optional(v.boolean()),
		countersignerId: v.optional(v.id("users")),
		signingOrder: v.optional(
			v.union(v.literal("client_first"), v.literal("org_first"))
		),
	},
	handler: async (ctx, args): Promise<QuoteId> => {
		const { id, ...updates } = args;

		// Validate financial values
		if (updates.subtotal !== undefined && updates.subtotal < 0) {
			throw new Error("Subtotal cannot be negative");
		}

		if (updates.total !== undefined && updates.total < 0) {
			throw new Error("Total cannot be negative");
		}

		if (updates.discountAmount !== undefined && updates.discountAmount < 0) {
			throw new Error("Discount amount cannot be negative");
		}

		if (
			updates.discountType === "percentage" &&
			updates.discountAmount !== undefined &&
			updates.discountAmount > 100
		) {
			throw new Error("Percentage discount cannot exceed 100%");
		}

		if (updates.taxRate !== undefined && updates.taxRate < 0) {
			throw new Error("Tax rate cannot be negative");
		}

		// Validate expiration date
		if (updates.validUntil && updates.validUntil <= Date.now()) {
			throw new Error("Valid until date must be in the future");
		}

		// Validate countersignature settings
		if (updates.requiresCountersignature === true && !updates.countersignerId) {
			throw new Error(
				"Countersigner is required when countersignature is enabled"
			);
		}

		// Validate countersigner exists if provided
		if (updates.countersignerId) {
			const countersigner = await ctx.db.get(updates.countersignerId);
			if (!countersigner) {
				throw new Error("Countersigner not found");
			}
		}

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates) as Partial<QuoteDocument>;
		requireUpdates(filteredUpdates);

		// Get current quote to check for status changes
		const currentQuote = await getQuoteOrThrow(ctx, id);
		const oldStatus = currentQuote.status;

		// Handle status-specific updates
		if (
			filteredUpdates.status &&
			filteredUpdates.status !== currentQuote.status
		) {
			const now = Date.now();

			if (
				filteredUpdates.status === "sent" &&
				currentQuote.status === "draft"
			) {
				filteredUpdates.sentAt = now;
			} else if (filteredUpdates.status === "approved") {
				filteredUpdates.approvedAt = now;
			} else if (filteredUpdates.status === "declined") {
				filteredUpdates.declinedAt = now;
			}
		}

		await updateQuoteWithValidation(ctx, id, filteredUpdates);

		// Log appropriate activity based on status change and update aggregates
		const updatedQuote = await ctx.db.get(id);
		if (updatedQuote) {
			// Update aggregates if relevant fields changed
			if (
				filteredUpdates.status !== undefined ||
				filteredUpdates.approvedAt !== undefined ||
				filteredUpdates.total !== undefined
			) {
				await AggregateHelpers.updateQuote(
					ctx,
					currentQuote as QuoteDocument,
					updatedQuote as QuoteDocument
				);
			}

			const client = await ctx.db.get(updatedQuote.clientId);
			const clientName = client?.companyName || "Unknown Client";
			if (
				filteredUpdates.status === "sent" &&
				currentQuote.status === "draft"
			) {
				await ActivityHelpers.quoteSent(
					ctx,
					updatedQuote as QuoteDocument,
					clientName
				);
			} else if (filteredUpdates.status === "approved") {
				await ActivityHelpers.quoteApproved(
					ctx,
					updatedQuote as QuoteDocument,
					clientName
				);
			} else if (filteredUpdates.status === "declined") {
				await ActivityHelpers.quoteDeclined(
					ctx,
					updatedQuote as QuoteDocument,
					clientName
				);
			}

			// Emit status change event if status changed
			if (args.status && args.status !== oldStatus) {
				await emitStatusChangeEvent(
					ctx,
					updatedQuote.orgId,
					"quote",
					updatedQuote._id,
					oldStatus,
					args.status,
					"quotes.update"
				);
			}
		}

		return id;
	},
});

/**
 * Recalculate quote totals based on line items
 */
export const recalculateTotals = mutation({
	args: { id: v.id("quotes") },
	handler: async (ctx, args): Promise<QuoteId> => {
		const quote = await getQuoteOrThrow(ctx, args.id);

		const totals = await calculateQuoteTotals(ctx, args.id, {
			discountEnabled: quote.discountEnabled,
			discountAmount: quote.discountAmount,
			discountType: quote.discountType,
			taxEnabled: quote.taxEnabled,
			taxRate: quote.taxRate,
		});

		await ctx.db.patch(args.id, {
			subtotal: totals.subtotal,
			taxAmount: totals.taxAmount,
			total: totals.total,
		});

		return args.id;
	},
});

/**
 * Delete a quote with relationship validation
 */
export const remove = mutation({
	args: { id: v.id("quotes") },
	handler: async (ctx, args): Promise<QuoteId> => {
		// Check if quote has related invoices
		const invoices = await ctx.db
			.query("invoices")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.id))
			.collect();

		if (invoices.length > 0) {
			throw new Error(
				"Cannot delete quote with existing invoices. " +
					"Please remove or unlink the invoices first."
			);
		}

		// Delete line items first
		const lineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.id))
			.collect();

		for (const lineItem of lineItems) {
			await ctx.db.delete(lineItem._id);
		}

		// Get quote and remove from aggregates before deleting
		const quote = await getQuoteOrThrow(ctx, args.id); // Validate access
		await AggregateHelpers.removeQuote(ctx, quote as QuoteDocument);
		await ctx.db.delete(args.id);

		return args.id;
	},
});

/**
 * Search quotes
 */
export const search = query({
	args: {
		query: v.string(),
		status: v.optional(
			v.union(
				v.literal("draft"),
				v.literal("sent"),
				v.literal("approved"),
				v.literal("declined"),
				v.literal("expired")
			)
		),
		clientId: v.optional(v.id("clients")),
	},
	handler: async (ctx, args): Promise<QuoteDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		let quotes = await ctx.db
			.query("quotes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		// Filter by status if specified
		if (args.status) {
			quotes = quotes.filter((quote) => quote.status === args.status);
		}

		// Filter by client if specified
		if (args.clientId) {
			await validateClientAccess(ctx, args.clientId, orgId);
			quotes = quotes.filter((quote) => quote.clientId === args.clientId);
		}

		// Search in title, quote number, client message, and terms
		const searchQuery = args.query.toLowerCase();
		return quotes.filter(
			(quote: QuoteDocument) =>
				(quote.title && quote.title.toLowerCase().includes(searchQuery)) ||
				(quote.quoteNumber &&
					quote.quoteNumber.toLowerCase().includes(searchQuery)) ||
				(quote.clientMessage &&
					quote.clientMessage.toLowerCase().includes(searchQuery)) ||
				(quote.terms && quote.terms.toLowerCase().includes(searchQuery))
		);
	},
});

/**
 * Get quote statistics for dashboard
 */
export const getStats = query({
	args: {},
	handler: async (ctx): Promise<QuoteStats> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) {
			return {
				total: 0,
				byStatus: {
					draft: 0,
					sent: 0,
					approved: 0,
					declined: 0,
					expired: 0,
				},
				totalValue: 0,
				averageValue: 0,
				approvalRate: 0,
				thisMonth: 0,
			};
		}

		const quotes = await ctx.db
			.query("quotes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		const stats: QuoteStats = {
			total: quotes.length,
			byStatus: {
				draft: 0,
				sent: 0,
				approved: 0,
				declined: 0,
				expired: 0,
			},
			totalValue: 0,
			averageValue: 0,
			approvalRate: 0,
			thisMonth: 0,
		};

		const monthStart = new Date();
		monthStart.setDate(1);
		monthStart.setHours(0, 0, 0, 0);
		const monthStartTime = monthStart.getTime();

		let sentCount = 0;
		let approvedCount = 0;

		quotes.forEach((quote: QuoteDocument) => {
			// Count by status
			stats.byStatus[quote.status]++;

			// Count this month's quotes
			if (quote._creationTime >= monthStartTime) {
				stats.thisMonth++;
			}

			// Calculate total value (only for approved quotes)
			if (quote.status === "approved") {
				stats.totalValue += quote.total;
				approvedCount++;
			}

			// Count for approval rate calculation
			if (
				quote.status === "sent" ||
				quote.status === "approved" ||
				quote.status === "declined"
			) {
				sentCount++;
			}
		});

		// Calculate averages and rates
		if (approvedCount > 0) {
			stats.averageValue = stats.totalValue / approvedCount;
		}

		if (sentCount > 0) {
			stats.approvalRate = (approvedCount / sentCount) * 100;
		}

		return stats;
	},
});

/**
 * Get quotes expiring soon
 */
export const getExpiringSoon = query({
	args: { days: v.optional(v.number()) },
	handler: async (ctx, args): Promise<QuoteDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		const daysAhead = args.days || 7;

		const quotes = await ctx.db
			.query("quotes")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		const now = Date.now();
		const expirationThreshold = now + daysAhead * 24 * 60 * 60 * 1000;

		return quotes.filter(
			(quote: QuoteDocument) =>
				quote.status === "sent" &&
				quote.validUntil &&
				quote.validUntil <= expirationThreshold &&
				quote.validUntil > now
		);
	},
});
