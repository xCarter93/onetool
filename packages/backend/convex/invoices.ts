import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { ActivityHelpers } from "./lib/activities";
import { AggregateHelpers } from "./lib/aggregates";
import { generatePublicToken } from "./lib/shared";
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
 * Invoice operations
 *
 * Uses shared CRUD utilities from lib/crud.ts for consistent patterns.
 * Entity-specific business logic (like payment handling, status transitions,
 * aggregate updates, and invoice number generation) remains here.
 */

// ============================================================================
// Local Helper Functions (entity-specific logic only)
// ============================================================================

/**
 * Get an invoice with org validation (wrapper for shared utility)
 */
async function getInvoiceWithOrgValidation(
	ctx: QueryCtx | MutationCtx,
	id: Id<"invoices">
): Promise<Doc<"invoices"> | null> {
	return await getEntityWithOrgValidation(ctx, "invoices", id, "Invoice");
}

/**
 * Get an invoice, throwing if not found (wrapper for shared utility)
 */
async function getInvoiceOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: Id<"invoices">
): Promise<Doc<"invoices">> {
	return await getEntityOrThrow(ctx, "invoices", id, "Invoice");
}

/**
 * Get an invoice by public token (for client access)
 * Entity-specific: no auth required for public invoice links
 */
async function getInvoiceByPublicToken(
	ctx: QueryCtx,
	publicToken: string
): Promise<Doc<"invoices"> | null> {
	return await ctx.db
		.query("invoices")
		.withIndex("by_public_token", (q) => q.eq("publicToken", publicToken))
		.unique();
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
 * Create an invoice with automatic orgId assignment
 */
async function createInvoiceWithOrg(
	ctx: MutationCtx,
	data: Omit<Doc<"invoices">, "_id" | "_creationTime" | "orgId" | "publicToken">
): Promise<Id<"invoices">> {
	const userOrgId = await getCurrentUserOrgId(ctx);

	// Validate client access
	await validateClientAccess(ctx, data.clientId);

	const invoiceData = {
		...data,
		orgId: userOrgId,
		publicToken: generatePublicToken(),
	};

	return await ctx.db.insert("invoices", invoiceData);
}

/**
 * Calculate invoice totals based on line items
 * This ensures totals are always accurate by calculating from line items (source of truth)
 */
async function calculateInvoiceTotals(
	ctx: QueryCtx | MutationCtx,
	invoiceId: Id<"invoices">
): Promise<{ subtotal: number; total: number }> {
	// Get all line items for the invoice
	const lineItems = await ctx.db
		.query("invoiceLineItems")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
		.collect();

	// Calculate subtotal from line items
	const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);

	// Get invoice to check for discount and tax
	const invoice = await ctx.db.get(invoiceId);
	if (!invoice) {
		throw new Error("Invoice not found");
	}

	// Calculate total with discount and tax
	let total = subtotal;
	if (invoice.discountAmount) {
		total -= invoice.discountAmount;
	}
	if (invoice.taxAmount) {
		total += invoice.taxAmount;
	}

	return {
		subtotal,
		total,
	};
}

// Define specific types for invoice operations
type InvoiceDocument = Doc<"invoices">;
type InvoiceId = Id<"invoices">;

// Interface for invoice statistics
interface InvoiceStats {
	total: number;
	byStatus: {
		draft: number;
		sent: number;
		paid: number;
		overdue: number;
		cancelled: number;
	};
	totalValue: number;
	totalPaid: number;
	totalOutstanding: number;
	thisMonth: number;
}

function createEmptyInvoiceStats(): InvoiceStats {
	return {
		total: 0,
		byStatus: {
			draft: 0,
			sent: 0,
			paid: 0,
			overdue: 0,
			cancelled: 0,
		},
		totalValue: 0,
		totalPaid: 0,
		totalOutstanding: 0,
		thisMonth: 0,
	};
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all invoices for the current user's organization
 * Totals are calculated dynamically from line items to ensure accuracy
 */
export const list = query({
	args: {
		status: v.optional(
			v.union(
				v.literal("draft"),
				v.literal("sent"),
				v.literal("paid"),
				v.literal("overdue"),
				v.literal("cancelled")
			)
		),
		clientId: v.optional(v.id("clients")),
		projectId: v.optional(v.id("projects")),
	},
	handler: async (ctx, args): Promise<InvoiceDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		let invoices: InvoiceDocument[];

		if (args.status) {
			invoices = await ctx.db
				.query("invoices")
				.withIndex("by_status", (q) =>
					q.eq("orgId", orgId).eq("status", args.status!)
				)
				.collect();
		} else {
			invoices = await ctx.db
				.query("invoices")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect();
		}

		// Apply additional filters
		if (args.clientId) {
			await validateClientAccess(ctx, args.clientId, orgId);
			invoices = invoices.filter(
				(invoice) => invoice.clientId === args.clientId
			);
		}

		if (args.projectId) {
			invoices = invoices.filter(
				(invoice) => invoice.projectId === args.projectId
			);
		}

		// Fetch all line items for these invoices in one query
		const allLineItems = await ctx.db
			.query("invoiceLineItems")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		// Group line items by invoice ID for efficient lookup
		const lineItemsByInvoice = new Map<Id<"invoices">, typeof allLineItems>();
		for (const item of allLineItems) {
			const existing = lineItemsByInvoice.get(item.invoiceId) || [];
			existing.push(item);
			lineItemsByInvoice.set(item.invoiceId, existing);
		}

		// Calculate totals for each invoice using in-memory data
		const invoicesWithCalculatedTotals = invoices.map((invoice) => {
			const lineItems = lineItemsByInvoice.get(invoice._id) || [];

			// Calculate subtotal from line items
			const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);

			// Calculate total with discount and tax
			let total = subtotal;
			if (invoice.discountAmount) {
				total -= invoice.discountAmount;
			}
			if (invoice.taxAmount) {
				total += invoice.taxAmount;
			}

			return {
				...invoice,
				subtotal,
				total,
			};
		});

		// Sort by creation time (newest first)
		return invoicesWithCalculatedTotals.sort(
			(a, b) => b._creationTime - a._creationTime
		);
	},
});

/**
 * Get a specific invoice by ID with calculated totals from line items
 */
// TODO: Candidate for deletion if confirmed unused.
export const get = query({
	args: { id: v.id("invoices") },
	handler: async (ctx, args): Promise<InvoiceDocument | null> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		const invoice = await getInvoiceWithOrgValidation(ctx, args.id);
		if (!invoice) return null;

		// Calculate totals from line items
		const { subtotal, total } = await calculateInvoiceTotals(ctx, args.id);

		return {
			...invoice,
			subtotal,
			total,
		};
	},
});

/**
 * Get an invoice by public token (for client access)
 */
// TODO: Candidate for deletion if confirmed unused.
export const getByPublicToken = query({
	args: { publicToken: v.string() },
	handler: async (ctx, args) => {
		const invoice = await getInvoiceByPublicToken(ctx, args.publicToken);
		if (!invoice) {
			return null;
		}

		const org = await ctx.db.get(invoice.orgId);

		return {
			invoice: {
				_id: invoice._id,
				publicToken: invoice.publicToken,
				status: invoice.status,
				invoiceNumber: invoice.invoiceNumber,
				clientId: invoice.clientId,
				projectId: invoice.projectId,
				total: invoice.total,
				subtotal: invoice.subtotal,
				discountAmount: invoice.discountAmount,
				taxAmount: invoice.taxAmount,
				dueDate: invoice.dueDate,
				issuedDate: invoice.issuedDate,
				description: invoice.status,
			},
			org: org
				? {
						stripeConnectAccountId: org.stripeConnectAccountId,
						name: org.name,
				  }
				: null,
		};
	},
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Public: mark an invoice as paid after hosted Checkout success.
 * Entity-specific: uses public token flow, no auth required
 */
export const markPaidByPublicToken = mutation({
	args: {
		publicToken: v.string(),
		stripeSessionId: v.string(),
		stripePaymentIntentId: v.string(),
	},
	handler: async (ctx, args) => {
		const invoice = await getInvoiceByPublicToken(ctx, args.publicToken);
		if (!invoice) {
			throw new Error("Invoice not found");
		}

		if (invoice.status === "paid") {
			return invoice._id;
		}

		await ctx.db.patch(invoice._id, {
			status: "paid",
			stripeSessionId: args.stripeSessionId,
			stripePaymentIntentId: args.stripePaymentIntentId,
			paidAt: Date.now(),
		});

		// Public flow: avoid requiring an authenticated user to log activity.
		try {
			const client = await ctx.db.get(invoice.clientId);
			await ActivityHelpers.invoicePaid(
				ctx,
				invoice,
				client?.companyName || "Unknown Client"
			);
		} catch (err) {
			console.warn("Invoice paid activity logging skipped:", err);
		}

		return invoice._id;
	},
});

/**
 * Create a new invoice
 */
// TODO: Candidate for deletion if confirmed unused.
export const create = mutation({
	args: {
		clientId: v.id("clients"),
		projectId: v.optional(v.id("projects")),
		quoteId: v.optional(v.id("quotes")),
		invoiceNumber: v.string(),
		status: v.union(
			v.literal("draft"),
			v.literal("sent"),
			v.literal("paid"),
			v.literal("overdue"),
			v.literal("cancelled")
		),
		subtotal: v.number(),
		discountAmount: v.optional(v.number()),
		taxAmount: v.optional(v.number()),
		total: v.number(),
		issuedDate: v.number(),
		dueDate: v.number(),
		paymentMethod: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<InvoiceId> => {
		// Validate required fields
		if (!args.invoiceNumber.trim()) {
			throw new Error("Invoice number is required");
		}

		// Validate financial values
		if (args.subtotal < 0) {
			throw new Error("Subtotal cannot be negative");
		}

		if (args.total < 0) {
			throw new Error("Total cannot be negative");
		}

		// Validate dates
		if (args.dueDate <= args.issuedDate) {
			throw new Error("Due date must be after issued date");
		}

		const invoiceId = await createInvoiceWithOrg(ctx, args);

		// Get the created invoice for activity logging and aggregates
		const invoice = await ctx.db.get(invoiceId);
		if (invoice) {
			const client = await ctx.db.get(invoice.clientId);
			await ActivityHelpers.invoiceCreated(
				ctx,
				invoice as InvoiceDocument,
				client?.companyName || "Unknown Client"
			);
			await AggregateHelpers.addInvoice(ctx, invoice as InvoiceDocument);
		}

		return invoiceId;
	},
});

/**
 * Update an invoice
 */
// TODO: Candidate for deletion if confirmed unused.
export const update = mutation({
	args: {
		id: v.id("invoices"),
		status: v.optional(
			v.union(
				v.literal("draft"),
				v.literal("sent"),
				v.literal("paid"),
				v.literal("overdue"),
				v.literal("cancelled")
			)
		),
		subtotal: v.optional(v.number()),
		discountAmount: v.optional(v.number()),
		taxAmount: v.optional(v.number()),
		total: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		paymentMethod: v.optional(v.string()),
		stripeSessionId: v.optional(v.string()),
		stripePaymentIntentId: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<InvoiceId> => {
		const { id, ...updates } = args;

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates) as Partial<InvoiceDocument>;
		requireUpdates(filteredUpdates);

		// Get current invoice to check for status changes
		const currentInvoice = await getInvoiceOrThrow(ctx, id);
		const oldStatus = currentInvoice.status;

		// Handle status-specific updates
		if (
			filteredUpdates.status &&
			filteredUpdates.status !== currentInvoice.status
		) {
			const now = Date.now();

			if (filteredUpdates.status === "paid") {
				filteredUpdates.paidAt = now;
			}
		}

		await ctx.db.patch(id, filteredUpdates);

		// Log appropriate activity based on status change and update aggregates
		const updatedInvoice = await ctx.db.get(id);
		if (updatedInvoice) {
			// Update aggregates if relevant fields changed
			if (
				filteredUpdates.status !== undefined ||
				filteredUpdates.paidAt !== undefined ||
				filteredUpdates.total !== undefined
			) {
				await AggregateHelpers.updateInvoice(
					ctx,
					currentInvoice as InvoiceDocument,
					updatedInvoice as InvoiceDocument
				);
			}

			const client = await ctx.db.get(updatedInvoice.clientId);
			const clientName = client?.companyName || "Unknown Client";
			if (
				filteredUpdates.status === "sent" &&
				currentInvoice.status === "draft"
			) {
				await ActivityHelpers.invoiceSent(
					ctx,
					updatedInvoice as InvoiceDocument,
					clientName
				);
			} else if (filteredUpdates.status === "paid") {
				await ActivityHelpers.invoicePaid(
					ctx,
					updatedInvoice as InvoiceDocument,
					clientName
				);
			}

			// Emit status change event if status changed
			if (args.status && args.status !== oldStatus) {
				await emitStatusChangeEvent(
					ctx,
					updatedInvoice.orgId,
					"invoice",
					updatedInvoice._id,
					oldStatus,
					args.status,
					"invoices.update"
				);
			}
		}

		return id;
	},
});

/**
 * Mark an invoice as paid
 */
// TODO: Candidate for deletion if confirmed unused.
export const markPaid = mutation({
	args: {
		id: v.id("invoices"),
		paymentMethod: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<InvoiceId> => {
		const invoice = await getInvoiceOrThrow(ctx, args.id);

		if (invoice.status === "paid") {
			throw new Error("Invoice is already paid");
		}

		if (invoice.status === "cancelled") {
			throw new Error("Cannot mark cancelled invoice as paid");
		}

		await ctx.db.patch(args.id, {
			status: "paid",
			paidAt: Date.now(),
		});

		// Log activity
		const updatedInvoice = await ctx.db.get(args.id);
		if (updatedInvoice) {
			const client = await ctx.db.get(updatedInvoice.clientId);
			await ActivityHelpers.invoicePaid(
				ctx,
				updatedInvoice as InvoiceDocument,
				client?.companyName || "Unknown Client"
			);
		}

		return args.id;
	},
});

/**
 * Delete an invoice
 */
// TODO: Candidate for deletion if confirmed unused.
export const remove = mutation({
	args: { id: v.id("invoices") },
	handler: async (ctx, args): Promise<InvoiceId> => {
		// Delete line items first
		const lineItems = await ctx.db
			.query("invoiceLineItems")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.id))
			.collect();

		for (const lineItem of lineItems) {
			await ctx.db.delete(lineItem._id);
		}

		// Get invoice and remove from aggregates before deleting
		const invoice = await getInvoiceOrThrow(ctx, args.id); // Validate access
		await AggregateHelpers.removeInvoice(ctx, invoice as InvoiceDocument);
		await ctx.db.delete(args.id);

		return args.id;
	},
});

/**
 * Get invoice statistics for dashboard
 */
// TODO: Candidate for deletion if confirmed unused.
export const getStats = query({
	args: {},
	handler: async (ctx): Promise<InvoiceStats> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return createEmptyInvoiceStats();

		const invoices = await ctx.db
			.query("invoices")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		const stats: InvoiceStats = {
			total: invoices.length,
			byStatus: {
				draft: 0,
				sent: 0,
				paid: 0,
				overdue: 0,
				cancelled: 0,
			},
			totalValue: 0,
			totalPaid: 0,
			totalOutstanding: 0,
			thisMonth: 0,
		};

		const now = Date.now();
		const monthStart = new Date();
		monthStart.setDate(1);
		monthStart.setHours(0, 0, 0, 0);
		const monthStartTime = monthStart.getTime();

		invoices.forEach((invoice: InvoiceDocument) => {
			// Check if overdue
			const isOverdue = invoice.status === "sent" && invoice.dueDate < now;
			const status = isOverdue ? "overdue" : invoice.status;

			// Count by status
			stats.byStatus[status as keyof typeof stats.byStatus]++;

			// Calculate financial values
			stats.totalValue += invoice.total;

			if (invoice.status === "paid") {
				stats.totalPaid += invoice.total;
			} else if (invoice.status === "sent" || isOverdue) {
				stats.totalOutstanding += invoice.total;
			}

			// Count this month's invoices
			if (invoice._creationTime >= monthStartTime) {
				stats.thisMonth++;
			}
		});

		return stats;
	},
});

/**
 * Get overdue invoices
 */
// TODO: Candidate for deletion if confirmed unused.
export const getOverdue = query({
	args: {},
	handler: async (ctx): Promise<InvoiceDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		const now = Date.now();

		const invoices = await ctx.db
			.query("invoices")
			.withIndex("by_due_date", (q) =>
				q.eq("orgId", orgId).lt("dueDate", now)
			)
			.collect();

		// Only return sent invoices that are overdue
		return invoices.filter((invoice) => invoice.status === "sent");
	},
});

/**
 * Recalculate invoice totals from line items
 * Useful for fixing invoices with incorrect stored totals
 */
export const recalculateTotals = mutation({
	args: { id: v.id("invoices") },
	handler: async (ctx, args): Promise<void> => {
		// Validate access
		await getInvoiceOrThrow(ctx, args.id);

		// Calculate totals from line items
		const { subtotal, total } = await calculateInvoiceTotals(ctx, args.id);

		// Update the invoice with calculated totals
		await ctx.db.patch(args.id, {
			subtotal,
			total,
		});
	},
});

/**
 * Generate next invoice number for organization
 */
export const generateInvoiceNumber = mutation({
	args: {},
	handler: async (ctx): Promise<string> => {
		const userOrgId = await getCurrentUserOrgId(ctx);

		// Get all invoices for this organization
		const orgInvoices = await ctx.db
			.query("invoices")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		// Find the maximum invoice number
		const maxNumber = orgInvoices.reduce((max, inv) => {
			const match = inv.invoiceNumber.match(/INV-(\d{6})/);
			if (match) {
				const num = parseInt(match[1]);
				return num > max ? num : max;
			}
			return max;
		}, 0);

		// Return next number with proper padding
		return `INV-${String(maxNumber + 1).padStart(6, "0")}`;
	},
});

/**
 * Create invoice from quote
 */
export const createFromQuote = mutation({
	args: {
		quoteId: v.id("quotes"),
		issuedDate: v.optional(v.number()),
		dueDate: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<InvoiceId> => {
		// Get and validate quote
		const userOrgId = await getCurrentUserOrgId(ctx);
		const quote = await ctx.db.get(args.quoteId);

		if (!quote) {
			throw new Error("Quote not found");
		}

		if (quote.orgId !== userOrgId) {
			throw new Error("Quote does not belong to your organization");
		}

		if (quote.status !== "approved") {
			throw new Error("Only approved quotes can be converted to invoices");
		}

		// Generate invoice number automatically
		const orgInvoices = await ctx.db
			.query("invoices")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		const maxNumber = orgInvoices.reduce((max, inv) => {
			const match = inv.invoiceNumber.match(/INV-(\d{6})/);
			if (match) {
				const num = parseInt(match[1]);
				return num > max ? num : max;
			}
			return max;
		}, 0);

		const invoiceNumber = `INV-${String(maxNumber + 1).padStart(6, "0")}`;

		// Set default dates if not provided
		const issuedDate = args.issuedDate || Date.now();
		const dueDate = args.dueDate || Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days default

		// Create invoice from quote
		const invoiceId = await ctx.db.insert("invoices", {
			orgId: userOrgId,
			clientId: quote.clientId,
			projectId: quote.projectId,
			quoteId: args.quoteId,
			invoiceNumber,
			status: "draft",
			subtotal: quote.subtotal,
			discountAmount: quote.discountAmount,
			taxAmount: quote.taxAmount,
			total: quote.total,
			issuedDate,
			dueDate,
			publicToken: generatePublicToken(),
		});

		// Copy quote line items to invoice line items
		const quoteLineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
			.collect();

		for (const quoteLineItem of quoteLineItems) {
			await ctx.db.insert("invoiceLineItems", {
				invoiceId,
				orgId: userOrgId,
				description: quoteLineItem.description,
				quantity: quoteLineItem.quantity,
				unitPrice: quoteLineItem.rate,
				total: quoteLineItem.amount,
				sortOrder: quoteLineItem.sortOrder,
			});
		}

		// Calculate accurate totals from the copied line items
		const { subtotal, total } = await calculateInvoiceTotals(ctx, invoiceId);

		// Update invoice with calculated totals (overwrite the copied quote values)
		await ctx.db.patch(invoiceId, {
			subtotal,
			total,
		});

		// Log activity and add to aggregates with updated totals
		const invoice = await ctx.db.get(invoiceId);
		if (invoice) {
			const client = await ctx.db.get(invoice.clientId);
			await ActivityHelpers.invoiceCreated(
				ctx,
				invoice as InvoiceDocument,
				client?.companyName || "Unknown Client"
			);
			await AggregateHelpers.addInvoice(ctx, invoice as InvoiceDocument);
		}

		// Create default payment for the full invoice amount
		await ctx.db.insert("payments", {
			orgId: userOrgId,
			invoiceId,
			paymentAmount: total,
			dueDate,
			description: "Full Payment",
			sortOrder: 0,
			status: "pending",
			publicToken: generatePublicToken(),
		});

		return invoiceId;
	},
});

/**
 * Get an invoice with all its payments and aggregated payment status
 */
export const getWithPayments = query({
	args: { id: v.id("invoices") },
	handler: async (ctx, args) => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		const invoice = await getInvoiceWithOrgValidation(ctx, args.id);
		if (!invoice) return null;

		// Calculate totals from line items
		const { subtotal, total } = await calculateInvoiceTotals(ctx, args.id);

		// Get all payments for this invoice
		const payments = await ctx.db
			.query("payments")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.id))
			.collect();

		// Sort by sortOrder
		const sortedPayments = payments.sort((a, b) => a.sortOrder - b.sortOrder);

		// Calculate payment summary
		const paidPayments = sortedPayments.filter((p) => p.status === "paid");
		const pendingPayments = sortedPayments.filter(
			(p) => p.status === "pending" || p.status === "sent" || p.status === "overdue"
		);

		const paidAmount = paidPayments.reduce((sum, p) => sum + p.paymentAmount, 0);
		const remainingAmount = total - paidAmount;

		return {
			...invoice,
			subtotal,
			total,
			payments: sortedPayments,
			paymentSummary: {
				totalPayments: sortedPayments.length,
				paidCount: paidPayments.length,
				pendingCount: pendingPayments.length,
				paidAmount,
				remainingAmount,
				allPaymentsPaid: sortedPayments.length > 0 && sortedPayments.every((p) => p.status === "paid"),
				percentPaid: total > 0 ? Math.round((paidAmount / total) * 100) : 0,
			},
		};
	},
});
