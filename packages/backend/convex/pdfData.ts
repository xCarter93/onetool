import { bindAgreementApprovalDocument } from "./lib/projectSeriesAgreements";
/**
 * DB half of the server-side PDF service (Slice 3, mobile 3.0). The render
 * itself runs in pdfActions.ts ("use node" — @react-pdf/renderer); this module
 * holds the queries/mutations a node action can't define.
 *
 * The generate path deliberately does NOT pin quote.latestDocumentId — like
 * web's client-side generation, it only appends a new documents row. Pinning
 * stays with its two existing writers (BoldSign, approval commit), so a
 * regenerate can never freeze the portal on a stale version.
 */
import { internalQuery } from "./_generated/server";
import { internalMutation } from "./lib/triggers";
import { ConvexError, v } from "convex/values";
import { projectInvoiceGroups } from "./lib/invoiceGroups";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { requireLevel } from "./lib/permissions";
import {
	attachQuoteDocumentSnapshot,
	buildQuoteContentSnapshot,
	loadCurrentQuoteContentSnapshot,
	loadQuoteDocumentSnapshot,
	MAX_QUOTE_SNAPSHOT_LINES,
	quoteContentSnapshotValidator,
	quoteContentSnapshotsEqual,
} from "./lib/quoteContentSnapshot";

async function primaryProperty(
	ctx: { db: import("./_generated/server").QueryCtx["db"] },
	clientId: Id<"clients">
): Promise<Doc<"clientProperties"> | null> {
	const primary = await ctx.db
		.query("clientProperties")
		.withIndex("by_primary", (q) =>
			q.eq("clientId", clientId).eq("isPrimary", true)
		)
		.first();
	if (primary) return primary;
	return await ctx.db
		.query("clientProperties")
		.withIndex("by_client", (q) => q.eq("clientId", clientId))
		.first();
}

/** Everything QuotePDF needs, org-validated. Callable from the node action. */
export const _getQuoteRenderData = internalQuery({
	args: { quoteId: v.id("quotes"), orgId: v.id("organizations") },
	handler: async (ctx, args) => {
		const quote = await ctx.db.get(args.quoteId);
		if (!quote || quote.orgId !== args.orgId) {
			throw new ConvexError({ code: "NOT_FOUND" });
		}
		const lineItems = (
			await ctx.db
				.query("quoteLineItems")
				.withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
				.take(MAX_QUOTE_SNAPSHOT_LINES + 1)
		).sort((a, b) => a.sortOrder - b.sortOrder);
		const loadedClient = await ctx.db.get(quote.clientId);
		const client = loadedClient?.orgId === args.orgId ? loadedClient : null;
		if (!client) throw new ConvexError({ code: "NOT_FOUND" });
		const organization = await ctx.db.get(args.orgId);
		const project = quote.projectId ? await ctx.db.get(quote.projectId) : null;
		const projectProperty = project?.orgId === args.orgId && project.clientId === quote.clientId && project.propertyId
			? await ctx.db.get(project.propertyId) : null;
		const property = projectProperty?.orgId === args.orgId && projectProperty.clientId === quote.clientId
			? projectProperty : client ? await primaryProperty(ctx, client._id) : null;
		const loadedCountersigner =
			quote.requiresCountersignature && quote.countersignerId
				? await ctx.db.get(quote.countersignerId)
				: null;
		const countersignerMembership = loadedCountersigner
			? await ctx.db.query("organizationMemberships").withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", loadedCountersigner._id)).first()
			: null;
		const countersigner = countersignerMembership ? loadedCountersigner : null;
		if (quote.requiresCountersignature && !countersigner)
			throw new ConvexError("The configured countersigner is not a member of this organization");
		return {
			quote,
			lineItems,
			quoteContentSnapshot: buildQuoteContentSnapshot(quote, lineItems),
			client,
			organization,
			property,
			countersigner: countersigner
				? { name: countersigner.name, email: countersigner.email }
				: null,
		};
	},
});

/** Everything InvoicePDF needs, org-validated. Callable from the node action. */
export const _getInvoiceRenderData = internalQuery({
	args: { invoiceId: v.id("invoices"), orgId: v.id("organizations") },
	handler: async (ctx, args) => {
		const invoice = await ctx.db.get(args.invoiceId);
		if (!invoice || invoice.orgId !== args.orgId) {
			throw new ConvexError({ code: "NOT_FOUND" });
		}
		const lineItems = (
			await ctx.db
				.query("invoiceLineItems")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
				.collect()
		).sort((a, b) => a.sortOrder - b.sortOrder);
		const payments = (
			await ctx.db
				.query("payments")
				.withIndex("by_invoice_sort", (q) => q.eq("invoiceId", args.invoiceId))
				.collect()
		).sort((a, b) => a.sortOrder - b.sortOrder);
		const client = await ctx.db.get(invoice.clientId);
		const organization = await ctx.db.get(args.orgId);
		const property = client ? await primaryProperty(ctx, client._id) : null;
		const invoiceGroups = await projectInvoiceGroups(ctx, invoice);
		return { invoice, lineItems, payments, client, organization, property, invoiceGroups };
	},
});

/**
 * Auth + freshness check for the public ensure action: validates the caller's
 * org and permission, and reports the newest existing PDF (if any) so the
 * action can skip the render. Runs with the caller's identity (auth propagates
 * from the action into runQuery).
 */
export const _ensureQuotePdfAuth = internalQuery({
	args: { quoteId: v.id("quotes") },
	handler: async (ctx, args) => {
		const orgId = await getCurrentUserOrgId(ctx);
		await requireLevel(ctx, "quotes", "modify");
		const quote = await ctx.db.get(args.quoteId);
		if (!quote || quote.orgId !== orgId) {
			throw new ConvexError({ code: "NOT_FOUND" });
		}
		// A PDF older than the content is never good enough here: the signature
		// flow pins this id into the audit row, and a revert→edit→resend cycle
		// (or a validUntil extension) leaves the stored render behind the
		// document the client is agreeing to. Stale ⇒ render fresh.
		const contentUpdatedAt = quote.contentUpdatedAt ?? 0;
		const currentSnapshot = await loadCurrentQuoteContentSnapshot(ctx, quote._id);
		if (!currentSnapshot) throw new ConvexError({ code: "NOT_FOUND" });
		// Pinned version wins (BoldSign flow); else newest same-org row.
		if (quote.latestDocumentId) {
			const pinned = await ctx.db.get(quote.latestDocumentId);
			const pinnedSnapshot = pinned ? await loadQuoteDocumentSnapshot(ctx, pinned) : null;
			if (
				pinned &&
				pinned.orgId === orgId &&
				pinned.documentType === "quote" &&
				pinned.documentId === args.quoteId &&
				pinned.generatedAt >= contentUpdatedAt &&
				(!quote.recurringAgreementTerms || (pinned.quoteSnapshotSource === "server" && Boolean(pinnedSnapshot))) &&
				(!pinnedSnapshot || quoteContentSnapshotsEqual(pinnedSnapshot, currentSnapshot))
			) {
				return { orgId, existingDocumentId: pinned._id };
			}
		}
		const newest = await ctx.db
			.query("documents")
			.withIndex("by_document_version", (q) =>
				q.eq("documentType", "quote").eq("documentId", args.quoteId)
			)
			.order("desc")
			.first();
		const newestSnapshot = newest ? await loadQuoteDocumentSnapshot(ctx, newest) : null;
		return {
			orgId,
			existingDocumentId:
				newest &&
				newest.orgId === orgId &&
				newest.generatedAt >= contentUpdatedAt &&
				(!quote.recurringAgreementTerms || (newest.quoteSnapshotSource === "server" && Boolean(newestSnapshot))) &&
				(!newestSnapshot || quoteContentSnapshotsEqual(newestSnapshot, currentSnapshot))
					? newest._id
					: null,
		};
	},
});

/**
 * Insert the rendered PDF as the next documents version. Explicit orgId — the
 * scheduled send-time path has no user context. No activity entry: automatic
 * generation is a system artifact, not a user action (web's manual Generate
 * keeps logging through documents.create).
 */
export const _insertGeneratedDocument = internalMutation({
	args: {
		orgId: v.id("organizations"),
		documentType: v.union(v.literal("quote"), v.literal("invoice")),
		documentId: v.string(),
		storageId: v.id("_storage"),
		quoteContentSnapshot: v.optional(quoteContentSnapshotValidator),
	},
	handler: async (ctx, args) => {
		let quoteContentSnapshot = args.quoteContentSnapshot;
		if (quoteContentSnapshot) {
			if (args.documentType !== "quote")
				throw new ConvexError("Quote content snapshots can only be attached to quote documents");
			const quote = await ctx.db.get(args.documentId as Id<"quotes">);
			if (!quote || quote.orgId !== args.orgId) throw new ConvexError({ code: "NOT_FOUND" });
			const current = await loadCurrentQuoteContentSnapshot(ctx, quote._id);
			if (!current || !quoteContentSnapshotsEqual(quoteContentSnapshot, current))
				throw new ConvexError("Quote changed while the PDF was generated; generate it again");
			quoteContentSnapshot = current;
		}
		const newest = await ctx.db
			.query("documents")
			.withIndex("by_document_version", (q) =>
				q
					.eq("documentType", args.documentType)
					.eq("documentId", args.documentId)
			)
			.order("desc")
			.first();
		if (newest && newest.orgId !== args.orgId) throw new ConvexError({ code: "NOT_FOUND" });
		const maxVersion = newest?.version ?? 0;
		const id = await ctx.db.insert("documents", {
			orgId: args.orgId,
			documentType: args.documentType,
			documentId: args.documentId,
			storageId: args.storageId,
			generatedAt: Date.now(),
			version: maxVersion + 1,
		});
		if (quoteContentSnapshot) {
			const document = await ctx.db.get(id);
			if (!document) throw new ConvexError("Generated quote document was not found");
			await attachQuoteDocumentSnapshot(ctx, document, quoteContentSnapshot, "server");
			await bindAgreementApprovalDocument(ctx, args.documentId as Id<"quotes">, id);
		}
		return { documentId: id, version: maxVersion + 1 };
	},
});
