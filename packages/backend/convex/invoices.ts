import { calendarDayEpoch } from "./lib/formula";
import { query, internalQuery, QueryCtx, MutationCtx } from "./_generated/server";
import { internalMutation } from "./lib/triggers";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { ActivityHelpers } from "./lib/activities";
import { celebrateInvoicePaid } from "./lib/celebrations";
import {
	validateParentAccess,
	filterUndefined,
	requireUpdates,
} from "./lib/crud";
import { emptyListResult } from "./lib/queries";
import {
	emitStatusChangeEvent,
	emitRecordCreatedEvent,
	emitRecordUpdatedEvent,
} from "./eventBus";
import { computeFieldChanges } from "./lib/changeTracking";
import {
	consumeMeter,
	entitlementsFromIdentity,
	requireMeter,
} from "./lib/entitlements";
import { buildPortalInvoiceUrl } from "./portal/invoiceUrl";
import { maybeEnqueueQboSync } from "./lib/quickbooksEnqueue";
import { calculateInvoiceTotals, syncInvoiceTotals } from "./lib/invoiceTotals";
import { assertInvoiceContentEditable } from "./lib/editLocks";
import { settleOutstandingPaymentsForInvoice } from "./lib/payments";
import { roundCents, sumMoney, dollarsToCents } from "./lib/money";
import {
	optionalUserQuery,
	userMutation,
	userQuery,
	type UserMutationCtx,
} from "./lib/factories";

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
	ctx: UserMutationCtx,
	data: Omit<Doc<"invoices">, "_id" | "_creationTime" | "orgId" | "publicToken">
): Promise<Id<"invoices">> {
	// Validate client access
	await validateClientAccess(ctx, data.clientId, ctx.orgId);

	const invoiceData = {
		...data,
		orgId: ctx.orgId,
	};

	return await ctx.db.insert("invoices", invoiceData);
}

// Define specific types for invoice operations
type InvoiceDocument = Doc<"invoices">;
type InvoiceId = Id<"invoices">;

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all invoices for the current user's organization
 * Totals are calculated dynamically from line items to ensure accuracy
 */
export const list = optionalUserQuery({
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
		const orgId = ctx.orgId;
		if (!orgId) return emptyListResult();
		await ctx.requireLevel("invoices", "view");

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

		// Stored totals, not a recompute: syncInvoiceTotals keeps subtotal/total
		// in step with the line items on every line-item mutation and on every
		// discount/tax edit in `update`. Recomputing here meant collecting the
		// org's entire invoiceLineItems table on each list call — and it did the
		// arithmetic in raw floats, so the list could disagree with `get` by a
		// fraction of a cent.
		const sorted = invoices.sort((a, b) => b._creationTime - a._creationTime);

		return await ctx.applyReadScope("invoices", sorted, (invoice, scope) =>
			invoice.projectId
				? scope.projectIds.has(invoice.projectId)
				: scope.clientIds.has(invoice.clientId)
		);
	},
});

/**
 * Get a specific invoice by ID with calculated totals from line items
 */
// TODO: Candidate for deletion if confirmed unused.
export const get = optionalUserQuery({
	args: { id: v.id("invoices") },
	handler: async (ctx, args): Promise<InvoiceDocument | null> => {
		if (!ctx.orgId) return null;
		await ctx.requireLevel("invoices", "view");
		let invoice: InvoiceDocument | null;
		try {
			invoice = await ctx.orgEntity("invoices", args.id, {
				onMismatch: "skip",
			});
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Entity not found in invoices:")) {
				return null;
			}
			throw error;
		}
		// Cross-org invoice (stale bookmark, shared link, or org switch): degrade
		// to an empty state instead of throwing an uncaught org-mismatch error.
		if (!invoice) return null;
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				invoice.projectId
					? s.projectIds.has(invoice.projectId)
					: s.clientIds.has(invoice.clientId)
			)
		);

		// Calculate totals from line items. "stored" so an invoice that never had
		// line items shows the amount payment validation enforces (payments.ts)
		// and `list` displays, rather than a misleading 0.
		const { subtotal, total } = await calculateInvoiceTotals(ctx, args.id, {
			emptyFallback: "stored",
		});

		return {
			...invoice,
			subtotal,
			total,
		};
	},
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * PUB-34: mark a legacy-invoice-flow Checkout Session paid from the Stripe
 * webhook. The pay-by-link legacy branch stamps the Checkout metadata with an
 * `invoices` publicToken (flow: "invoice"); the payments-table webhook handler
 * would never resolve it, so it silently no-oped and the invoice stayed unpaid
 * forever. This mirrors the payments-path verification: exact amount match,
 * required paymentIntent, org-scope assertion, and a RETRYABLE throw on a
 * genuine lookup miss so Stripe keeps retrying rather than the event being
 * acked against nothing.
 */
export const markInvoicePaidFromWebhookInternal = internalMutation({
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
		if (!publicToken) {
			console.error(
				`markInvoicePaidFromWebhookInternal: missing publicToken on session ${args.sessionId}; acking as terminal.`
			);
			return null;
		}

		const invoice = await getInvoiceByPublicToken(ctx, publicToken);
		if (!invoice) {
			// Retryable: the row may not be visible yet, or metadata is wrong.
			throw new Error(
				`markInvoicePaidFromWebhookInternal: no invoice for session ${args.sessionId}`
			);
		}

		if (invoice.orgId !== args.orgId) {
			// Deterministic for a given session — terminal, not retryable.
			console.error(
				`markInvoicePaidFromWebhookInternal: organization mismatch for session ${args.sessionId}; acking as terminal.`
			);
			return null;
		}

		// Idempotent: /api/pay/confirm may have already marked it.
		if (invoice.status === "paid") {
			return null;
		}

		// Stripe sends amount_total in cents; invoice totals are stored in dollars.
		// A mismatch is deterministic for a given session — terminal, not retryable.
		const expectedCents = dollarsToCents(invoice.total ?? 0);
		if (args.amountTotal !== expectedCents) {
			console.error(
				`markInvoicePaidFromWebhookInternal: amount mismatch on session ${args.sessionId} — ` +
					`expected ${expectedCents} cents, got ${args.amountTotal} cents. ` +
					`Invoice left in status=${invoice.status}; investigate manually.`
			);
			return null;
		}

		if (!args.paymentIntentId) {
			console.error(
				`markInvoicePaidFromWebhookInternal: missing payment_intent for session ${args.sessionId}. ` +
					`Invoice left in status=${invoice.status}; investigate manually.`
			);
			return null;
		}

		await ctx.db.patch(invoice._id, {
			status: "paid",
			stripeSessionId: args.sessionId,
			stripePaymentIntentId: args.paymentIntentId,
			paidAt: Date.now(),
		});

		// Settle installment payment rows like the workspace paid paths do, so a
		// webhook-paid invoice never leaves pending rows behind.
		await settleOutstandingPaymentsForInvoice(ctx, invoice._id);

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

		const paidInvoice = await ctx.db.get(invoice._id);
		if (paidInvoice) {
			await celebrateInvoicePaid(ctx, paidInvoice);
			await maybeEnqueueQboSync(
				ctx,
				paidInvoice.orgId,
				"invoice",
				paidInvoice._id
			);
		}

		return null;
	},
});

/**
 * Create a new invoice
 */
// TODO: Candidate for deletion if confirmed unused.
export const create = userMutation({
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
		await ctx.requireLevel("invoices", "modify");
		// Validate required fields
		if (!args.invoiceNumber.trim()) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Invoice number is required",
			});
		}

		// Validate financial values
		if (args.subtotal < 0) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Subtotal cannot be negative",
			});
		}

		if (args.total < 0) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Total cannot be negative",
			});
		}

		// Validate dates
		if (args.dueDate <= args.issuedDate) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Due date must be after issued date",
			});
		}

		// Minting an invoice directly as "sent" — or "overdue", which the portal
		// treats as visible-and-payable — makes it client-facing without ever
		// passing sendToClient; meter it like a first send.
		let sentStamp: { firstSentAt: number } | undefined;
		if (args.status === "sent" || args.status === "overdue") {
			const { plan } = await entitlementsFromIdentity(ctx);
			// One timestamp so the check and debit share a billing period.
			const now = Date.now();
			await requireMeter(ctx, ctx.orgId, "clientSends", plan, { now });
			await consumeMeter(ctx, ctx.orgId, "clientSends", { now });
			sentStamp = { firstSentAt: now };
		}

		const invoiceId = await createInvoiceWithOrg(ctx, {
			...args,
			...sentStamp,
			createdByUserId: ctx.user._id,
		});

		// Get the created invoice for activity logging
		const invoice = await ctx.db.get(invoiceId);
		if (invoice) {
			const client = await ctx.db.get(invoice.clientId);
			await ActivityHelpers.invoiceCreated(
				ctx,
				invoice as InvoiceDocument,
				client?.companyName || "Unknown Client"
			);
			await emitRecordCreatedEvent(
				ctx,
				invoice.orgId,
				"invoice",
				invoice._id,
				"invoices.create"
			);
			await maybeEnqueueQboSync(ctx, invoice.orgId, "invoice", invoice._id);
		}

		return invoiceId;
	},
});

/** Invoice fields whose change invalidates the stored subtotal/taxAmount/total. */
const INVOICE_TOTAL_FIELDS = [
	"subtotal",
	"discountAmount",
	"taxAmount",
	"total",
	"discountEnabled",
	"discountType",
	"taxEnabled",
	"taxRate",
] as const;

/**
 * Invoice fields that change what the client sees on the document. Patching
 * any of them requires an unlocked invoice and stamps contentUpdatedAt;
 * `subtotal`/`total` are deliberately absent — they are derived, and callers
 * echo them back alongside unrelated writes.
 */
const INVOICE_CONTENT_FIELDS = [
	"discountEnabled",
	"discountAmount",
	"discountType",
	"taxEnabled",
	"taxRate",
	"taxAmount",
	"pdfSettings",
	"dueDate",
] as const;

/**
 * Update an invoice
 */
export const update = userMutation({
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
		discountEnabled: v.optional(v.boolean()),
		discountAmount: v.optional(v.number()),
		discountType: v.optional(
			v.union(v.literal("percentage"), v.literal("fixed"))
		),
		taxEnabled: v.optional(v.boolean()),
		taxRate: v.optional(v.number()),
		taxAmount: v.optional(v.number()),
		total: v.optional(v.number()),
		pdfSettings: v.optional(
			v.object({
				showQuantities: v.boolean(),
				showUnitPrices: v.boolean(),
				showLineItemTotals: v.boolean(),
				showTotals: v.boolean(),
			})
		),
		dueDate: v.optional(v.number()),
		paymentMethod: v.optional(v.string()),
		stripeSessionId: v.optional(v.string()),
		stripePaymentIntentId: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<InvoiceId> => {
		await ctx.requireLevel("invoices", "modify");
		const { id, ...updates } = args;

		// Filter and validate updates
		const filteredUpdates = filterUndefined(updates) as Partial<InvoiceDocument>;
		requireUpdates(filteredUpdates);

		// Get current invoice to check for status changes
		const currentInvoice = await ctx.orgEntity("invoices", id);
		const oldStatus = currentInvoice.status;
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				currentInvoice.projectId
					? s.projectIds.has(currentInvoice.projectId)
					: s.clientIds.has(currentInvoice.clientId)
			)
		);

		// Paired discount fields are validated on the merged result, so patching
		// one half can't bypass a rule or trip one the merged invoice satisfies.
		// Legacy flat-dollar invoices carry no discountType, so the percentage
		// ceiling never fires on them.
		const effective = { ...currentInvoice, ...filteredUpdates };

		if (updates.discountAmount !== undefined && updates.discountAmount < 0) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Discount amount cannot be negative",
			});
		}

		if (
			effective.discountType === "percentage" &&
			effective.discountAmount !== undefined &&
			effective.discountAmount > 100
		) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Percentage discount cannot exceed 100%",
			});
		}

		if (updates.taxRate !== undefined && updates.taxRate < 0) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: "Tax rate cannot be negative",
			});
		}

		// Content edits are frozen once the invoice is paid/cancelled or a payment
		// has settled. Status transitions and Stripe bookkeeping stay editable.
		if (INVOICE_CONTENT_FIELDS.some((field) => field in filteredUpdates)) {
			await assertInvoiceContentEditable(ctx, currentInvoice);
			filteredUpdates.contentUpdatedAt = Date.now();
		}

		// Compute field-level changes before applying the update
		const changes = computeFieldChanges(
			"invoice",
			currentInvoice as unknown as Record<string, unknown>,
			filteredUpdates as Record<string, unknown>
		);

		// Handle status-specific updates
		if (
			filteredUpdates.status &&
			filteredUpdates.status !== currentInvoice.status
		) {
			const now = Date.now();

			if (
				filteredUpdates.status === "sent" ||
				filteredUpdates.status === "overdue"
			) {
				// ANY flip to sent or overdue IS a send (portal-visible, payable) —
				// the source doesn't matter, matching invoices.create's minted-as-
				// overdue metering. Keyed on the immutable firstSentAt so
				// revert-to-draft can never re-arm the debit. (Legacy edge: a
				// pre-firstSentAt invoice that really was sent takes one debit if
				// manually re-flipped to sent — accepted over the mint bypass.)
				if (!currentInvoice.firstSentAt) {
					const { plan } = await entitlementsFromIdentity(ctx);
					await requireMeter(ctx, ctx.orgId, "clientSends", plan, { now });
					await consumeMeter(ctx, ctx.orgId, "clientSends", { now });
					filteredUpdates.firstSentAt = now;
				}
			} else if (filteredUpdates.status === "paid") {
				filteredUpdates.paidAt = now;
			}
		}

		await ctx.db.patch(id, filteredUpdates);

		// Callers send their own subtotal/total next to a discount or tax edit.
		// Recompute from the line items so the stored figures — which list,
		// payment validation and the revenue aggregates all read — stay
		// authoritative. "stored" leaves line-item-less invoices alone rather
		// than zeroing a total the caller just set.
		if (INVOICE_TOTAL_FIELDS.some((field) => field in filteredUpdates)) {
			await syncInvoiceTotals(ctx, id, { emptyFallback: "stored" });
		}

		// Settle outstanding installments when this transition marks the invoice
		// paid, so a payment taken outside the portal reflects there as completed.
		if (filteredUpdates.status === "paid" && oldStatus !== "paid") {
			await settleOutstandingPaymentsForInvoice(ctx, id);
		}

		// Log appropriate activity based on status change
		const updatedInvoice = await ctx.db.get(id);
		if (updatedInvoice) {
			const client = await ctx.db.get(updatedInvoice.clientId);
			const clientName = client?.companyName || "Unknown Client";
			if (
				filteredUpdates.status === "sent" &&
				currentInvoice.status === "draft"
			) {
				await ActivityHelpers.invoiceSent(
					ctx,
					updatedInvoice as InvoiceDocument,
					clientName,
					changes
				);
			} else if (filteredUpdates.status === "paid") {
				await ActivityHelpers.invoicePaid(
					ctx,
					updatedInvoice as InvoiceDocument,
					clientName,
					changes
				);
			}

			if (filteredUpdates.status === "paid" && oldStatus !== "paid") {
				await celebrateInvoicePaid(
					ctx,
					updatedInvoice as InvoiceDocument,
					ctx.user._id
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

			await emitRecordUpdatedEvent(
				ctx,
				updatedInvoice.orgId,
				"invoice",
				updatedInvoice._id,
				Object.keys(filteredUpdates).filter((key) => key !== "updatedAt"),
				"invoices.update"
			);
			await maybeEnqueueQboSync(
				ctx,
				updatedInvoice.orgId,
				"invoice",
				updatedInvoice._id
			);
		}

		return id;
	},
});

/**
 * Send an invoice to the client: flips draft→sent and schedules a branded
 * portal-invite email deep-linking to the invoice in the client portal.
 * The portal is the payment surface; no bearer pay-link is generated.
 */
export const sendToClient = userMutation({
	args: { id: v.id("invoices") },
	returns: v.id("invoices"),
	handler: async (ctx, args): Promise<InvoiceId> => {
		await ctx.requireLevel("invoices", "modify");
		const invoice = await ctx.orgEntity("invoices", args.id);
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
				message: `Cannot send a ${invoice.status} invoice to the client.`,
			});
		}

		// The client must be reachable in the portal: portal access enabled and a
		// primary contact with an email to receive the invite.
		const client = await ctx.db.get(invoice.clientId);
		if (!client || client.orgId !== invoice.orgId) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Invoice client not found.",
			});
		}
		if (!client.portalAccessId) {
			throw new ConvexError({
				code: "CONFLICT",
				message:
					"This client has no portal access yet. Enable it on the client before sending.",
			});
		}
		const primaryContact = await ctx.db
			.query("clientContacts")
			.withIndex("by_primary", (q: any) =>
				q.eq("clientId", client._id).eq("isPrimary", true)
			)
			.first();
		const recipientEmail = primaryContact?.email?.trim();
		if (!recipientEmail) {
			throw new ConvexError({
				code: "CONFLICT",
				message: "Add an email to this client's primary contact before sending.",
			});
		}

		// Sending is the act of sending: flip draft→sent. Already-sent/overdue
		// invoices can be re-sent without a status change.
		// The send meter debits only the FIRST send ever — keyed on the
		// immutable firstSentAt (status can revert to draft; the key cannot).
		if (invoice.status === "draft") {
			const now = Date.now();
			if (!invoice.firstSentAt) {
				const { plan } = await entitlementsFromIdentity(ctx);
				// One timestamp so the check and debit share a billing period.
				await requireMeter(ctx, ctx.orgId, "clientSends", plan, { now });
				await consumeMeter(ctx, ctx.orgId, "clientSends", { now });
			}
			const changes = computeFieldChanges(
				"invoice",
				invoice as unknown as Record<string, unknown>,
				{ status: "sent" }
			);
			await ctx.db.patch(invoice._id, {
				status: "sent",
				...(invoice.firstSentAt ? {} : { firstSentAt: now }),
			});
			const updated = await ctx.db.get(invoice._id);
			if (updated) {
				await ActivityHelpers.invoiceSent(
					ctx,
					updated as InvoiceDocument,
					client.companyName || "Unknown Client",
					changes
				);
				await emitStatusChangeEvent(
					ctx,
					updated.orgId,
					"invoice",
					updated._id,
					"draft",
					"sent",
					"invoices.sendToClient"
				);
			}
		}

		// Guarantee portal payability: the portal's native Elements flow pays against
		// payment rows, so an invoice with none is view-only. Quote-derived invoices
		// already carry a "Full Payment" row; manual invoices (invoices.create) do not.
		// Backfill one at send time so every sent invoice is payable in the portal.
		const existingPayments = await ctx.db
			.query("payments")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
			.collect();
		if (existingPayments.length === 0 && invoice.total > 0) {
			await ctx.db.insert("payments", {
				orgId: invoice.orgId,
				invoiceId: invoice._id,
				paymentAmount: invoice.total,
				dueDate: invoice.dueDate,
				description: "Full Payment",
				sortOrder: 0,
				status: "pending",
			});
		}

		await maybeEnqueueQboSync(ctx, invoice.orgId, "invoice", invoice._id);

		// Sent invoices should carry a CURRENT PDF like web-sent ones do (portal
		// download, consistent records). Self-heal with a server-side render of
		// the same template when none exists or the newest one predates a
		// content edit — mirror of quotes.sendToClient.
		const newestPdf = await ctx.db
			.query("documents")
			.withIndex("by_document_version", (q) =>
				q.eq("documentType", "invoice").eq("documentId", invoice._id)
			)
			.order("desc")
			.first();
		if (
			!newestPdf ||
			newestPdf.generatedAt < (invoice.contentUpdatedAt ?? 0)
		) {
			await ctx.scheduler.runAfter(0, internal.pdfActions.generateInvoicePdf, {
				invoiceId: invoice._id,
				orgId: invoice.orgId,
			});
		}

		// Fire-and-forget the branded portal-invite email.
		await ctx.scheduler.runAfter(
			0,
			internal.portal.invoiceEmail.sendInvoiceReadyEmail,
			{ invoiceId: invoice._id }
		);

		return invoice._id;
	},
});

/**
 * The client-facing portal URL for this invoice — the "share pay link"
 * surface on mobile. Backend-served (reusing the email's URL builder) so the
 * portal origin has exactly one source of truth. Null when the client has no
 * portal access yet; callers gate the share affordance on that.
 */
export const getPortalLink = userQuery({
	args: { id: v.id("invoices") },
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args): Promise<string | null> => {
		await ctx.requireLevel("invoices", "view");
		const invoice = await ctx.orgEntity("invoices", args.id);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				invoice.projectId
					? s.projectIds.has(invoice.projectId)
					: s.clientIds.has(invoice.clientId)
			)
		);
		const client = await ctx.db.get(invoice.clientId);
		if (!client || client.orgId !== invoice.orgId || !client.portalAccessId) {
			return null;
		}
		// A deployment without the portal origin configured has no link to give;
		// null hides the share affordance instead of throwing the detail screen's
		// query (buildPortalInvoiceUrl raises on a missing issuer).
		if (!process.env.PORTAL_JWT_ISSUER) {
			return null;
		}
		return buildPortalInvoiceUrl({
			portalAccessId: client.portalAccessId,
			invoiceId: invoice._id,
		});
	},
});

/**
 * Mark an invoice as paid
 */
export const markPaid = userMutation({
	args: {
		id: v.id("invoices"),
		paymentMethod: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<InvoiceId> => {
		await ctx.requireLevel("invoices", "modify");
		const invoice = await ctx.orgEntity("invoices", args.id);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				invoice.projectId
					? s.projectIds.has(invoice.projectId)
					: s.clientIds.has(invoice.clientId)
			)
		);

		if (invoice.status === "paid") {
			throw new ConvexError({
				code: "CONFLICT",
				message: "Invoice is already paid",
			});
		}

		if (invoice.status === "cancelled") {
			throw new ConvexError({
				code: "CONFLICT",
				message: "Cannot mark cancelled invoice as paid",
			});
		}

		await ctx.db.patch(args.id, {
			status: "paid",
			paidAt: Date.now(),
		});
		// Settle any outstanding installments so the portal shows this invoice as
		// paid and never offers a Pay button for a payment taken outside it.
		await settleOutstandingPaymentsForInvoice(ctx, args.id);

		// Log activity
		const updatedInvoice = await ctx.db.get(args.id);
		if (updatedInvoice) {
			const client = await ctx.db.get(updatedInvoice.clientId);
			await ActivityHelpers.invoicePaid(
				ctx,
				updatedInvoice as InvoiceDocument,
				client?.companyName || "Unknown Client"
			);
			await celebrateInvoicePaid(
					ctx,
					updatedInvoice as InvoiceDocument,
					ctx.user._id
				);
			await maybeEnqueueQboSync(
				ctx,
				updatedInvoice.orgId,
				"invoice",
				updatedInvoice._id
			);
		}

		return args.id;
	},
});

/**
 * Delete an invoice
 */
// TODO: Candidate for deletion if confirmed unused.
export const remove = userMutation({
	args: { id: v.id("invoices") },
	handler: async (ctx, args): Promise<InvoiceId> => {
		await ctx.requireLevel("invoices", "delete");
		// Validate access + scope before any deletes (checks-before-writes).
		const invoice = await ctx.orgEntity("invoices", args.id);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				invoice.projectId
					? s.projectIds.has(invoice.projectId)
					: s.clientIds.has(invoice.clientId)
			)
		);

		// Delete line items first
		const lineItems = await ctx.db
			.query("invoiceLineItems")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.id))
			.collect();

		for (const lineItem of lineItems) {
			await ctx.db.delete(lineItem._id);
		}

		await ctx.db.delete(args.id);

		return args.id;
	},
});

/**
 * Get overdue or soon-due invoices for the Needs Attention widget.
 * Returns invoices enriched with the earliest unpaid payment due date
 * so the frontend can display accurate urgency labels.
 */
export const getOverdue = optionalUserQuery({
	args: {},
	handler: async (ctx) => {
		const orgId = ctx.orgId;
		if (!orgId) return [];
		await ctx.requireLevel("invoices", "view");

		const now = Date.now();
		const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;

		// Get invoices that are sent or overdue
		const invoices = await ctx.db
			.query("invoices")
			.withIndex("by_status", (q) => q.eq("orgId", orgId).eq("status", "sent"))
			.collect();

		const overdueInvoices = await ctx.db
			.query("invoices")
			.withIndex("by_status", (q) => q.eq("orgId", orgId).eq("status", "overdue"))
			.collect();

		const allInvoices = [...invoices, ...overdueInvoices];

		// Fetch all payments for this org in a single query to avoid N+1
		const allPayments = await ctx.db
			.query("payments")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		// Group payments by invoiceId
		const paymentsByInvoice = new Map<string, typeof allPayments>();
		for (const p of allPayments) {
			const list = paymentsByInvoice.get(p.invoiceId) ?? [];
			list.push(p);
			paymentsByInvoice.set(p.invoiceId, list);
		}

		// Filter to invoices that need attention and enrich with earliest payment due date
		const results: (InvoiceDocument & { earliestPaymentDueDate?: number })[] = [];
		for (const invoice of allInvoices) {
			const payments = paymentsByInvoice.get(invoice._id) ?? [];
			if (payments.length === 0) {
				// No payment records — include if invoice itself is past due
				if (invoice.dueDate <= now) {
					results.push(invoice);
				}
				continue;
			}

			const unpaidPayments = payments.filter(
				(p) =>
					p.status !== "paid" &&
					p.status !== "cancelled" &&
					p.dueDate <= sevenDaysFromNow
			);

			if (unpaidPayments.length > 0) {
				const earliestDueDate = Math.min(...unpaidPayments.map((p) => p.dueDate));
				results.push({ ...invoice, earliestPaymentDueDate: earliestDueDate });
			}
		}

		return await ctx.applyReadScope("invoices", results, (invoice, scope) =>
			invoice.projectId
				? scope.projectIds.has(invoice.projectId)
				: scope.clientIds.has(invoice.clientId)
		);
	},
});

/**
 * Recalculate invoice totals from line items
 * Useful for fixing invoices with incorrect stored totals
 */
export const recalculateTotals = userMutation({
	args: { id: v.id("invoices") },
	handler: async (ctx, args): Promise<void> => {
		await ctx.requireLevel("invoices", "modify");
		// Validate access
		const invoice = await ctx.orgEntity("invoices", args.id);
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				invoice.projectId
					? s.projectIds.has(invoice.projectId)
					: s.clientIds.has(invoice.clientId)
			)
		);

		// Recompute + persist totals and keep aggregates in step
		await syncInvoiceTotals(ctx, args.id);
	},
});

/**
 * Generate next invoice number for organization
 */
export const generateInvoiceNumber = userMutation({
	args: {},
	handler: async (ctx): Promise<string> => {
		await ctx.requireLevel("invoices", "view");
		// Get all invoices for this organization
		const orgInvoices = await ctx.db
			.query("invoices")
			.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
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
/**
 * The invoice created from a quote, if any — drives mobile's "View invoice"
 * CTA and hasInvoice capability without the drawer's heavy getPreview.
 */
export const getByQuote = userQuery({
	args: { quoteId: v.id("quotes") },
	returns: v.union(v.object({ _id: v.id("invoices") }), v.null()),
	handler: async (ctx, args): Promise<{ _id: InvoiceId } | null> => {
		await ctx.requireLevel("invoices", "view");
		await ctx.orgEntity("quotes", args.quoteId);
		const invoice = await ctx.db
			.query("invoices")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
			.first();
		if (!invoice || invoice.orgId !== ctx.orgId) return null;
		// Record scope decides too: a member scoped to their own projects must not
		// learn that an invoice exists on a quote they can't open. Filtering (not
		// throwing) keeps the "View invoice" CTA simply absent for them.
		const visible = await ctx.applyReadScope("invoices", [invoice], (row, s) =>
			row.projectId ? s.projectIds.has(row.projectId) : s.clientIds.has(row.clientId)
		);
		return visible.length > 0 ? { _id: invoice._id } : null;
	},
});

export const createFromQuote = userMutation({
	args: {
		quoteId: v.id("quotes"),
		issuedDate: v.optional(v.number()),
		dueDate: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<InvoiceId> => {
		await ctx.requireLevel("invoices", "modify");
		// Get and validate quote
		const quote = await ctx.orgEntity("quotes", args.quoteId);

		if (quote.status !== "approved") {
			throw new ConvexError({
				code: "CONFLICT",
				message: "Only approved quotes can be converted to invoices",
			});
		}

		// One invoice per quote — guard against duplicates from double-clicks or
		// stale UI on any surface (drawer/header both treat conversion as terminal).
		const existingInvoice = await ctx.db
			.query("invoices")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
			.first();
		if (existingInvoice) {
			throw new ConvexError({
				code: "CONFLICT",
				message: "An invoice has already been created from this quote",
			});
		}

		// Generate invoice number automatically
		const orgInvoices = await ctx.db
			.query("invoices")
			.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
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

		// Default dates are calendar dates (UTC-midnight epochs), not instants —
		// today / today+30d as seen from the org timezone.
		const todayUtcMidnight = calendarDayEpoch(
			Date.now(),
			(await ctx.db.get(ctx.orgId))?.timezone ?? "UTC"
		);
		const issuedDate = args.issuedDate || todayUtcMidnight;
		const dueDate = args.dueDate || todayUtcMidnight + 30 * 24 * 60 * 60 * 1000;

		const quoteLineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
			.collect();

		// Quote-style pricing (percentage/fixed discount + tax rate) carries over
		// verbatim when the quote uses it — the invoice then resolves to "quote"
		// pricing mode and recomputes with the same math, so discountAmount stays
		// the RAW input (a percent when discountType is "percentage").
		const quoteStylePricing =
			quote.discountEnabled !== undefined ||
			quote.discountType !== undefined ||
			quote.taxEnabled !== undefined ||
			quote.taxRate !== undefined;

		// Legacy path: invoices store discountAmount as flat dollars
		// (calculateInvoiceTotals subtracts it flat), so convert here or a 10%
		// discount bills the client $10 off.
		//
		// Gate on discountEnabled: turning a discount off sends discountAmount:
		// undefined, which `filterUndefined` drops from the patch, so the old amount
		// stays on the doc. Quote totals ignore it; billing it here would under-charge.
		const lineItemSubtotal = sumMoney(
			quoteLineItems.map((item) => item.amount)
		);
		const legacyDiscountAmount =
			quote.discountEnabled && quote.discountAmount
				? quote.discountType === "percentage"
					? // Round to cents — payments must sum exactly to the invoice total.
						roundCents(lineItemSubtotal * (quote.discountAmount / 100))
					: quote.discountAmount
				: undefined;

		// Create invoice from quote
		const invoiceId = await ctx.db.insert("invoices", {
			orgId: ctx.orgId,
			createdByUserId: ctx.user._id,
			clientId: quote.clientId,
			projectId: quote.projectId,
			quoteId: args.quoteId,
			invoiceNumber,
			status: "draft",
			subtotal: quote.subtotal,
			discountAmount: quoteStylePricing
				? quote.discountAmount
				: legacyDiscountAmount,
			taxAmount: quote.taxAmount,
			total: quote.total,
			...(quoteStylePricing
				? {
						discountEnabled: quote.discountEnabled,
						discountType: quote.discountType,
						taxEnabled: quote.taxEnabled,
						taxRate: quote.taxRate,
					}
				: {}),
			pdfSettings: quote.pdfSettings,
			issuedDate,
			dueDate,
		});

		// Copy quote line items to invoice line items
		for (const quoteLineItem of quoteLineItems) {
			await ctx.db.insert("invoiceLineItems", {
				invoiceId,
				orgId: ctx.orgId,
				description: quoteLineItem.description,
				quantity: quoteLineItem.quantity,
				unit: quoteLineItem.unit,
				unitPrice: quoteLineItem.rate,
				cost: quoteLineItem.cost,
				total: quoteLineItem.amount,
				sortOrder: quoteLineItem.sortOrder,
				skuId: quoteLineItem.skuId,
			});
		}

		// Calculate accurate totals from the copied line items
		const { subtotal, total } = await calculateInvoiceTotals(ctx, invoiceId);

		// Update invoice with calculated totals (overwrite the copied quote values)
		await ctx.db.patch(invoiceId, {
			subtotal,
			total,
		});

		// Log activity with updated totals
		const invoice = await ctx.db.get(invoiceId);
		if (invoice) {
			const client = await ctx.db.get(invoice.clientId);
			await ActivityHelpers.invoiceCreated(
				ctx,
				invoice as InvoiceDocument,
				client?.companyName || "Unknown Client"
			);
			await emitRecordCreatedEvent(
				ctx,
				invoice.orgId,
				"invoice",
				invoice._id,
				"invoices.createFromQuote"
			);
			await maybeEnqueueQboSync(ctx, invoice.orgId, "invoice", invoice._id);
		}

		// Create default payment for the full invoice amount
		await ctx.db.insert("payments", {
			orgId: ctx.orgId,
			invoiceId,
			paymentAmount: total,
			dueDate,
			description: "Full Payment",
			sortOrder: 0,
			status: "pending",
		});

		return invoiceId;
	},
});

/**
 * Get an invoice with all its payments and aggregated payment status
 */
export const getWithPayments = optionalUserQuery({
	args: { id: v.id("invoices") },
	handler: async (ctx, args) => {
		if (!ctx.orgId) return null;
		await ctx.requireLevel("invoices", "view");
		let invoice: InvoiceDocument | null;
		try {
			invoice = await ctx.orgEntity("invoices", args.id, {
				onMismatch: "skip",
			});
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Entity not found in invoices:")) {
				return null;
			}
			throw error;
		}
		// Cross-org invoice (stale bookmark, shared link, or org switch): degrade
		// to an empty state instead of throwing an uncaught org-mismatch error.
		if (!invoice) return null;
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				invoice.projectId
					? s.projectIds.has(invoice.projectId)
					: s.clientIds.has(invoice.clientId)
			)
		);

		// Calculate totals from line items ("stored" fallback — see invoices.get).
		const { subtotal, total } = await calculateInvoiceTotals(ctx, args.id, {
			emptyFallback: "stored",
		});

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

// Self-contained payload for the list-page detail drawer: the invoice with an
// ACCURATE total (recomputed from line items — stored total can be stale), its
// resolved client (+ primary address), project, source quote, payment schedule
// (+ summary), and the invoice's activity from the last 7 days.
interface InvoicePreview {
	invoice: {
		_id: Id<"invoices">;
		invoiceNumber: string;
		status: InvoiceDocument["status"];
		total: number;
		issuedDate: number;
		dueDate: number;
		paidAt: number | null;
		createdAt: number;
	};
	client: {
		_id: Id<"clients">;
		companyName: string;
		address: string | null;
	} | null;
	project: {
		_id: Id<"projects">;
		title: string;
	} | null;
	sourceQuote: {
		_id: Id<"quotes">;
		quoteNumber: string | null;
	} | null;
	paymentSummary: {
		totalPayments: number;
		paidCount: number;
		pendingCount: number;
		paidAmount: number;
		remainingAmount: number;
		percentPaid: number;
	};
	payments: Array<{
		_id: Id<"payments">;
		paymentAmount: number;
		status: Doc<"payments">["status"];
		dueDate: number;
		paidAt: number | null;
		description: string | null;
	}>;
	activities: Array<{
		_id: Id<"activities">;
		description: string;
		activityType: string;
		timestamp: number;
		userName: string;
	}>;
}

/**
 * Get a compact, self-contained preview of an invoice for the detail drawer.
 * Recomputes the total from line items (stored totals can be stale), resolves
 * the client (+ primary address), project, and source quote, rolls up the
 * payment schedule with a summary, and returns the last 7 days of activity.
 */
export const getPreview = optionalUserQuery({
	args: { id: v.id("invoices") },
	handler: async (ctx, args: any): Promise<InvoicePreview | null> => {
		const orgId = ctx.orgId;
		if (!orgId) return null;
		await ctx.requireLevel("invoices", "view");

		let invoice: InvoiceDocument | null;
		try {
			invoice = await ctx.orgEntity("invoices", args.id, {
				onMismatch: "skip",
			});
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.startsWith("Entity not found in invoices:")
			) {
				return null;
			}
			throw error;
		}
		// Cross-org invoice: degrade to an empty state instead of throwing.
		if (!invoice) return null;
		await ctx.requireRecordScope("invoices", () =>
			ctx.actorScope().then((s) =>
				invoice.projectId
					? s.projectIds.has(invoice.projectId)
					: s.clientIds.has(invoice.clientId)
			)
		);

		// Recompute total from line items (source of truth; stored total can be
		// stale). Reuse the shared helper so discount/tax logic can't diverge.
		// "stored" fallback — see invoices.get.
		const { total } = await calculateInvoiceTotals(ctx, args.id, {
			emptyFallback: "stored",
		});

		// Resolve client + its primary address. Guard the raw get() against a
		// cross-org reference — projectId/quoteId aren't org-checked on write, so
		// a bad ref must not leak another org's data through this preview.
		const clientDoc = await ctx.db.get(invoice.clientId);
		const ownedClient =
			clientDoc && clientDoc.orgId === orgId ? clientDoc : null;
		let clientAddress: string | null = null;
		if (ownedClient) {
			const primaryProperty = await ctx.db
				.query("clientProperties")
				.withIndex("by_primary", (q: any) =>
					q.eq("clientId", ownedClient._id).eq("isPrimary", true)
				)
				.first();
			if (primaryProperty) {
				clientAddress =
					[
						primaryProperty.streetAddress,
						primaryProperty.city,
						[primaryProperty.state, primaryProperty.zipCode]
							.filter(Boolean)
							.join(" "),
					]
						.filter(Boolean)
						.join(", ") || null;
			}
		}
		const client = ownedClient
			? {
					_id: ownedClient._id,
					companyName: ownedClient.companyName,
					address: clientAddress,
				}
			: null;

		// Project (optional, org-guarded)
		let project: InvoicePreview["project"] = null;
		if (invoice.projectId) {
			const projectDoc = await ctx.db.get(invoice.projectId);
			if (projectDoc && projectDoc.orgId === orgId) {
				project = { _id: projectDoc._id, title: projectDoc.title };
			}
		}

		// Source quote (optional, org-guarded; the quote this invoice came from)
		let sourceQuote: InvoicePreview["sourceQuote"] = null;
		if (invoice.quoteId) {
			const quoteDoc = await ctx.db.get(invoice.quoteId);
			if (quoteDoc && quoteDoc.orgId === orgId) {
				sourceQuote = {
					_id: quoteDoc._id,
					quoteNumber: quoteDoc.quoteNumber ?? null,
				};
			}
		}

		// Payment schedule for this invoice, ordered by sortOrder
		const paymentRows = await ctx.db
			.query("payments")
			.withIndex("by_invoice", (q: any) => q.eq("invoiceId", args.id))
			.collect();
		const sortedPayments = paymentRows.sort(
			(a: Doc<"payments">, b: Doc<"payments">) => a.sortOrder - b.sortOrder
		);

		// Payment summary (mirrors getWithPayments)
		const paidPayments = sortedPayments.filter(
			(p: Doc<"payments">) => p.status === "paid"
		);
		const pendingPayments = sortedPayments.filter(
			(p: Doc<"payments">) =>
				p.status === "pending" ||
				p.status === "sent" ||
				p.status === "overdue"
		);
		const paidAmount = paidPayments.reduce(
			(sum: number, p: Doc<"payments">) => sum + p.paymentAmount,
			0
		);
		const remainingAmount = total - paidAmount;

		const payments: InvoicePreview["payments"] = sortedPayments.map(
			(p: Doc<"payments">) => ({
				_id: p._id,
				paymentAmount: p.paymentAmount,
				status: p.status,
				dueDate: p.dueDate,
				paidAt: p.paidAt ?? null,
				description: p.description ?? null,
			})
		);

		// Recent activity for this invoice (last 7 days). Activities are keyed
		// generically by entityType/entityId, so query by_entity then filter.
		const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const activityRows = await ctx.db
			.query("activities")
			.withIndex("by_entity", (q: any) =>
				q.eq("entityType", "invoice").eq("entityId", args.id as string)
			)
			.filter((q: any) =>
				q.and(
					q.eq(q.field("orgId"), orgId),
					q.eq(q.field("isVisible"), true),
					q.gte(q.field("timestamp"), cutoff)
				)
			)
			.order("desc")
			.take(20);

		const userNameCache = new Map<string, string>();
		const activities: InvoicePreview["activities"] = [];
		for (const activity of activityRows) {
			let userName = userNameCache.get(activity.userId);
			if (userName === undefined) {
				const actor = await ctx.db.get(activity.userId);
				userName = actor ? actor.name || actor.email : "Someone";
				userNameCache.set(activity.userId, userName);
			}
			activities.push({
				_id: activity._id,
				description: activity.description,
				activityType: activity.activityType,
				timestamp: activity.timestamp,
				userName,
			});
		}

		return {
			invoice: {
				_id: invoice._id,
				invoiceNumber: invoice.invoiceNumber,
				status: invoice.status,
				total,
				issuedDate: invoice.issuedDate,
				dueDate: invoice.dueDate,
				paidAt: invoice.paidAt ?? null,
				createdAt: invoice._creationTime,
			},
			client,
			project,
			sourceQuote,
			paymentSummary: {
				totalPayments: sortedPayments.length,
				paidCount: paidPayments.length,
				pendingCount: pendingPayments.length,
				paidAmount,
				remainingAmount,
				percentPaid: total > 0 ? Math.round((paidAmount / total) * 100) : 0,
			},
			payments,
			activities,
		};
	},
});
