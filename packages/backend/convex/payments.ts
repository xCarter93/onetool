import {
	query,
	mutation,
	internalMutation,
	internalQuery,
	QueryCtx,
	MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getCurrentUserOrgId } from "./lib/auth";
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
 * Payment operations - individual payment installments for invoices
 * Supports splitting invoices into multiple payments with individual due dates and payment links
 *
 * Uses shared CRUD utilities from lib/crud.ts for consistent patterns.
 * Entity-specific business logic (payment validation, Stripe integration) remains here.
 */

// Type definitions
type PaymentDocument = Doc<"payments">;
type PaymentId = Id<"payments">;
type InvoiceId = Id<"invoices">;

// ============================================================================
// Local Helper Functions (entity-specific logic only)
// ============================================================================

/**
 * Get a payment with org validation (wrapper for shared utility)
 */
async function getPaymentWithValidation(
	ctx: QueryCtx | MutationCtx,
	id: PaymentId
): Promise<PaymentDocument | null> {
	return await getEntityWithOrgValidation(ctx, "payments", id, "Payment");
}

/**
 * Get a payment, throwing if not found (wrapper for shared utility)
 */
async function getPaymentOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: PaymentId
): Promise<PaymentDocument> {
	return await getEntityOrThrow(ctx, "payments", id, "Payment");
}

/**
 * Validate invoice access (wrapper for shared utility)
 * Returns the invoice for additional processing
 */
async function validateInvoiceAccess(
	ctx: QueryCtx | MutationCtx,
	invoiceId: InvoiceId,
	existingOrgId?: Id<"organizations">
): Promise<Doc<"invoices">> {
	return await validateParentAccess(
		ctx,
		"invoices",
		invoiceId,
		"Invoice",
		existingOrgId
	);
}

/**
 * Get payment by public token (no auth required - for public payment page)
 */
async function getPaymentByPublicTokenInternal(
	ctx: QueryCtx,
	publicToken: string
): Promise<PaymentDocument | null> {
	return await ctx.db
		.query("payments")
		.withIndex("by_public_token", (q) => q.eq("publicToken", publicToken))
		.unique();
}

/**
 * Calculate invoice total from line items (source of truth)
 * This ensures we use the actual calculated total, not the potentially stale stored value
 * Falls back to stored invoice.total if no line items exist (for backwards compatibility)
 */
async function calculateInvoiceTotalFromLineItems(
	ctx: QueryCtx | MutationCtx,
	invoiceId: InvoiceId
): Promise<number> {
	const invoice = await ctx.db.get(invoiceId);
	if (!invoice) {
		throw new Error("Invoice not found");
	}

	// Get all line items for the invoice
	const lineItems = await ctx.db
		.query("invoiceLineItems")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
		.collect();

	// If no line items, fall back to stored invoice total (for backwards compatibility)
	if (lineItems.length === 0) {
		return Math.round(invoice.total * 100) / 100;
	}

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

	return Math.round(total * 100) / 100;
}

/**
 * Validate that payments sum equals invoice total (strict validation)
 * Uses calculated total from line items, not stored value
 */
async function validatePaymentSum(
	ctx: QueryCtx | MutationCtx,
	invoiceId: InvoiceId,
	paymentAmounts: number[]
): Promise<{
	valid: boolean;
	sum: number;
	invoiceTotal: number;
	difference: number;
}> {
	// Calculate actual invoice total from line items (source of truth)
	const invoiceTotal = await calculateInvoiceTotalFromLineItems(ctx, invoiceId);

	const sum = paymentAmounts.reduce((acc, amount) => acc + amount, 0);
	// Use rounding to handle floating point precision issues
	const roundedSum = Math.round(sum * 100) / 100;
	const roundedTotal = Math.round(invoiceTotal * 100) / 100;
	const difference = Math.round((roundedSum - roundedTotal) * 100) / 100;

	return {
		valid: difference === 0,
		sum: roundedSum,
		invoiceTotal: roundedTotal,
		difference,
	};
}

/**
 * Validate payment amount is positive
 */
function validatePaymentAmount(amount: number): void {
	if (amount <= 0) {
		throw new Error("Payment amount must be positive");
	}
}

/**
 * Validate sort order is non-negative
 */
function validateSortOrder(sortOrder: number): void {
	if (sortOrder < 0) {
		throw new Error("Sort order cannot be negative");
	}
}

/**
 * Check if all payments for an invoice are paid
 */
async function checkAllPaymentsPaid(
	ctx: MutationCtx,
	invoiceId: InvoiceId,
	currentPaymentId: PaymentId
): Promise<boolean> {
	const allPayments = await ctx.db
		.query("payments")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
		.collect();

	return allPayments.every(
		(p) => p._id === currentPaymentId || p.status === "paid"
	);
}

/**
 * Update invoice status to paid if all payments are complete
 */
async function updateInvoiceStatusIfFullyPaid(
	ctx: MutationCtx,
	invoiceId: InvoiceId,
	paymentId: PaymentId
): Promise<void> {
	const allPaid = await checkAllPaymentsPaid(ctx, invoiceId, paymentId);

	if (allPaid) {
		const invoice = await ctx.db.get(invoiceId);
		if (invoice && invoice.status !== "paid") {
			await ctx.db.patch(invoiceId, {
				status: "paid",
				paidAt: Date.now(),
			});
		}
	}
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all payments for a specific invoice
 */
export const listByInvoice = query({
	args: { invoiceId: v.id("invoices") },
	handler: async (ctx, args): Promise<PaymentDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		await validateInvoiceAccess(ctx, args.invoiceId, orgId);

		const payments = await ctx.db
			.query("payments")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
			.collect();

		// Sort by sortOrder
		return payments.sort((a, b) => a.sortOrder - b.sortOrder);
	},
});

/**
 * Get a specific payment by ID
 */
export const get = query({
	args: { id: v.id("payments") },
	handler: async (ctx, args): Promise<PaymentDocument | null> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		return await getPaymentWithValidation(ctx, args.id);
	},
});

/**
 * Get payment by public token (for public payment page - no auth required)
 * Returns payment, invoice, and org information
 */
export const getByPublicToken = query({
	args: { publicToken: v.string() },
	handler: async (ctx, args) => {
		const payment = await getPaymentByPublicTokenInternal(
			ctx,
			args.publicToken
		);
		if (!payment) {
			return null;
		}

		const invoice = await ctx.db.get(payment.invoiceId);
		if (!invoice) {
			return null;
		}

		const org = await ctx.db.get(payment.orgId);

		// Get all payments for context (how many payments, how much paid)
		const allPayments = await ctx.db
			.query("payments")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", payment.invoiceId))
			.collect();

		const sortedPayments = allPayments.sort((a, b) => a.sortOrder - b.sortOrder);
		const paymentIndex = sortedPayments.findIndex((p) => p._id === payment._id);
		const totalPaid = sortedPayments
			.filter((p) => p.status === "paid")
			.reduce((sum, p) => sum + p.paymentAmount, 0);

		return {
			payment: {
				_id: payment._id,
				publicToken: payment.publicToken,
				status: payment.status,
				paymentAmount: payment.paymentAmount,
				dueDate: payment.dueDate,
				description: payment.description,
				sortOrder: payment.sortOrder,
				paidAt: payment.paidAt,
			},
			invoice: {
				_id: invoice._id,
				invoiceNumber: invoice.invoiceNumber,
				total: invoice.total,
				clientId: invoice.clientId,
				status: invoice.status,
			},
			org: org
				? {
						name: org.name,
						stripeConnectAccountId: org.stripeConnectAccountId,
					}
				: null,
			paymentContext: {
				paymentNumber: paymentIndex + 1,
				totalPayments: sortedPayments.length,
				totalPaid,
				totalRemaining: invoice.total - totalPaid,
			},
		};
	},
});

/**
 * Get payment summary for an invoice
 */
export const getInvoiceSummary = query({
	args: { invoiceId: v.id("invoices") },
	handler: async (ctx, args) => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) {
			return {
				totalPayments: 0,
				paidCount: 0,
				pendingCount: 0,
				paidAmount: 0,
				remainingAmount: 0,
				invoiceTotal: 0,
			};
		}

		await validateInvoiceAccess(ctx, args.invoiceId, orgId);

		const payments = await ctx.db
			.query("payments")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
			.collect();

		const invoice = await ctx.db.get(args.invoiceId);

		const paidPayments = payments.filter((p) => p.status === "paid");
		const pendingPayments = payments.filter(
			(p) =>
				p.status === "pending" || p.status === "sent" || p.status === "overdue"
		);

		const paidAmount = paidPayments.reduce(
			(sum, p) => sum + p.paymentAmount,
			0
		);

		return {
			totalPayments: payments.length,
			paidCount: paidPayments.length,
			pendingCount: pendingPayments.length,
			paidAmount,
			remainingAmount: (invoice?.total ?? 0) - paidAmount,
			invoiceTotal: invoice?.total ?? 0,
		};
	},
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a single payment
 */
export const create = mutation({
	args: {
		invoiceId: v.id("invoices"),
		paymentAmount: v.number(),
		dueDate: v.number(),
		description: v.optional(v.string()),
		sortOrder: v.number(),
	},
	handler: async (ctx, args): Promise<PaymentId> => {
		const userOrgId = await getCurrentUserOrgId(ctx);

		// Validate invoice access
		await validateInvoiceAccess(ctx, args.invoiceId, userOrgId);

		// Validate payment amount and sort order
		validatePaymentAmount(args.paymentAmount);
		validateSortOrder(args.sortOrder);

		const paymentId = await ctx.db.insert("payments", {
			orgId: userOrgId,
			invoiceId: args.invoiceId,
			paymentAmount: args.paymentAmount,
			dueDate: args.dueDate,
			description: args.description,
			sortOrder: args.sortOrder,
			status: "pending",
			publicToken: generatePublicToken(),
		});

		return paymentId;
	},
});

/**
 * Update a payment (only if not paid)
 */
export const update = mutation({
	args: {
		id: v.id("payments"),
		paymentAmount: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		description: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("sent"),
				v.literal("overdue"),
				v.literal("cancelled")
			)
		),
	},
	handler: async (ctx, args): Promise<PaymentId> => {
		const { id, ...updates } = args;

		// Get payment and validate access
		const payment = await getPaymentOrThrow(ctx, id);

		// Cannot update paid payments
		if (payment.status === "paid") {
			throw new Error("Cannot update a paid payment");
		}

		// Validate payment amount if provided
		if (updates.paymentAmount !== undefined) {
			validatePaymentAmount(updates.paymentAmount);
		}

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates);
		requireUpdates(filteredUpdates);

		await ctx.db.patch(id, filteredUpdates);

		return id;
	},
});

/**
 * Delete a payment (only if not paid)
 */
export const remove = mutation({
	args: { id: v.id("payments") },
	handler: async (ctx, args): Promise<PaymentId> => {
		const payment = await getPaymentOrThrow(ctx, args.id);

		// Cannot delete paid payments
		if (payment.status === "paid") {
			throw new Error("Cannot delete a paid payment");
		}

		await ctx.db.delete(args.id);

		return args.id;
	},
});

/**
 * Configure payments for an invoice (bulk create/update)
 * This replaces all unpaid payments with the new configuration
 * Paid payments are preserved and cannot be modified
 */
export const configurePayments = mutation({
	args: {
		invoiceId: v.id("invoices"),
		payments: v.array(
			v.object({
				id: v.optional(v.id("payments")), // Existing payment ID if updating
				paymentAmount: v.number(),
				dueDate: v.number(),
				description: v.optional(v.string()),
				sortOrder: v.number(),
			})
		),
	},
	handler: async (ctx, args): Promise<PaymentId[]> => {
		const userOrgId = await getCurrentUserOrgId(ctx);

		// Validate invoice access
		await validateInvoiceAccess(ctx, args.invoiceId, userOrgId);

		// Get existing payments
		const existingPayments = await ctx.db
			.query("payments")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
			.collect();

		// Separate paid and unpaid payments
		const paidPayments = existingPayments.filter((p) => p.status === "paid");
		const unpaidPayments = existingPayments.filter((p) => p.status !== "paid");

		// Calculate total from new payments + paid payments
		const newPaymentAmounts = args.payments.map((p) => p.paymentAmount);
		const paidPaymentAmounts = paidPayments.map((p) => p.paymentAmount);
		const allPaymentAmounts = [...newPaymentAmounts, ...paidPaymentAmounts];

		// Validate that payments sum equals invoice total
		const validation = await validatePaymentSum(
			ctx,
			args.invoiceId,
			allPaymentAmounts
		);
		if (!validation.valid) {
			throw new Error(
				`Payment amounts must equal invoice total. ` +
					`Sum: $${validation.sum.toFixed(2)}, ` +
					`Invoice total: $${validation.invoiceTotal.toFixed(2)}, ` +
					`Difference: $${validation.difference.toFixed(2)}`
			);
		}

		// Validate all payment amounts are positive
		for (const payment of args.payments) {
			if (payment.paymentAmount <= 0) {
				throw new Error("All payment amounts must be positive");
			}
		}

		// Delete existing unpaid payments
		for (const unpaidPayment of unpaidPayments) {
			await ctx.db.delete(unpaidPayment._id);
		}

		// Create new payments
		const createdIds: PaymentId[] = [];

		for (const paymentData of args.payments) {
			const paymentId = await ctx.db.insert("payments", {
				orgId: userOrgId,
				invoiceId: args.invoiceId,
				paymentAmount: paymentData.paymentAmount,
				dueDate: paymentData.dueDate,
				description: paymentData.description,
				sortOrder: paymentData.sortOrder,
				status: "pending",
				publicToken: generatePublicToken(),
			});

			createdIds.push(paymentId);
		}

		// Return paid payment IDs followed by new payment IDs
		return [...paidPayments.map((p) => p._id), ...createdIds];
	},
});

/**
 * Create a default single payment for the full invoice amount
 * Used when creating an invoice from a quote
 */
export const createDefaultPayment = mutation({
	args: { invoiceId: v.id("invoices") },
	handler: async (ctx, args): Promise<PaymentId> => {
		const userOrgId = await getCurrentUserOrgId(ctx);

		// Validate invoice access
		const invoice = await validateInvoiceAccess(ctx, args.invoiceId, userOrgId);

		// Check if payments already exist
		const existingPayments = await ctx.db
			.query("payments")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
			.first();

		if (existingPayments) {
			throw new Error("Payments already exist for this invoice");
		}

		const paymentId = await ctx.db.insert("payments", {
			orgId: userOrgId,
			invoiceId: args.invoiceId,
			paymentAmount: invoice.total,
			dueDate: invoice.dueDate,
			description: "Full Payment",
			sortOrder: 0,
			status: "pending",
			publicToken: generatePublicToken(),
		});

		return paymentId;
	},
});

/**
 * Mark payment as paid by public token (internal only - called after Stripe verification)
 * Auto-updates invoice status when all payments are paid.
 *
 * Plan 14.2-03 (FINDINGS M-1): canonical paid-marking cascade. The webhook
 * path (`markPaidFromWebhookInternal`) delegates here so the aggregate
 * + invoice-cascade + status-change-event chain has a single owner.
 * - `stripeSessionId` is OPTIONAL because Stripe `checkout.session.completed`
 *   webhook payloads carry the session id while raw PaymentIntent retries
 *   may not. `paymentIntentId` is REQUIRED for any caller — Plan 14.2 audit
 *   #14 forbids defaulting to `""`.
 * - `source` is recorded on the emitted status-change event so workflow
 *   automations can distinguish confirm-vs-webhook origins if needed.
 */
export const markPaidByPublicTokenInternal = internalMutation({
	args: {
		publicToken: v.string(),
		stripeSessionId: v.optional(v.string()),
		stripePaymentIntentId: v.optional(v.string()),
		// Plan 14.2-03 — provenance hint, defaults to "confirm" for the original caller.
		source: v.optional(v.union(v.literal("confirm"), v.literal("webhook"))),
		// Plan 14.2-03 — alias accepted from webhook callers ("paymentIntentId").
		paymentIntentId: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<PaymentId> => {
		// Find payment by public token
		const payment = await ctx.db
			.query("payments")
			.withIndex("by_public_token", (q) =>
				q.eq("publicToken", args.publicToken)
			)
			.unique();

		if (!payment) {
			throw new Error("Payment not found");
		}

		// Check if already paid (idempotent)
		if (payment.status === "paid") {
			return payment._id;
		}

		const resolvedPaymentIntentId =
			args.stripePaymentIntentId ?? args.paymentIntentId;
		if (!resolvedPaymentIntentId) {
			// Plan 14.2 audit #14 — no `?? ""` defaulting for the PI id.
			throw new Error(
				"markPaidByPublicTokenInternal: stripePaymentIntentId is required"
			);
		}

		// Update payment to paid.
		await ctx.db.patch(payment._id, {
			status: "paid",
			paidAt: Date.now(),
			stripeSessionId: args.stripeSessionId ?? payment.stripeSessionId,
			stripePaymentIntentId: resolvedPaymentIntentId,
		});

		// Update invoice status if all payments are complete
		await updateInvoiceStatusIfFullyPaid(ctx, payment.invoiceId, payment._id);

		return payment._id;
	},
});

/**
 * Internal query: get payment by public token (for use in actions)
 */
export const getByPublicTokenInternal = internalQuery({
	args: { publicToken: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("payments")
			.withIndex("by_public_token", (q) =>
				q.eq("publicToken", args.publicToken)
			)
			.unique();
	},
});

/**
 * Internal query: get organization Stripe Connect account ID for a payment
 */
export const getOrgStripeAccount = internalQuery({
	args: { orgId: v.id("organizations") },
	handler: async (ctx, args) => {
		const org = await ctx.db.get(args.orgId);
		if (!org) return null;
		return {
			stripeConnectAccountId: org.stripeConnectAccountId,
		};
	},
});

/**
 * Reorder payments
 */
export const reorder = mutation({
	args: {
		invoiceId: v.id("invoices"),
		paymentIds: v.array(v.id("payments")),
	},
	handler: async (ctx, args): Promise<void> => {
		await validateInvoiceAccess(ctx, args.invoiceId);

		// Validate that all payments belong to the invoice
		for (const paymentId of args.paymentIds) {
			const payment = await getPaymentOrThrow(ctx, paymentId);
			if (payment.invoiceId !== args.invoiceId) {
				throw new Error("All payments must belong to the specified invoice");
			}
		}

		// Update sort order for each payment
		for (let i = 0; i < args.paymentIds.length; i++) {
			await ctx.db.patch(args.paymentIds[i], {
				sortOrder: i,
			});
		}
	},
});

/**
 * Send payment (mark as sent and optionally send notification)
 */
export const markAsSent = mutation({
	args: { id: v.id("payments") },
	handler: async (ctx, args): Promise<PaymentId> => {
		const payment = await getPaymentOrThrow(ctx, args.id);

		if (payment.status === "paid") {
			throw new Error("Cannot send a paid payment");
		}

		await ctx.db.patch(args.id, {
			status: "sent",
		});

		return args.id;
	},
});

/**
 * Mark payment as overdue
 */
export const markAsOverdue = mutation({
	args: { id: v.id("payments") },
	handler: async (ctx, args): Promise<PaymentId> => {
		const payment = await getPaymentOrThrow(ctx, args.id);

		if (payment.status === "paid") {
			throw new Error("Cannot mark a paid payment as overdue");
		}

		await ctx.db.patch(args.id, {
			status: "overdue",
		});

		return args.id;
	},
});

// ============================================================================
// Webhook-driven internal helpers (Plan 14.2-03)
// ============================================================================

/**
 * Plan 14.2-03 (FINDINGS W-3) — lookup a payment by stripePaymentIntentId so
 * the `payment_intent.payment_failed` switch case can feed `payment._id` into
 * `createWebhookNotificationInternal`. Org-scoped by_org index + filter
 * mirrors the lookup pattern inside the refunded/disputed mutations below.
 */
export const getByPaymentIntentIdInternal = internalQuery({
	args: {
		orgId: v.id("organizations"),
		paymentIntentId: v.string(),
	},
	returns: v.union(v.null(), v.object({ _id: v.id("payments") })),
	handler: async (ctx, args) => {
		const payment = await ctx.db
			.query("payments")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.filter((q) =>
				q.eq(q.field("stripePaymentIntentId"), args.paymentIntentId)
			)
			.first();
		return payment ? { _id: payment._id } : null;
	},
});

/**
 * Plan 14.2-03 (FINDINGS M-1) — thin shell that delegates to the canonical
 * `markPaidByPublicTokenInternal` cascade after validating org + amount +
 * payment_intent. The webhook is the authoritative paid signal — Stripe's
 * `checkout.session.completed` arrives even when the buyer closes the tab
 * before the success-URL `/api/pay/confirm` round-trip fires.
 *
 * Throws on:
 *   - Org mismatch (defense-in-depth against forged events bypassing
 *     signature verification — T-14.2-14).
 *   - Amount mismatch (T-14.2-15).
 *   - Missing payment_intent (audit #14 / T-14.2-16).
 *
 * Returns null when the payment row cannot be located (e.g., metadata stripped
 * by a misbehaving connected account) — no-op rather than throwing so Stripe
 * doesn't retry indefinitely on a genuinely unknown payment.
 */
export const markPaidFromWebhookInternal = internalMutation({
	args: {
		orgId: v.id("organizations"),
		sessionId: v.string(),
		amountTotal: v.number(),
		metadata: v.any(),
		paymentIntentId: v.union(v.string(), v.null()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const publicToken =
			typeof args.metadata?.publicToken === "string"
				? args.metadata.publicToken
				: undefined;
		const invoiceIdStr =
			typeof args.metadata?.invoiceId === "string"
				? args.metadata.invoiceId
				: undefined;

		let payment: Doc<"payments"> | null = null;
		if (publicToken) {
			payment = await ctx.db
				.query("payments")
				.withIndex("by_public_token", (q) =>
					q.eq("publicToken", publicToken)
				)
				.unique();
		} else if (invoiceIdStr) {
			payment = await ctx.db
				.query("payments")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.filter((q) => q.eq(q.field("invoiceId"), invoiceIdStr))
				.first();
		}

		if (!payment) {
			console.warn(
				`markPaidFromWebhookInternal: no payment found for session ${args.sessionId}`
			);
			return null;
		}

		// Org-scoping guard (T-14.2-14). The lookup is org-scoped for invoiceId,
		// but the publicToken path is global — assert match here.
		if (payment.orgId !== args.orgId) {
			throw new Error("Org mismatch on webhook payment lookup");
		}

		// Race with /api/pay/confirm — already paid path is a no-op.
		if (payment.status === "paid") {
			return null;
		}

		// Amount-tampering guard (T-14.2-15). Stripe sends `amount_total` in
		// cents; our payment row stores dollars.
		const expectedCents = Math.round(payment.paymentAmount * 100);
		if (args.amountTotal !== expectedCents) {
			throw new Error(
				`Webhook amount mismatch: expected ${expectedCents} cents, got ${args.amountTotal} cents`
			);
		}

		// Audit #14 / T-14.2-16 — no `?? ""` defaulting.
		if (!args.paymentIntentId) {
			throw new Error(
				`markPaidFromWebhookInternal: missing payment_intent for session ${args.sessionId}`
			);
		}

		// Clear pendingCheckoutSession* fields when the session matches
		// (FINDINGS W-4 — Plan 05 owns the mint side; here we clear on paid).
		if (
			payment.pendingCheckoutSessionId &&
			payment.pendingCheckoutSessionId === args.sessionId
		) {
			await ctx.db.patch(payment._id, {
				pendingCheckoutSessionId: undefined,
				pendingCheckoutSessionUrl: undefined,
				pendingCheckoutSessionExpiresAt: undefined,
			});
		}

		// FINDINGS M-1 — delegate the actual paid cascade (status patch,
		// invoice rollup) to the canonical mutation. Do not duplicate that
		// logic here.
		await ctx.runMutation(internal.payments.markPaidByPublicTokenInternal, {
			publicToken: payment.publicToken,
			stripeSessionId: args.sessionId,
			stripePaymentIntentId: args.paymentIntentId,
			source: "webhook",
		});
		return null;
	},
});

/**
 * Plan 14.2-03 — refund cascade. Flip payment to "refunded" and emit a status
 * change event so workflow automations and the M-1-equivalent revenue
 * aggregates pick up the transition. Notification emission lives at the
 * route-action level (handleEvent does not currently call this for refunds;
 * see CONTEXT decisions — only payment_failed and dispute_created notify).
 */
export const markRefundedFromWebhookInternal = internalMutation({
	args: {
		orgId: v.id("organizations"),
		paymentIntentId: v.string(),
		refundedAt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const payment = await ctx.db
			.query("payments")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.filter((q) =>
				q.eq(q.field("stripePaymentIntentId"), args.paymentIntentId)
			)
			.first();
		if (!payment) {
			console.warn(
				`markRefundedFromWebhookInternal: no payment for PI ${args.paymentIntentId}`
			);
			return null;
		}

		const oldStatus = payment.status;
		await ctx.db.patch(payment._id, {
			status: "refunded",
			refundedAt: args.refundedAt,
		});

		// Emit status-change event so existing workflows fire.
		await emitStatusChangeEvent(
			ctx,
			payment.orgId,
			"invoice",
			payment._id,
			oldStatus,
			"refunded",
			"stripeWebhookActions.charge.refunded"
		);
		return null;
	},
});

/**
 * Plan 14.2-03 (FINDINGS W-3) — dispute lifecycle. Sets disputed=true on the
 * payment row, emits a status-change event for workflow automations, and
 * emits a HIGH-priority notification whose body references Stripe's 7-day
 * response window. Disputes left unanswered for 7 days default to lost —
 * silent disputes are the prior surface we are closing here.
 */
export const flagDisputedFromWebhookInternal = internalMutation({
	args: {
		orgId: v.id("organizations"),
		paymentIntentId: v.string(),
		disputeId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const payment = await ctx.db
			.query("payments")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.filter((q) =>
				q.eq(q.field("stripePaymentIntentId"), args.paymentIntentId)
			)
			.first();
		if (!payment) {
			console.warn(
				`flagDisputedFromWebhookInternal: no payment for PI ${args.paymentIntentId}`
			);
			return null;
		}

		await ctx.db.patch(payment._id, {
			disputed: true,
			disputeId: args.disputeId,
		});

		// Workflow automations get notified; status itself doesn't change.
		await emitStatusChangeEvent(
			ctx,
			payment.orgId,
			"invoice",
			payment._id,
			payment.status,
			payment.status,
			"stripeWebhookActions.charge.dispute.created"
		);

		// FINDINGS W-3 — high-priority operator notification with the 7-day
		// response window referenced in the message body.
		await ctx.runMutation(
			internal.notifications.createWebhookNotificationInternal,
			{
				orgId: args.orgId,
				type: "dispute_created",
				paymentId: payment._id,
				priority: "high",
				message:
					`A dispute (${args.disputeId}) was filed on a payment. ` +
					`You have 7 days from the dispute date to respond via the Stripe Dashboard ` +
					`or the dispute defaults to lost. Review immediately.`,
			}
		);
		return null;
	},
});

/**
 * Cancel a payment
 */
export const cancel = mutation({
	args: { id: v.id("payments") },
	handler: async (ctx, args): Promise<PaymentId> => {
		const payment = await getPaymentOrThrow(ctx, args.id);

		if (payment.status === "paid") {
			throw new Error("Cannot cancel a paid payment");
		}

		await ctx.db.patch(args.id, {
			status: "cancelled",
		});

		return args.id;
	},
});
