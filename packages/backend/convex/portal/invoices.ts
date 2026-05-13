// Portal-facing invoice queries. List/get expose explicit Public DTOs with
// field allowlists — Stripe-side secret fields (pendingPaymentIntentClientSecret,
// pendingPaymentIntentId, stripePaymentIntentId, checkoutAttemptCounter,
// paymentLinkUrl, publicToken) MUST NOT enter the browser.
//
// Plan 03 adds the V8-runtime helper queries (_getPortalSessionForAction /
// _rateLimitPreflight / _getPaymentTargetInternal) and the Stripe-importing
// action createPaymentIntent in portal/invoicesActions.ts.
import { query } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { getPortalSessionOrThrow } from "./helpers";

// ---------------------------------------------------------------------------
// Public DTO types (browser-safe)
// ---------------------------------------------------------------------------

export type PortalPaymentPublic = {
	_id: Id<"payments">;
	paymentAmount: number;
	dueDate: number;
	description: string | null;
	sortOrder: number;
	status: "pending" | "sent" | "paid" | "refunded" | "overdue" | "cancelled";
	paidAt: number | null;
	// receipt-metadata cached by webhook on success; null until paid
	cardLast4: string | null;
	cardBrand: string | null;
	receiptUrl: string | null;
};

export type PortalPaymentSummary = {
	totalPaid: number;
	totalRemaining: number;
	displayStatus: "awaiting" | "partial" | "paid" | "overdue";
	isLegacy: boolean;
	installmentCount: number;
};

export type PortalInvoiceListItemPublic = {
	_id: Id<"invoices">;
	invoiceNumber: string;
	status: "sent" | "paid" | "overdue";
	issuedDate: number;
	dueDate: number;
	total: number;
	clientName: string;
	paymentSummary: PortalPaymentSummary;
};

export type PortalInvoicePublic = {
	_id: Id<"invoices">;
	invoiceNumber: string;
	status: "sent" | "paid" | "overdue";
	issuedDate: number;
	dueDate: number;
	subtotal: number;
	taxAmount: number | null;
	discountAmount: number | null;
	total: number;
	paidAt: number | null;
};

export type PortalInvoiceLineItemPublic = {
	_id: Id<"invoiceLineItems">;
	description: string;
	quantity: number;
	unitPrice: number;
	total: number;
	sortOrder: number;
};

export type PortalInvoiceGetResponse = {
	invoice: PortalInvoicePublic;
	lineItems: PortalInvoiceLineItemPublic[];
	payments: PortalPaymentPublic[];
	paymentSummary: PortalPaymentSummary;
	activePaymentPublic: PortalPaymentPublic | null;
	isLegacy: boolean;
	legacyPayUrl: string | null;
	businessName: string;
	businessLogoUrl: string | null;
	stripeChargesEnabled: boolean;
	clientName: string;
	clientEmail: string;
};

// ---------------------------------------------------------------------------
// Validator shapes (must mirror DTOs 1:1)
// ---------------------------------------------------------------------------

const paymentStatusValidator = v.union(
	v.literal("pending"),
	v.literal("sent"),
	v.literal("paid"),
	v.literal("refunded"),
	v.literal("overdue"),
	v.literal("cancelled"),
);

const portalPaymentPublicValidator = v.object({
	_id: v.id("payments"),
	paymentAmount: v.number(),
	dueDate: v.number(),
	description: v.union(v.string(), v.null()),
	sortOrder: v.number(),
	status: paymentStatusValidator,
	paidAt: v.union(v.number(), v.null()),
	cardLast4: v.union(v.string(), v.null()),
	cardBrand: v.union(v.string(), v.null()),
	receiptUrl: v.union(v.string(), v.null()),
});

const portalInvoiceStatusValidator = v.union(
	v.literal("sent"),
	v.literal("paid"),
	v.literal("overdue"),
);

const portalPaymentSummaryValidator = v.object({
	totalPaid: v.number(),
	totalRemaining: v.number(),
	displayStatus: v.union(
		v.literal("awaiting"),
		v.literal("partial"),
		v.literal("paid"),
		v.literal("overdue"),
	),
	isLegacy: v.boolean(),
	installmentCount: v.number(),
});

const portalInvoiceListItemValidator = v.object({
	_id: v.id("invoices"),
	invoiceNumber: v.string(),
	status: portalInvoiceStatusValidator,
	issuedDate: v.number(),
	dueDate: v.number(),
	total: v.number(),
	clientName: v.string(),
	paymentSummary: portalPaymentSummaryValidator,
});

const portalInvoicePublicValidator = v.object({
	_id: v.id("invoices"),
	invoiceNumber: v.string(),
	status: portalInvoiceStatusValidator,
	issuedDate: v.number(),
	dueDate: v.number(),
	subtotal: v.number(),
	taxAmount: v.union(v.number(), v.null()),
	discountAmount: v.union(v.number(), v.null()),
	total: v.number(),
	paidAt: v.union(v.number(), v.null()),
});

const portalInvoiceLineItemValidator = v.object({
	_id: v.id("invoiceLineItems"),
	description: v.string(),
	quantity: v.number(),
	unitPrice: v.number(),
	total: v.number(),
	sortOrder: v.number(),
});

const portalInvoiceGetValidator = v.object({
	invoice: portalInvoicePublicValidator,
	lineItems: v.array(portalInvoiceLineItemValidator),
	payments: v.array(portalPaymentPublicValidator),
	paymentSummary: portalPaymentSummaryValidator,
	activePaymentPublic: v.union(portalPaymentPublicValidator, v.null()),
	isLegacy: v.boolean(),
	// Field is always present; null on non-legacy invoices, "/pay/{publicToken}"
	// on legacy. v.union(string,null) — NOT v.optional — so undefined/missing
	// is impossible by validator.
	legacyPayUrl: v.union(v.string(), v.null()),
	businessName: v.string(),
	businessLogoUrl: v.union(v.string(), v.null()),
	stripeChargesEnabled: v.boolean(),
	clientName: v.string(),
	clientEmail: v.string(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPortalPaymentPublic(row: Doc<"payments">): PortalPaymentPublic {
	const isPaid = row.status === "paid";
	return {
		_id: row._id,
		paymentAmount: row.paymentAmount,
		dueDate: row.dueDate,
		description: row.description ?? null,
		sortOrder: row.sortOrder,
		status: row.status,
		paidAt: row.paidAt ?? null,
		cardLast4: isPaid ? row.cardLast4 ?? null : null,
		cardBrand: isPaid ? row.cardBrand ?? null : null,
		receiptUrl: isPaid ? row.stripeReceiptUrl ?? null : null,
	};
}

type DerivedSummary = {
	totalPaid: number;
	totalRemaining: number;
	displayStatus: "awaiting" | "partial" | "paid" | "overdue";
	isLegacy: boolean;
	installmentCount: number;
};

function deriveSummary(
	invoice: Doc<"invoices">,
	payments: Doc<"payments">[],
): DerivedSummary {
	const isLegacy = payments.length === 0;
	let totalPaid: number;
	if (isLegacy) {
		totalPaid = invoice.status === "paid" ? invoice.total : 0;
	} else {
		totalPaid = payments
			.filter((p) => p.status === "paid")
			.reduce((sum, p) => sum + p.paymentAmount, 0);
	}
	const totalRemaining = Math.max(0, invoice.total - totalPaid);
	const now = Date.now();
	let displayStatus: DerivedSummary["displayStatus"];
	if (
		now > invoice.dueDate &&
		totalRemaining > 0 &&
		invoice.status !== "cancelled"
	) {
		displayStatus = "overdue";
	} else if (totalRemaining === 0) {
		displayStatus = "paid";
	} else if (totalPaid > 0) {
		displayStatus = "partial";
	} else {
		displayStatus = "awaiting";
	}
	return {
		totalPaid,
		totalRemaining,
		displayStatus,
		isLegacy,
		installmentCount: payments.length,
	};
}

// invoices.status is union(draft|sent|paid|overdue|cancelled). Portal only
// exposes sent/paid/overdue — caller filters drafts/cancelled before reaching
// the projector.
function projectInvoiceStatus(
	status: Doc<"invoices">["status"],
): "sent" | "paid" | "overdue" {
	if (status === "paid") return "paid";
	if (status === "overdue") return "overdue";
	return "sent";
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

export const list = query({
	args: {},
	returns: v.array(portalInvoiceListItemValidator),
	handler: async (ctx): Promise<PortalInvoiceListItemPublic[]> => {
		const session = await getPortalSessionOrThrow(ctx);
		const contact = await ctx.db.get(session.clientContactId);
		if (!contact || contact.orgId !== session.orgId) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}

		const invoices = await ctx.db
			.query("invoices")
			.withIndex("by_client", (q) => q.eq("clientId", contact.clientId))
			.collect();

		const visible = invoices
			.filter(
				(inv) =>
					inv.orgId === session.orgId &&
					inv.status !== "draft" &&
					inv.status !== "cancelled",
			)
			.sort((a, b) => b.issuedDate - a.issuedDate);

		// Client lookup keyed on invoice.clientId mirrors portal/quotes shape.
		const clientCache = new Map<string, string>();
		async function getClientName(
			clientId: Id<"clients">,
		): Promise<string> {
			const cached = clientCache.get(clientId);
			if (cached !== undefined) return cached;
			const client = await ctx.db.get(clientId);
			const name = client?.companyName ?? "Client";
			clientCache.set(clientId, name);
			return name;
		}

		return await Promise.all(
			visible.map(async (inv) => {
				const payments = await ctx.db
					.query("payments")
					.withIndex("by_invoice_sort", (q) => q.eq("invoiceId", inv._id))
					.collect();
				const summary = deriveSummary(inv, payments);
				const clientName = await getClientName(inv.clientId);
				return {
					_id: inv._id,
					invoiceNumber: inv.invoiceNumber,
					status: projectInvoiceStatus(inv.status),
					issuedDate: inv.issuedDate,
					dueDate: inv.dueDate,
					total: inv.total,
					clientName,
					paymentSummary: summary,
				};
			}),
		);
	},
});

export const get = query({
	args: { invoiceId: v.id("invoices") },
	returns: portalInvoiceGetValidator,
	handler: async (ctx, { invoiceId }): Promise<PortalInvoiceGetResponse> => {
		const session = await getPortalSessionOrThrow(ctx);

		const invoice = await ctx.db.get(invoiceId);
		if (!invoice) throw new ConvexError({ code: "NOT_FOUND" });

		const contact = await ctx.db.get(session.clientContactId);
		if (!contact || contact.orgId !== session.orgId) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		if (
			contact.clientId !== invoice.clientId ||
			invoice.orgId !== session.orgId
		) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		// Mirrors Phase 14 draft-quote masquerade — never leak existence.
		if (invoice.status === "draft" || invoice.status === "cancelled") {
			throw new ConvexError({ code: "NOT_FOUND" });
		}

		const lineItems = (
			await ctx.db
				.query("invoiceLineItems")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
				.collect()
		).sort((a, b) => a.sortOrder - b.sortOrder);

		const paymentRows = await ctx.db
			.query("payments")
			.withIndex("by_invoice_sort", (q) => q.eq("invoiceId", invoiceId))
			.collect();
		const sortedPayments = paymentRows
			.slice()
			.sort((a, b) => a.sortOrder - b.sortOrder);

		const summary = deriveSummary(invoice, sortedPayments);
		const isLegacy = sortedPayments.length === 0;

		const paymentsPublic: PortalPaymentPublic[] = isLegacy
			? []
			: sortedPayments.map(toPortalPaymentPublic);

		const firstUnpaid = isLegacy
			? null
			: sortedPayments.find(
					(p) =>
						p.status !== "paid" &&
						p.status !== "cancelled" &&
						p.status !== "refunded",
				) ?? null;

		const activePaymentPublic: PortalPaymentPublic | null =
			isLegacy || !firstUnpaid ? null : toPortalPaymentPublic(firstUnpaid);

		// legacyPayUrl: server-side construction; the bare publicToken is never
		// returned as its own field on the DTO.
		const legacyPayUrl: string | null = isLegacy
			? `/pay/${invoice.publicToken}`
			: null;

		const org = await ctx.db.get(invoice.orgId);
		const businessName = org?.name ?? "";
		const businessLogoUrl = org?.logoUrl ?? null;
		const stripeChargesEnabled = org?.stripeChargesEnabled === true;

		const client = await ctx.db.get(invoice.clientId);
		const clientName = client?.companyName ?? "Client";
		const clientEmail = contact.email ?? "";

		const invoicePublic: PortalInvoicePublic = {
			_id: invoice._id,
			invoiceNumber: invoice.invoiceNumber,
			status: projectInvoiceStatus(invoice.status),
			issuedDate: invoice.issuedDate,
			dueDate: invoice.dueDate,
			subtotal: invoice.subtotal,
			taxAmount: invoice.taxAmount ?? null,
			discountAmount: invoice.discountAmount ?? null,
			total: invoice.total,
			paidAt: invoice.paidAt ?? null,
		};

		const lineItemsPublic: PortalInvoiceLineItemPublic[] = lineItems.map(
			(li) => ({
				_id: li._id,
				description: li.description,
				quantity: li.quantity,
				unitPrice: li.unitPrice,
				total: li.total,
				sortOrder: li.sortOrder,
			}),
		);

		return {
			invoice: invoicePublic,
			lineItems: lineItemsPublic,
			payments: paymentsPublic,
			paymentSummary: summary,
			activePaymentPublic,
			isLegacy,
			legacyPayUrl,
			businessName,
			businessLogoUrl,
			stripeChargesEnabled,
			clientName,
			clientEmail,
		};
	},
});

/**
 * On-demand signed PDF URL for an invoice. Documents-table fallback ONLY
 * (no latestDocumentId column on invoices). Cross-org guard: explicit
 * doc.orgId === session.orgId per-row check (not .first()) defeats colliding
 * entityId leak. Returns null when no document matches; never throws on
 * missing PDF.
 */
export const getDownloadUrl = query({
	args: { invoiceId: v.id("invoices") },
	returns: v.union(v.object({ url: v.string() }), v.null()),
	handler: async (ctx, { invoiceId }) => {
		const session = await getPortalSessionOrThrow(ctx);

		const invoice = await ctx.db.get(invoiceId);
		if (!invoice) throw new ConvexError({ code: "NOT_FOUND" });

		const contact = await ctx.db.get(session.clientContactId);
		if (!contact || contact.orgId !== session.orgId) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		if (
			contact.clientId !== invoice.clientId ||
			invoice.orgId !== session.orgId
		) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		if (invoice.status === "draft" || invoice.status === "cancelled") {
			throw new ConvexError({ code: "NOT_FOUND" });
		}

		// Iterate desc by version; .find by orgId (NOT .first()) so a higher-
		// version cross-org row cannot mask the legitimate same-org fallback.
		const candidates = await ctx.db
			.query("documents")
			.withIndex("by_document_version", (q) =>
				q.eq("documentType", "invoice").eq("documentId", invoiceId),
			)
			.order("desc")
			.collect();
		const match = candidates.find(
			(d) =>
				d.orgId === session.orgId &&
				d.documentType === "invoice" &&
				d.documentId === invoiceId,
		);
		if (!match) return null;

		const url = await ctx.storage.getUrl(match.storageId);
		return url ? { url } : null;
	},
});
