import { query, internalQuery, QueryCtx, MutationCtx } from "./_generated/server";
import { mutation, internalMutation } from "./lib/triggers";
import { touchInvoiceContent } from "./lib/editLocks";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
	validateParentAccess,
	filterUndefined,
	requireUpdates,
} from "./lib/crud";
import { emptyListResult } from "./lib/queries";
import { rateLimiter } from "./rateLimits";
import { entitlementsFromIdentity, isFeatureAllowed } from "./lib/entitlements";
import { getCurrentUserOrgIdOrNull } from "./lib/auth";
import { emitStatusChangeEvent } from "./eventBus";
import { applyMarkPaidCascade } from "./lib/payments";
import { calculateInvoiceTotals } from "./lib/invoiceTotals";
import { dollarsToCents, formatCurrency, roundCents, sumMoney } from "./lib/money";
import { ActivityHelpers } from "./lib/activities";
import { celebrateInvoicePaid } from "./lib/celebrations";
import { kickQboSyncWorker, maybeEnqueueQboSync } from "./lib/quickbooksEnqueue";
import {
	optionalUserQuery,
	systemMutation,
	userMutation,
} from "./lib/factories";

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
 * Calculate invoice total from line items (source of truth)
 * This ensures we use the actual calculated total, not the potentially stale stored value
 * Falls back to stored invoice.total if no line items exist (for backwards compatibility)
 */
async function calculateInvoiceTotalFromLineItems(
	ctx: QueryCtx | MutationCtx,
	invoiceId: InvoiceId
): Promise<number> {
	// Shared roll-up; falls back to the stored invoice.total when no line items
	// exist (legacy invoices created before line items were required).
	const { total } = await calculateInvoiceTotals(ctx, invoiceId, {
		emptyFallback: "stored",
	});
	return total;
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

	// Sum in integer cents so float drift can never fail a valid payment split
	const roundedSum = sumMoney(paymentAmounts);
	const roundedTotal = roundCents(invoiceTotal);
	const difference = roundCents(roundedSum - roundedTotal);

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

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all payments for a specific invoice
 */
export const listByInvoice = optionalUserQuery({
	args: { invoiceId: v.id("invoices") },
	handler: async (ctx, args): Promise<PaymentDocument[]> => {
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("invoices", "view");

		const parentInvoice = await validateInvoiceAccess(ctx, args.invoiceId, orgId);

		const payments = await ctx.db
			.query("payments")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
			.collect();

		// All rows share one parent invoice — scope check runs once, not per row.
		const scoped = await ctx.applyReadScope("invoices", payments, (_row, s) =>
			parentInvoice.projectId
				? s.projectIds.has(parentInvoice.projectId)
				: s.clientIds.has(parentInvoice.clientId)
		);

		// Sort by sortOrder
		return scoped.sort((a, b) => a.sortOrder - b.sortOrder);
	},
});

/**
 * Get a specific payment by ID
 */
export const get = optionalUserQuery({
	args: { id: v.id("payments") },
	handler: async (ctx, args): Promise<PaymentDocument | null> => {
		const orgId = ctx.orgId;
		if (!orgId) return null;
		await ctx.requireLevel("invoices", "view");
		let payment: PaymentDocument;
		try {
			payment = await ctx.orgEntity("payments", args.id);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Entity not found in payments:")) {
				return null;
			}
			throw error;
		}
		// Payments belong to the invoices permission object — scope via the parent invoice.
		const parentInvoice = await validateInvoiceAccess(ctx, payment.invoiceId, orgId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);
		return payment;
	},
});

/**
 * Get payment summary for an invoice
 */
export const getInvoiceSummary = optionalUserQuery({
	args: { invoiceId: v.id("invoices") },
	handler: async (ctx, args) => {
		const orgId = ctx.orgId;
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

		await ctx.requireLevel("invoices", "view");
		const parentInvoice = await validateInvoiceAccess(ctx, args.invoiceId, orgId);

		const allPayments = await ctx.db
			.query("payments")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
			.collect();
		// All rows share one parent invoice — scope check runs once, not per row.
		const payments = await ctx.applyReadScope("invoices", allPayments, (_row, s) =>
			parentInvoice.projectId
				? s.projectIds.has(parentInvoice.projectId)
				: s.clientIds.has(parentInvoice.clientId)
		);

		const invoice = await ctx.db.get(args.invoiceId);

		const paidPayments = payments.filter((p) => p.status === "paid");
		const pendingPayments = payments.filter(
			(p) =>
				p.status === "pending" || p.status === "sent" || p.status === "overdue"
		);

		const paidAmount = sumMoney(paidPayments.map((p) => p.paymentAmount));

		return {
			totalPayments: payments.length,
			paidCount: paidPayments.length,
			pendingCount: pendingPayments.length,
			paidAmount,
			remainingAmount: roundCents((invoice?.total ?? 0) - paidAmount),
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
export const create = userMutation({
	args: {
		invoiceId: v.id("invoices"),
		paymentAmount: v.number(),
		dueDate: v.number(),
		description: v.optional(v.string()),
		sortOrder: v.number(),
	},
	handler: async (ctx, args): Promise<PaymentId> => {
		await ctx.requireLevel("invoices", "modify");
		// Validate invoice access
		const parentInvoice = await validateInvoiceAccess(ctx, args.invoiceId, ctx.orgId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);

		// Validate payment amount and sort order
		validatePaymentAmount(args.paymentAmount);
		validateSortOrder(args.sortOrder);

		const paymentId = await ctx.db.insert("payments", {
			orgId: ctx.orgId,
			invoiceId: args.invoiceId,
			paymentAmount: args.paymentAmount,
			dueDate: args.dueDate,
			description: args.description,
			sortOrder: args.sortOrder,
			status: "pending",
		});

		// The payment schedule prints on the invoice PDF.
		await touchInvoiceContent(ctx, args.invoiceId);

		return paymentId;
	},
});

/**
 * Update a payment (only if not paid)
 */
export const update = userMutation({
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
		await ctx.requireLevel("invoices", "modify");
		const { id, ...updates } = args;

		// Get payment and validate access
		const payment = await ctx.orgEntity("payments", id);
		const parentInvoice = await validateInvoiceAccess(ctx, payment.invoiceId, ctx.orgId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);

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

		// Schedule-shape changes print on the invoice PDF; status flips don't.
		if (
			filteredUpdates.paymentAmount !== undefined ||
			filteredUpdates.dueDate !== undefined ||
			filteredUpdates.description !== undefined
		) {
			await touchInvoiceContent(ctx, payment.invoiceId);
		}

		return id;
	},
});

/**
 * Delete a payment (only if not paid)
 */
export const remove = userMutation({
	args: { id: v.id("payments") },
	handler: async (ctx, args): Promise<PaymentId> => {
		await ctx.requireLevel("invoices", "delete");
		const payment = await ctx.orgEntity("payments", args.id);
		const parentInvoice = await validateInvoiceAccess(ctx, payment.invoiceId, ctx.orgId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);

		// Cannot delete paid payments
		if (payment.status === "paid") {
			throw new Error("Cannot delete a paid payment");
		}

		await ctx.db.delete(args.id);

		// The payment schedule prints on the invoice PDF.
		await touchInvoiceContent(ctx, payment.invoiceId);

		return args.id;
	},
});

/**
 * Configure payments for an invoice (bulk create/update)
 * This replaces all unpaid payments with the new configuration
 * Paid payments are preserved and cannot be modified
 */
export const configurePayments = userMutation({
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
		await ctx.requireLevel("invoices", "modify");
		// Validate invoice access
		const parentInvoice = await validateInvoiceAccess(ctx, args.invoiceId, ctx.orgId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);

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
				orgId: ctx.orgId,
				invoiceId: args.invoiceId,
				paymentAmount: paymentData.paymentAmount,
				dueDate: paymentData.dueDate,
				description: paymentData.description,
				sortOrder: paymentData.sortOrder,
				status: "pending",
			});

			createdIds.push(paymentId);
		}

		// The payment schedule prints on the invoice PDF.
		await touchInvoiceContent(ctx, args.invoiceId);

		// Return paid payment IDs followed by new payment IDs
		return [...paidPayments.map((p) => p._id), ...createdIds];
	},
});

/**
 * Create a default single payment for the full invoice amount
 * Used when creating an invoice from a quote
 */
export const createDefaultPayment = userMutation({
	args: { invoiceId: v.id("invoices") },
	handler: async (ctx, args): Promise<PaymentId> => {
		await ctx.requireLevel("invoices", "modify");
		// Validate invoice access
		const invoice = await validateInvoiceAccess(ctx, args.invoiceId, ctx.orgId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				invoice.projectId
					? s.projectIds.has(invoice.projectId)
					: s.clientIds.has(invoice.clientId)
			)
		);

		// Check if payments already exist
		const existingPayments = await ctx.db
			.query("payments")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
			.first();

		if (existingPayments) {
			throw new Error("Payments already exist for this invoice");
		}

		const paymentId = await ctx.db.insert("payments", {
			orgId: ctx.orgId,
			invoiceId: args.invoiceId,
			paymentAmount: invoice.total,
			dueDate: invoice.dueDate,
			description: "Full Payment",
			sortOrder: 0,
			status: "pending",
		});

		return paymentId;
	},
});

/**
 * Record a payment taken in the field (cash/check) against an invoice.
 *
 * Works within the installment model so the sum-to-total invariant is never
 * bent: the received amount settles unpaid installment rows in order, and when
 * it lands mid-row the row is SPLIT — the settled part keeps the row, the
 * still-owed remainder becomes a new row. Settling the last outstanding row
 * flips the invoice to paid with the same effects as invoices.markPaid
 * (activity, celebration, status event, QuickBooks sync). A full-amount
 * payment therefore degenerates to exactly the markPaid behavior.
 *
 * Manual invoices created without installment rows (rows are normally
 * backfilled at send time) get the standard full-amount row first, so
 * recording cash against a never-sent draft works — cash-first field jobs
 * are the point of this mutation.
 */
export const recordManualPayment = userMutation({
	args: {
		invoiceId: v.id("invoices"),
		amount: v.number(),
		method: v.union(
			v.literal("cash"),
			v.literal("check"),
			v.literal("other")
		),
		note: v.optional(v.string()),
	},
	returns: v.object({ invoicePaid: v.boolean(), remaining: v.number() }),
	handler: async (
		ctx,
		args
	): Promise<{ invoicePaid: boolean; remaining: number }> => {
		await ctx.requireLevel("invoices", "modify");
		const invoice = await validateInvoiceAccess(ctx, args.invoiceId, ctx.orgId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				invoice.projectId
					? s.projectIds.has(invoice.projectId)
					: s.clientIds.has(invoice.clientId)
			)
		);

		if (invoice.status === "paid" || invoice.status === "cancelled") {
			throw new ConvexError({
				code: "CONFLICT",
				message: `Cannot record a payment on a ${invoice.status} invoice.`,
			});
		}

		const amount = roundCents(args.amount);
		if (!Number.isFinite(amount) || amount <= 0) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Payment amount must be greater than zero.",
			});
		}

		// Rows are normally backfilled at send time; a never-sent invoice may
		// have none. Mirror the send-time backfill so there is something to
		// settle against.
		let rows = await ctx.db
			.query("payments")
			.withIndex("by_invoice_sort", (q) => q.eq("invoiceId", invoice._id))
			.collect();
		if (rows.length === 0 && invoice.total > 0) {
			await ctx.db.insert("payments", {
				orgId: invoice.orgId,
				invoiceId: invoice._id,
				paymentAmount: invoice.total,
				dueDate: invoice.dueDate,
				description: "Full Payment",
				sortOrder: 0,
				status: "pending",
			});
			rows = await ctx.db
				.query("payments")
				.withIndex("by_invoice_sort", (q) => q.eq("invoiceId", invoice._id))
				.collect();
		}

		const outstanding = rows.filter(
			(p) =>
				p.status === "pending" ||
				p.status === "sent" ||
				p.status === "overdue"
		);
		const outstandingTotal = sumMoney(outstanding.map((p) => p.paymentAmount));
		if (outstanding.length === 0 || outstandingTotal <= 0) {
			throw new ConvexError({
				code: "CONFLICT",
				message: "This invoice has no outstanding balance to record against.",
			});
		}
		if (amount > outstandingTotal) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: `Amount exceeds the remaining balance of ${formatCurrency(outstandingTotal)}.`,
			});
		}

		const now = Date.now();
		const settle = {
			status: "paid" as const,
			paidAt: now,
			recordedOutsidePortal: true,
			manualMethod: args.method,
			manualNote: args.note?.trim() || undefined,
			// Drop any stale in-flight Stripe cache so the portal can't resume a
			// mint against a now-settled row (mirrors settleOutstandingPayments).
			pendingPaymentIntentId: undefined,
			pendingPaymentIntentClientSecret: undefined,
			pendingPaymentIntentExpiresAt: undefined,
			pendingCheckoutSessionId: undefined,
			pendingCheckoutSessionUrl: undefined,
			pendingCheckoutSessionExpiresAt: undefined,
		};

		// Settle rows in display order; one QBO worker kick for the whole batch.
		let left = amount;
		let qboSyncQueued = false;
		const enqueueRow = async (paymentId: Id<"payments">) => {
			if (
				await maybeEnqueueQboSync(ctx, invoice.orgId, "payment", paymentId, {
					kick: false,
				})
			) {
				qboSyncQueued = true;
			}
		};
		for (const row of outstanding) {
			if (left <= 0) break;
			const rowAmount = roundCents(row.paymentAmount);
			if (left >= rowAmount) {
				await ctx.db.patch(row._id, settle);
				await enqueueRow(row._id);
				left = roundCents(left - rowAmount);
			} else {
				// Split: this row becomes the settled part; the remainder becomes a
				// fresh pending row right after it (no Stripe/token carry-over).
				// Both parts are cent-aligned, so their sum is exactly rowAmount and
				// the invoice-total invariant holds.
				await ctx.db.patch(row._id, { ...settle, paymentAmount: left });
				await enqueueRow(row._id);
				for (const later of rows) {
					if (later._id !== row._id && later.sortOrder > row.sortOrder) {
						await ctx.db.patch(later._id, {
							sortOrder: later.sortOrder + 1,
						});
					}
				}
				await ctx.db.insert("payments", {
					orgId: row.orgId,
					invoiceId: row.invoiceId,
					paymentAmount: roundCents(rowAmount - left),
					dueDate: row.dueDate,
					// Distinct label so the portal/PDF don't show two same-named rows.
					description: `${row.description ?? "Payment"} (balance)`,
					sortOrder: row.sortOrder + 1,
					status: row.status,
				});
				left = 0;
			}
		}

		const remaining = roundCents(outstandingTotal - amount);
		const fullySettled = remaining === 0;

		if (fullySettled) {
			// Same effect set as invoices.markPaid, plus the status event that the
			// automation triggers and payment-received notifications hang off.
			const oldStatus = invoice.status;
			await ctx.db.patch(invoice._id, { status: "paid", paidAt: now });
			const updatedInvoice = await ctx.db.get(invoice._id);
			if (updatedInvoice) {
				const client = await ctx.db.get(updatedInvoice.clientId);
				await ActivityHelpers.invoicePaid(
					ctx,
					updatedInvoice as Doc<"invoices">,
					client?.companyName || "Unknown Client"
				);
				await celebrateInvoicePaid(ctx, updatedInvoice, ctx.user._id);
				await emitStatusChangeEvent(
					ctx,
					updatedInvoice.orgId,
					"invoice",
					updatedInvoice._id,
					oldStatus,
					"paid",
					"payments.recordManualPayment"
				);
				if (
					await maybeEnqueueQboSync(
						ctx,
						updatedInvoice.orgId,
						"invoice",
						updatedInvoice._id,
						{ kick: false }
					)
				) {
					qboSyncQueued = true;
				}
			}
		}
		if (qboSyncQueued) {
			await kickQboSyncWorker(ctx, invoice.orgId);
		}

		// The payment schedule prints on the invoice PDF — mark it stale like
		// every other schedule-changing mutation in this file.
		await touchInvoiceContent(ctx, invoice._id);

		return { invoicePaid: fullySettled, remaining };
	},
});

/**
 * Mark payment as paid by public token (internal only - called after Stripe verification)
 * Auto-updates invoice status when all payments are paid.
 *
 * Webhook and success-page confirmation paths both delegate here so invoice
 * status updates stay in one place.
 */
export const markPaidByPublicTokenInternal = internalMutation({
	args: {
		publicToken: v.string(),
		stripeSessionId: v.optional(v.string()),
		stripePaymentIntentId: v.optional(v.string()),
		source: v.optional(v.union(v.literal("confirm"), v.literal("webhook"))),
	},
	handler: async (ctx, args): Promise<PaymentId> => {
		const payment = await ctx.db
			.query("payments")
			.withIndex("by_public_token", (q) =>
				q.eq("publicToken", args.publicToken)
			)
			.unique();
		if (!payment) {
			throw new Error("Payment not found");
		}
		if (payment.status === "paid") {
			return payment._id;
		}
		if (!args.stripePaymentIntentId) {
			throw new Error(
				"markPaidByPublicTokenInternal: stripePaymentIntentId is required"
			);
		}
		return await applyMarkPaidCascade(ctx, {
			paymentId: payment._id,
			stripePaymentIntentId: args.stripePaymentIntentId,
			source: args.source ?? "confirm",
			stripeSessionId: args.stripeSessionId,
		});
	},
});

/**
 * Internal query: get organization Stripe Connect account ID for a payment
 */
// Raw internalQuery — no factory variant exists; if exposing user-scoped data, prefer userQuery.
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
export const reorder = userMutation({
	args: {
		invoiceId: v.id("invoices"),
		paymentIds: v.array(v.id("payments")),
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

		// Validate that all payments belong to the invoice
		for (const paymentId of args.paymentIds) {
			const payment = await ctx.orgEntity("payments", paymentId);
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

		// The payment schedule prints on the invoice PDF.
		await touchInvoiceContent(ctx, args.invoiceId);
	},
});

/**
 * Send payment (mark as sent and optionally send notification)
 */
export const markAsSent = userMutation({
	args: { id: v.id("payments") },
	handler: async (ctx, args): Promise<PaymentId> => {
		await ctx.requireLevel("invoices", "modify");
		const payment = await ctx.orgEntity("payments", args.id);
		const parentInvoice = await validateInvoiceAccess(ctx, payment.invoiceId, ctx.orgId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);

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
export const markAsOverdue = userMutation({
	args: { id: v.id("payments") },
	handler: async (ctx, args): Promise<PaymentId> => {
		await ctx.requireLevel("invoices", "modify");
		const payment = await ctx.orgEntity("payments", args.id);
		const parentInvoice = await validateInvoiceAccess(ctx, payment.invoiceId, ctx.orgId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);

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
// Checkout session lifecycle
// ============================================================================

/**
 * Increment the checkout attempt counter used in Stripe idempotency keys.
 */
// Internal-only: advancing the counter shifts the Stripe idempotency key, so
// only the portal PI mint (portal/invoicesActions.ts) may call it.
export const incrementCheckoutAttemptCounter = internalMutation({
	args: { paymentId: v.id("payments") },
	returns: v.number(),
	handler: async (ctx, args): Promise<number> => {
		const payment = await ctx.db.get(args.paymentId);
		if (!payment) {
			throw new Error("Payment not found");
		}
		const next = (payment.checkoutAttemptCounter ?? 0) + 1;
		await ctx.db.patch(payment._id, { checkoutAttemptCounter: next });
		return next;
	},
});

// ============================================================================
// Public-surface rate limiting (PUB-11 / PUB-12)
// ============================================================================

const rateLimitResult = v.object({
	ok: v.boolean(),
	retryAfter: v.optional(v.number()),
});
type RateLimitResult = { ok: boolean; retryAfter?: number };

// PUB-12a: per-IP throttle for the public /api/schedule-demo Resend route.
// Stays raw — called by the unauthenticated marketing route's ConvexHttpClient.
export const checkScheduleDemoRateLimit = mutation({
	args: { ip: v.string() },
	returns: rateLimitResult,
	handler: async (ctx, args): Promise<RateLimitResult> => {
		const rl = await rateLimiter.limit(ctx, "scheduleDemoPerIp", {
			key: args.ip,
		});
		return rl.ok ? { ok: true } : { ok: false, retryAfter: rl.retryAfter };
	},
});

const llmAccessResult = v.object({
	ok: v.boolean(),
	reason: v.optional(
		v.union(v.literal("forbidden"), v.literal("rate_limited"))
	),
	retryAfter: v.optional(v.number()),
});
type LlmAccessResult = {
	ok: boolean;
	reason?: "forbidden" | "rate_limited";
	retryAfter?: number;
};

// PUB-12b: plan gate + per-org throttle for LLM-backed web API routes.
// Gated on the llmCsvImport entitlement; the caller must forward the Clerk
// "convex" JWT or this denies as unauthenticated.
export const checkLlmAccess = mutation({
	args: {
		bucket: v.union(v.literal("llmCsvAnalyze")),
	},
	returns: llmAccessResult,
	handler: async (ctx, args): Promise<LlmAccessResult> => {
		const { plan } = await entitlementsFromIdentity(ctx);
		if (!isFeatureAllowed(plan, "llmCsvImport")) {
			return { ok: false, reason: "forbidden" };
		}
		// Key per org; a premium user-override without an active org falls back
		// to their identity subject.
		const orgId = await getCurrentUserOrgIdOrNull(ctx);
		const key =
			orgId ?? (await ctx.auth.getUserIdentity())?.subject ?? "anonymous";
		const rl = await rateLimiter.limit(ctx, args.bucket, { key });
		if (!rl.ok) {
			return { ok: false, reason: "rate_limited", retryAfter: rl.retryAfter };
		}
		return { ok: true };
	},
});

// ============================================================================
// Webhook-driven internal helpers
// ============================================================================

/**
 * Lookup a payment by Stripe PaymentIntent within an org.
 */
// Raw internalQuery — no factory variant exists; if exposing user-scoped data, prefer userQuery.
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
 * Validate a completed Checkout Session and delegate to the paid cascade.
 * Unknown payment metadata is treated as a terminal no-op to avoid endless retries.
 */
export const markPaidFromWebhookInternal = systemMutation({
	args: {
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

		// publicToken is required: it uniquely identifies the installment row.
		// Falling back to invoiceId is unsafe because invoices can have multiple
		// installments and `.first()` would pick an arbitrary one.
		let payment: Doc<"payments"> | null = null;
		if (publicToken) {
			payment = await ctx.db
				.query("payments")
				.withIndex("by_public_token", (q) =>
					q.eq("publicToken", publicToken)
				)
				.unique();
		}

		if (!payment) {
			// PUB-34: a lookup miss must NOT be silently acked. Throwing propagates
			// to markEventFailed so Stripe retries instead of permanently marking
			// the event processed against a payment that never resolved.
			throw new Error(
				`markPaidFromWebhookInternal: no payment found for session ${args.sessionId}`
			);
		}

		// The publicToken lookup is global, so assert org scope here.
		if (payment.orgId !== ctx.orgId) {
			throw new Error("Org mismatch on webhook payment lookup");
		}

		// Race with /api/pay/confirm — already paid path is a no-op.
		if (payment.status === "paid") {
			return null;
		}

		// Stripe sends amount_total in cents; payment rows store dollars.
		// Mismatch and missing payment_intent are both deterministic for a
		// given session: throwing would loop ~70 Stripe retries over days
		// without changing the outcome. Treat as terminal — log loudly and
		// return so the event is acked, leaving the payment un-marked-paid
		// for manual investigation.
		const expectedCents = dollarsToCents(payment.paymentAmount);
		if (args.amountTotal !== expectedCents) {
			console.error(
				`markPaidFromWebhookInternal: amount mismatch on session ${args.sessionId} — ` +
					`expected ${expectedCents} cents, got ${args.amountTotal} cents. ` +
					`Payment left in status=${payment.status}; investigate manually.`
			);
			return null;
		}

		if (!args.paymentIntentId) {
			console.error(
				`markPaidFromWebhookInternal: missing payment_intent for session ${args.sessionId}. ` +
					`Payment left in status=${payment.status}; investigate manually.`
			);
			return null;
		}

		// Clear pending Checkout Session fields after successful payment.
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

		// Legacy Checkout path: only tokened rows ever reach here (new rows never
		// create Checkout Sessions). Narrow the now-optional token.
		if (!payment.publicToken) {
			console.error(
				`markPaidFromWebhookInternal: payment ${payment._id} has no publicToken ` +
					`(session ${args.sessionId}); cannot resolve legacy row. Ack and skip.`
			);
			return null;
		}
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
 * Persist the active PaymentIntent so portal retries can reuse its clientSecret.
 */
export const persistPendingPaymentIntentInternal = internalMutation({
	args: {
		paymentId: v.id("payments"),
		pendingPaymentIntentId: v.string(),
		pendingPaymentIntentClientSecret: v.string(),
		pendingPaymentIntentExpiresAt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const payment = await ctx.db.get(args.paymentId);
		if (!payment) {
			throw new ConvexError({ code: "PAYMENT_NOT_FOUND" });
		}
		await ctx.db.patch(payment._id, {
			pendingPaymentIntentId: args.pendingPaymentIntentId,
			pendingPaymentIntentClientSecret: args.pendingPaymentIntentClientSecret,
			pendingPaymentIntentExpiresAt: args.pendingPaymentIntentExpiresAt,
		});
		return null;
	},
});

/**
 * payment_intent.succeeded webhook → mark-paid cascade. Three-assertion gauntlet
 * (paymentId/publicToken correlation, amount_received vs paymentAmount cents, paymentIntentId
 * non-empty) runs before the cascade. No ctx.runMutation here —
 * applyMarkPaidCascade is the canonical writer and runs in this mutation's
 * context.
 */
export const markPaidFromPaymentIntentWebhookInternal = systemMutation({
	args: {
		paymentIntentId: v.string(),
		amountReceived: v.number(),
		metadata: v.any(),
		cardBrand: v.optional(v.string()),
		cardLast4: v.optional(v.string()),
		stripeReceiptUrl: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		// Every guard below is deterministic for a given Stripe event — Stripe
		// redelivers the same payload on retry, so throwing would burn ~70
		// retries over days without changing the outcome. Match the Checkout
		// Session handler: log loudly and ack the event so it stops retrying.
		if (!args.paymentIntentId || args.paymentIntentId.length === 0) {
			console.error(
				"markPaidFromPaymentIntentInternal: missing paymentIntentId on webhook args; ack and skip."
			);
			return null;
		}
		// Correlate by paymentId (durable row id, stamped in PI metadata at mint)
		// with a publicToken fallback for any PaymentIntent minted before the token
		// was retired from the mint path.
		const paymentIdRaw =
			typeof args.metadata?.paymentId === "string"
				? args.metadata.paymentId
				: undefined;
		const publicToken =
			typeof args.metadata?.publicToken === "string"
				? args.metadata.publicToken
				: undefined;
		let payment: PaymentDocument | null = null;
		if (paymentIdRaw) {
			const normalized = ctx.db.normalizeId("payments", paymentIdRaw);
			if (normalized) {
				payment = await ctx.db.get(normalized);
			}
		}
		if (!payment && publicToken) {
			payment = await ctx.db
				.query("payments")
				.withIndex("by_public_token", (q) => q.eq("publicToken", publicToken))
				.unique();
		}
		if (!payment) {
			console.error(
				`markPaidFromPaymentIntentInternal: no payment row for PI ${args.paymentIntentId} ` +
					`(metadata paymentId=${paymentIdRaw ?? "none"}, publicToken=${publicToken ?? "none"}). Ack and skip.`
			);
			return null;
		}
		if (payment.orgId !== ctx.orgId) {
			// Security signal: log at error level so it surfaces in alerting,
			// but still ack so Stripe doesn't retry the same mismatch 70 times.
			console.error(
				`markPaidFromPaymentIntentInternal: ORG MISMATCH on PI ${args.paymentIntentId} — ` +
					`payment.orgId=${payment.orgId} vs event.orgId=${ctx.orgId}. ` +
					`Investigate immediately. Ack and skip.`
			);
			return null;
		}
		if (payment.status === "paid") {
			return null;
		}
		const expectedCents = dollarsToCents(payment.paymentAmount);
		if (args.amountReceived !== expectedCents) {
			// Deterministic for a given PI: throwing would loop ~70 Stripe
			// retries over days without changing the outcome. Match the
			// Checkout Session handler — log loudly and ack the event.
			console.error(
				`markPaidFromPaymentIntentInternal: amount mismatch on PI ${args.paymentIntentId} — ` +
					`expected ${expectedCents} cents, got ${args.amountReceived} cents. ` +
					`Payment left in status=${payment.status}; investigate manually.`
			);
			return null;
		}
		await applyMarkPaidCascade(ctx, {
			paymentId: payment._id,
			stripePaymentIntentId: args.paymentIntentId,
			source: "webhook-pi",
			receiptMetadata: {
				cardBrand: args.cardBrand,
				cardLast4: args.cardLast4,
				stripeReceiptUrl: args.stripeReceiptUrl,
			},
		});
		return null;
	},
});

/**
 * Mark a payment refunded from a Stripe webhook.
 */
export const markRefundedFromWebhookInternal = systemMutation({
	args: {
		paymentIntentId: v.string(),
		refundedAt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const payment = await ctx.db
			.query("payments")
			.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
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

		// Emit status-change event so existing workflows fire. The entityId
		// must point at the invoice (not the payment row) because downstream
		// automation handlers resolve it as Id<"invoices">.
		await emitStatusChangeEvent(
			ctx,
			payment.orgId,
			"invoice",
			payment.invoiceId,
			oldStatus,
			"refunded",
			"stripeWebhookActions.charge.refunded"
		);
		return null;
	},
});

/**
 * Mark a payment disputed and notify the org owner.
 */
export const flagDisputedFromWebhookInternal = systemMutation({
	args: {
		paymentIntentId: v.string(),
		disputeId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const payment = await ctx.db
			.query("payments")
			.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
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
			// A new dispute id restarts the lifecycle; stale resolution fields from
			// a prior dispute would trip syncDisputeFromWebhookInternal's guard.
			...(payment.disputeId !== undefined &&
			payment.disputeId !== args.disputeId
				? { disputeStatus: undefined, disputeResolvedAt: undefined }
				: {}),
		});

		// Workflow automations get notified; status itself doesn't change.
		await emitStatusChangeEvent(
			ctx,
			payment.orgId,
			"invoice",
			payment.invoiceId,
			payment.status,
			payment.status,
			"stripeWebhookActions.charge.dispute.created"
		);

		await ctx.runMutation(
			internal.notifications.createWebhookNotificationInternal,
			{
				orgId: ctx.orgId,
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
 * Sync dispute lifecycle (charge.dispute.updated / .closed) onto the payment.
 * Lost disputes stay flagged `disputed` — the funds were withdrawn — but the
 * payment status is left untouched so the invoice paid-sum invariant holds;
 * the notification tells the owner to adjust manually if they re-bill.
 */
export const syncDisputeFromWebhookInternal = systemMutation({
	args: {
		paymentIntentId: v.string(),
		disputeId: v.string(),
		disputeStatus: v.string(),
		closed: v.boolean(),
		resolvedAt: v.optional(v.number()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const payment = await ctx.db
			.query("payments")
			.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
			.filter((q) =>
				q.eq(q.field("stripePaymentIntentId"), args.paymentIntentId)
			)
			.first();
		if (!payment) {
			console.warn(
				`syncDisputeFromWebhookInternal: no payment for PI ${args.paymentIntentId}`
			);
			return null;
		}

		// A late non-closing update for an already-resolved dispute must not
		// overwrite the final won/lost status. Updates for a different (new)
		// dispute id still apply.
		if (
			!args.closed &&
			payment.disputeResolvedAt !== undefined &&
			payment.disputeId === args.disputeId
		) {
			return null;
		}

		const won = args.disputeStatus === "won";
		const lost = args.disputeStatus === "lost";

		await ctx.db.patch(payment._id, {
			disputeId: args.disputeId,
			disputeStatus: args.disputeStatus,
			...(args.closed
				? {
						disputed: lost,
						disputeResolvedAt: args.resolvedAt ?? Date.now(),
					}
				: {}),
		});

		if (!args.closed) return null;

		// Same-status event so workflow automations can react to the outcome.
		await emitStatusChangeEvent(
			ctx,
			payment.orgId,
			"invoice",
			payment.invoiceId,
			payment.status,
			payment.status,
			`stripeWebhookActions.charge.dispute.closed:${args.disputeStatus}`
		);

		const message = won
			? `Dispute ${args.disputeId} was resolved in your favor - the funds return to your balance.`
			: lost
				? `Dispute ${args.disputeId} was lost. The payment amount and dispute fee were withdrawn from your Stripe balance. The invoice payment is still recorded as paid - adjust it manually if you re-bill your client.`
				: args.disputeStatus === "warning_closed"
					? `Dispute inquiry ${args.disputeId} closed without escalating to a chargeback.`
					: `Dispute ${args.disputeId} closed with status "${args.disputeStatus}".`;
		await ctx.runMutation(
			internal.notifications.createWebhookNotificationInternal,
			{
				orgId: ctx.orgId,
				type: "dispute_resolved",
				paymentId: payment._id,
				priority: lost ? "high" : "normal",
				message,
			}
		);
		return null;
	},
});

/**
 * Revert a payment when an initiated refund later fails (charge.refund.updated
 * with refund.status === "failed", e.g. bank-transfer-backed refunds).
 */
export const revertFailedRefundFromWebhookInternal = systemMutation({
	args: {
		paymentIntentId: v.string(),
		refundId: v.string(),
		failureReason: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const payment = await ctx.db
			.query("payments")
			.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
			.filter((q) =>
				q.eq(q.field("stripePaymentIntentId"), args.paymentIntentId)
			)
			.first();
		if (!payment) {
			console.warn(
				`revertFailedRefundFromWebhookInternal: no payment for PI ${args.paymentIntentId}`
			);
			return null;
		}
		// Only revert a refund we actually recorded; a refund that failed before
		// charge.refunded ever fired needs no compensation.
		if (payment.status !== "refunded") return null;

		await ctx.db.patch(payment._id, {
			status: "paid",
			refundedAt: undefined,
		});
		await emitStatusChangeEvent(
			ctx,
			payment.orgId,
			"invoice",
			payment.invoiceId,
			"refunded",
			"paid",
			"stripeWebhookActions.charge.refund.updated"
		);
		await ctx.runMutation(
			internal.notifications.createWebhookNotificationInternal,
			{
				orgId: ctx.orgId,
				type: "refund_failed",
				paymentId: payment._id,
				priority: "high",
				message:
					`Refund ${args.refundId} failed` +
					(args.failureReason ? ` (${args.failureReason})` : "") +
					` and the money was not returned to your client. The payment is` +
					` recorded as paid again - retry the refund from your Payments tab.`,
			}
		);
		return null;
	},
});

/**
 * Clear a payment's cached Checkout Session when Stripe expires it
 * (checkout.session.expired), so stale pending fields don't linger.
 */
export const clearExpiredCheckoutSessionInternal = systemMutation({
	args: { sessionId: v.string() },
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const payment = await ctx.db
			.query("payments")
			.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
			.filter((q) =>
				q.eq(q.field("pendingCheckoutSessionId"), args.sessionId)
			)
			.first();
		if (!payment) return null;
		await ctx.db.patch(payment._id, {
			pendingCheckoutSessionId: undefined,
			pendingCheckoutSessionUrl: undefined,
			pendingCheckoutSessionExpiresAt: undefined,
		});
		return null;
	},
});

/**
 * Cancel a payment
 */
export const cancel = userMutation({
	args: { id: v.id("payments") },
	handler: async (ctx, args): Promise<PaymentId> => {
		await ctx.requireLevel("invoices", "delete");
		const payment = await ctx.orgEntity("payments", args.id);
		const parentInvoice = await validateInvoiceAccess(ctx, payment.invoiceId, ctx.orgId);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				parentInvoice.projectId
					? s.projectIds.has(parentInvoice.projectId)
					: s.clientIds.has(parentInvoice.clientId)
			)
		);

		if (payment.status === "paid") {
			throw new Error("Cannot cancel a paid payment");
		}

		await ctx.db.patch(args.id, {
			status: "cancelled",
		});

		return args.id;
	},
});
