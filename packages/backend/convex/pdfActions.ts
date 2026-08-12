"use node";

/**
 * Server-side PDF rendering (Slice 3, mobile 3.0). Renders the SAME
 * @react-pdf/renderer templates the web app uses client-side
 * (convex/pdf/QuotePDF + InvoicePDF), so a PDF looks identical regardless of
 * which surface produced it. DB reads/writes live in pdfData.ts — a "use
 * node" file can only export actions.
 *
 * Generation appends a new documents version; it never pins
 * quote.latestDocumentId (see pdfData.ts header).
 */
import * as React from "react";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import QuotePDF from "../pdf/QuotePDF";
import InvoicePDF from "../pdf/InvoicePDF";

async function renderElementToStorage(
	ctx: ActionCtx,
	element: React.ReactElement
): Promise<Id<"_storage">> {
	const { renderToBuffer } = await import("@react-pdf/renderer");
	const buffer = await renderToBuffer(
		// react-pdf's Document element type is narrower than ReactElement.
		element as Parameters<typeof renderToBuffer>[0]
	);
	const blob = new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
	return await ctx.storage.store(blob);
}

async function renderQuotePdfToDocument(
	ctx: ActionCtx,
	quoteId: Id<"quotes">,
	orgId: Id<"organizations">
): Promise<Id<"documents">> {
	const data = await ctx.runQuery(internal.pdfData._getQuoteRenderData, {
		quoteId,
		orgId,
	});
	// Prop mapping mirrors web's build-quote-pdf-blob exactly.
	const element = React.createElement(QuotePDF, {
		quote: data.quote,
		items: data.lineItems,
		client: data.client
			? {
					companyName: data.client.companyName,
					streetAddress: data.property?.streetAddress,
					city: data.property?.city,
					state: data.property?.state,
					zipCode: data.property?.zipCode,
					country: data.property?.country,
				}
			: undefined,
		organization: data.organization
			? {
					name: data.organization.name,
					logoUrl: data.organization.logoUrl || undefined,
					address: data.organization.address || undefined,
					phone: data.organization.phone || undefined,
					email: data.organization.email || undefined,
				}
			: undefined,
		countersigner:
			data.quote.requiresCountersignature && data.countersigner
				? {
						name: data.countersigner.name || data.countersigner.email,
						email: data.countersigner.email,
					}
				: null,
		signingOrder: data.quote.signingOrder,
	});
	const storageId = await renderElementToStorage(ctx, element);
	const inserted = await ctx.runMutation(
		internal.pdfData._insertGeneratedDocument,
		{
			orgId,
			documentType: "quote",
			documentId: quoteId,
			storageId,
		}
	);
	return inserted.documentId;
}

async function renderInvoicePdfToDocument(
	ctx: ActionCtx,
	invoiceId: Id<"invoices">,
	orgId: Id<"organizations">
): Promise<Id<"documents">> {
	const data = await ctx.runQuery(internal.pdfData._getInvoiceRenderData, {
		invoiceId,
		orgId,
	});
	// Prop mapping mirrors web's build-invoice-pdf-blob exactly.
	const element = React.createElement(InvoicePDF, {
		invoice: data.invoice,
		items: data.lineItems,
		payments: data.payments.map((p) => ({
			paymentAmount: p.paymentAmount,
			dueDate: p.dueDate,
			description: p.description,
			sortOrder: p.sortOrder,
		})),
		client: data.client
			? {
					companyName: data.client.companyName,
					streetAddress: data.property?.streetAddress,
					city: data.property?.city,
					state: data.property?.state,
					zipCode: data.property?.zipCode,
					country: data.property?.country,
				}
			: undefined,
		organization: data.organization
			? {
					name: data.organization.name,
					logoUrl: data.organization.logoUrl || undefined,
					address: data.organization.address || undefined,
					phone: data.organization.phone || undefined,
					email: data.organization.email || undefined,
				}
			: undefined,
	});
	const storageId = await renderElementToStorage(ctx, element);
	const inserted = await ctx.runMutation(
		internal.pdfData._insertGeneratedDocument,
		{
			orgId,
			documentType: "invoice",
			documentId: invoiceId,
			storageId,
		}
	);
	return inserted.documentId;
}

/** Scheduled from quotes.sendToClient when the quote has no PDF yet. */
export const generateQuotePdf = internalAction({
	args: { quoteId: v.id("quotes"), orgId: v.id("organizations") },
	handler: async (ctx, args): Promise<Id<"documents">> => {
		return await renderQuotePdfToDocument(ctx, args.quoteId, args.orgId);
	},
});

/** Scheduled from invoices.sendToClient when the invoice has no PDF yet. */
export const generateInvoicePdf = internalAction({
	args: { invoiceId: v.id("invoices"), orgId: v.id("organizations") },
	handler: async (ctx, args): Promise<Id<"documents">> => {
		return await renderInvoicePdfToDocument(ctx, args.invoiceId, args.orgId);
	},
});

/**
 * Mobile signature flow preflight: return the quote's newest PDF, rendering
 * one first if none exists. Authenticated — auth propagates into the internal
 * query, which org-scopes the quote and requires quotes-modify.
 */
export const ensureQuotePdf = action({
	args: { quoteId: v.id("quotes") },
	handler: async (ctx, args): Promise<Id<"documents">> => {
		const auth = await ctx.runQuery(internal.pdfData._ensureQuotePdfAuth, {
			quoteId: args.quoteId,
		});
		if (auth.existingDocumentId) return auth.existingDocumentId;
		return await renderQuotePdfToDocument(ctx, args.quoteId, auth.orgId);
	},
});
