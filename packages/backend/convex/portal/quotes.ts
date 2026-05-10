// Portal-facing quote backend.
//
// Approve is an action because it stores the signature blob; DB validation and
// commit work are delegated to internal queries/mutations so scope checks,
// status changes, audit rows, and event emission stay transactional.
import {
	action,
	internalMutation,
	internalQuery,
	mutation,
	query,
	type MutationCtx,
} from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { getPortalSessionOrThrow } from "./helpers";
import { rateLimiter } from "../rateLimits";
import { emitStatusChangeEvent } from "../eventBus";
import { ActivityHelpers } from "../lib/activities";
import { AggregateHelpers } from "../lib/aggregates";
import { calculateQuoteTotals } from "../lib/quoteTotals";

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

/**
 * QUOTE-01: list quotes visible to the authenticated portal session.
 * Filters: belongs to session's clientContact's clientId, same orgId, status
 * is NOT "draft" (drafts are workspace-only).
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const session = await getPortalSessionOrThrow(ctx);
		const contact = await ctx.db.get(session.clientContactId);
		if (!contact || contact.orgId !== session.orgId) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}

		const quotes = await ctx.db
			.query("quotes")
			.withIndex("by_client", (q) => q.eq("clientId", contact.clientId))
			.collect();

		const visible = quotes
			.filter((q) => q.orgId === session.orgId && q.status !== "draft")
			.sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));
		return await Promise.all(
			visible.map(async (q) => {
				const totals = await calculateQuoteTotals(ctx, q._id, {
					discountEnabled: q.discountEnabled,
					discountAmount: q.discountAmount,
					discountType: q.discountType,
					taxEnabled: q.taxEnabled,
					taxRate: q.taxRate,
				});
				return {
					_id: q._id,
					quoteNumber: q.quoteNumber,
					title: q.title,
					status: q.status,
					sentAt: q.sentAt,
					validUntil: q.validUntil,
					total: totals.total,
					latestDocumentId: q.latestDocumentId,
					approvedAt: q.approvedAt,
					declinedAt: q.declinedAt,
				};
			}),
		);
	},
});

/**
 * Get a single quote with the fields needed by the portal detail and receipt UI.
 */
export const get = query({
	args: { quoteId: v.id("quotes") },
	handler: async (ctx, { quoteId }) => {
		const session = await getPortalSessionOrThrow(ctx);

		const quote = await ctx.db.get(quoteId);
		if (!quote) throw new ConvexError({ code: "NOT_FOUND" });

		const contact = await ctx.db.get(session.clientContactId);
		if (!contact || contact.orgId !== session.orgId) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		if (
			contact.clientId !== quote.clientId ||
			quote.orgId !== session.orgId
		) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		// Drafts are never exposed to the portal — masquerade as NOT_FOUND so
		// existence is not leaked.
		if (quote.status === "draft") {
			throw new ConvexError({ code: "NOT_FOUND" });
		}

		const lineItems = (
			await ctx.db
				.query("quoteLineItems")
				.withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
				.collect()
		).sort((a, b) => a.sortOrder - b.sortOrder);

		let latestDocument: {
			_id: Id<"documents">;
			version: number;
			storageId: Id<"_storage">;
			signedStorageId?: Id<"_storage">;
		} | null = null;

		// Prefer the pinned latest document, but fall back to the latest same-org
		// quote document so non-BoldSign generated PDFs still work.
		if (quote.latestDocumentId) {
			const doc = await ctx.db.get(quote.latestDocumentId);
			if (doc) {
				latestDocument = {
					_id: doc._id,
					version: doc.version,
					storageId: doc.storageId,
					signedStorageId: doc.signedStorageId,
				};
			}
		}
		if (latestDocument === null) {
			const fallbackDoc = await ctx.db
				.query("documents")
				.withIndex("by_document_version", (q) =>
					q.eq("documentType", "quote").eq("documentId", quoteId),
				)
				.order("desc")
				.first();
			if (fallbackDoc && fallbackDoc.orgId === session.orgId) {
				latestDocument = {
					_id: fallbackDoc._id,
					version: fallbackDoc.version,
					storageId: fallbackDoc.storageId,
					signedStorageId: fallbackDoc.signedStorageId,
				};
			}
		}

		const org = await ctx.db.get(quote.orgId);
		const businessName = org?.name ?? "";
		const client = await ctx.db.get(quote.clientId);
		const clientName = client?.companyName ?? "Client";
		const clientEmail = contact.email ?? "";

		const latestAuditRow = await ctx.db
			.query("quoteApprovals")
			.withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
			.order("desc")
			.first();

		let latestApproval: {
			auditId: Id<"quoteApprovals">;
			action: "approved" | "declined";
			createdAt: number;
			documentVersion: number;
			lineItemsCount: number;
			total: number;
			signatureStorageId?: Id<"_storage">;
			signatureUrl: string | null;
		} | null = null;
		if (latestAuditRow) {
			latestApproval = {
				auditId: latestAuditRow._id,
				action: latestAuditRow.action,
				createdAt: latestAuditRow.createdAt,
				documentVersion: latestAuditRow.documentVersion,
				lineItemsCount: latestAuditRow.lineItemsSnapshot.length,
				total: latestAuditRow.totalSnapshot,
				signatureStorageId: latestAuditRow.signatureStorageId,
				signatureUrl: latestAuditRow.signatureStorageId
					? await ctx.storage.getUrl(latestAuditRow.signatureStorageId)
					: null,
			};
		}

		const calculatedTotals = await calculateQuoteTotals(ctx, quoteId, {
			discountEnabled: quote.discountEnabled,
			discountAmount: quote.discountAmount,
			discountType: quote.discountType,
			taxEnabled: quote.taxEnabled,
			taxRate: quote.taxRate,
		});

		return {
			quote: {
				...quote,
				subtotal: calculatedTotals.subtotal,
				taxAmount: calculatedTotals.taxAmount,
				total: calculatedTotals.total,
			},
			lineItems,
			latestDocument,
			businessName,
			clientName,
			clientEmail,
			latestApproval,
		};
	},
});

/**
 * Plan 14.1-03 (QUOTE-04 client-side): on-demand signed URL for the quote
 * PDF, scoped to a portal session. Mirrors the chain validation and Phase
 * 14-13 documents-table fallback used by `get`. Always reads
 * `latestDocument.storageId` — never `signedStorageId` (BoldSign artifact;
 * different audit trail).
 *
 * Pinned-document strict validation (REVIEWS HIGH 2026-05-10): the pinned
 * `quote.latestDocumentId` branch validates orgId, documentType, AND
 * documentId before minting a URL. Any mismatch falls through to the
 * fallback branch (which already filters orgId). Prevents a corrupted
 * latestDocumentId pointer from leaking a foreign blob URL.
 *
 * Returns `{ url }` on success or `null` when no document exists.
 */
export const getDownloadUrl = query({
	args: { quoteId: v.id("quotes") },
	handler: async (ctx, { quoteId }) => {
		const session = await getPortalSessionOrThrow(ctx);

		const quote = await ctx.db.get(quoteId);
		if (!quote) throw new ConvexError({ code: "NOT_FOUND" });

		const contact = await ctx.db.get(session.clientContactId);
		if (!contact || contact.orgId !== session.orgId) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		if (
			contact.clientId !== quote.clientId ||
			quote.orgId !== session.orgId
		) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		if (quote.status === "draft") {
			throw new ConvexError({ code: "NOT_FOUND" });
		}

		// Phase 14-13 documents-table fallback with strict pinned-doc validation.
		let latestDocument: { storageId: Id<"_storage"> } | null = null;

		if (quote.latestDocumentId) {
			const pinnedDoc = await ctx.db.get(quote.latestDocumentId);
			// REVIEWS HIGH 2026-05-10: all three checks must pass.
			// Mismatch falls through to documents-table fallback.
			if (
				pinnedDoc &&
				pinnedDoc.orgId === session.orgId &&
				pinnedDoc.documentType === "quote" &&
				pinnedDoc.documentId === quoteId
			) {
				latestDocument = { storageId: pinnedDoc.storageId };
			}
		}

		if (latestDocument === null) {
			// Iterate desc to pick the highest-version SAME-ORG row. A bare
			// `.first()` would surface a higher-version cross-org row (which the
			// orgId check would then reject, returning null) — defeating the
			// fallback's purpose when a pinned cross-org doc is also present
			// (REVIEWS HIGH E1 case).
			const candidates = await ctx.db
				.query("documents")
				.withIndex("by_document_version", (q) =>
					q.eq("documentType", "quote").eq("documentId", quoteId),
				)
				.order("desc")
				.collect();
			const fallbackDoc = candidates.find(
				(d) => d.orgId === session.orgId,
			);
			if (fallbackDoc) {
				latestDocument = { storageId: fallbackDoc.storageId };
			}
		}

		if (!latestDocument) return null;

		const url = await ctx.storage.getUrl(latestDocument.storageId);
		return url ? { url } : null;
	},
});

// ---------------------------------------------------------------------------
// Internal helpers used by approve action + decline mutation
// ---------------------------------------------------------------------------

export const _getPortalSessionForAction = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await getPortalSessionOrThrow(ctx);
	},
});

/** Rate-limit helper for approve action, which cannot run DB work directly. */
export const _rateLimitPreflight = internalMutation({
	args: {
		jti: v.string(),
		bucket: v.union(
			v.literal("portalQuoteApprove"),
			v.literal("portalQuoteDecline"),
		),
	},
	handler: async (ctx, { jti, bucket }) => {
		const result = await rateLimiter.limit(ctx, bucket, {
			key: jti,
			throws: false,
		});
		if (!result.ok) {
			throw new ConvexError({
				code: "RATE_LIMITED",
				retryAfter: result.retryAfter ?? 10_000,
			});
		}
	},
});

/**
 * Read-only preflight for approve: scope chain + OCC + status precondition.
 * Runs BEFORE storage.store so failure paths leave no orphan blob.
 * Returns the snapshot fields _commitApproval needs to insert the audit row.
 */
export const _preflightApproval = internalQuery({
	args: {
		quoteId: v.id("quotes"),
		expectedDocumentId: v.id("documents"),
		clientContactId: v.id("clientContacts"),
		orgId: v.id("organizations"),
	},
	handler: async (ctx, args) => {
		const quote = await ctx.db.get(args.quoteId);
		if (!quote) throw new ConvexError({ code: "NOT_FOUND" });
		if (quote.orgId !== args.orgId) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}

		const client = await ctx.db.get(quote.clientId);
		if (!client || client.orgId !== args.orgId) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		const contact = await ctx.db.get(args.clientContactId);
		if (
			!contact ||
			contact.clientId !== quote.clientId ||
			contact.orgId !== args.orgId
		) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		// If no document is pinned yet, accept any same-org quote document and
		// let the commit step pin it atomically.
		if (quote.latestDocumentId == null) {
			const fallbackDoc = await ctx.db.get(args.expectedDocumentId);
			if (
				!fallbackDoc ||
				fallbackDoc.orgId !== args.orgId ||
				fallbackDoc.documentType !== "quote" ||
				fallbackDoc.documentId !== args.quoteId
			) {
				throw new ConvexError({
					code: "QUOTE_VERSION_STALE",
					latestDocumentId: quote.latestDocumentId,
				});
			}
		} else if (quote.latestDocumentId !== args.expectedDocumentId) {
			throw new ConvexError({
				code: "QUOTE_VERSION_STALE",
				latestDocumentId: quote.latestDocumentId,
			});
		}
		if (quote.status !== "sent") {
			throw new ConvexError({ code: "QUOTE_NOT_PENDING" });
		}
		const document = await ctx.db.get(args.expectedDocumentId);
		if (!document) throw new ConvexError({ code: "NOT_FOUND" });

		const lineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
			.collect();
		const lineItemsSnapshot = lineItems
			.slice()
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((li) => ({
				description: li.description,
				quantity: li.quantity,
				unit: li.unit,
				rate: li.rate,
				amount: li.amount,
				sortOrder: li.sortOrder,
			}));

		const recomputedTotals = await calculateQuoteTotals(ctx, args.quoteId, {
			discountEnabled: quote.discountEnabled,
			discountAmount: quote.discountAmount,
			discountType: quote.discountType,
			taxEnabled: quote.taxEnabled,
			taxRate: quote.taxRate,
		});
		return {
			documentVersion: document.version,
			lineItemsSnapshot,
			subtotal: recomputedTotals.subtotal,
			taxAmount: recomputedTotals.taxAmount,
			total: recomputedTotals.total,
			terms: quote.terms,
			clientCompanyName: client.companyName ?? "Unknown",
		};
	},
});

/** Portal-aware activity logger with a direct insert fallback. */
async function logQuoteActivity(
	ctx: MutationCtx,
	quote: Doc<"quotes">,
	clientName: string,
	action: "approved" | "declined",
): Promise<void> {
	try {
		if (action === "approved") {
			await ActivityHelpers.quoteApproved(ctx, quote, clientName);
		} else {
			await ActivityHelpers.quoteDeclined(ctx, quote, clientName);
		}
		return;
	} catch {
		// fall through to direct insert
	}
	const org = await ctx.db.get(quote.orgId);
	if (!org) return;
	await ctx.db.insert("activities", {
		orgId: quote.orgId,
		userId: org.ownerUserId,
		activityType: action === "approved" ? "quote_approved" : "quote_declined",
		entityType: "quote",
		entityId: quote._id,
		entityName: quote.title || `Quote ${quote.quoteNumber || quote._id}`,
		description:
			action === "approved"
				? `Quote approved by ${clientName}`
				: `Quote declined by ${clientName}`,
		metadata: { quoteNumber: quote.quoteNumber, total: quote.total },
		timestamp: Date.now(),
		isVisible: true,
	});
}

/** Atomic commit for approve or decline. Re-checks OCC and scope in-transaction. */
export const _commitApproval = internalMutation({
	args: {
		quoteId: v.id("quotes"),
		expectedDocumentId: v.id("documents"),
		clientContactId: v.id("clientContacts"),
		orgId: v.id("organizations"),
		action: v.union(v.literal("approved"), v.literal("declined")),
		declineReason: v.optional(v.string()),
		signatureStorageId: v.optional(v.id("_storage")),
		signatureMode: v.optional(
			v.union(v.literal("typed"), v.literal("drawn")),
		),
		signatureRawData: v.optional(v.string()),
		ipAddress: v.string(),
		userAgent: v.string(),
		documentVersion: v.number(),
		lineItemsSnapshot: v.array(
			v.object({
				description: v.string(),
				quantity: v.number(),
				unit: v.string(),
				rate: v.number(),
				amount: v.number(),
				sortOrder: v.number(),
			}),
		),
		subtotal: v.number(),
		taxAmount: v.number(),
		total: v.number(),
		terms: v.optional(v.string()),
		clientCompanyName: v.string(),
	},
	handler: async (ctx, args) => {
		const quote = await ctx.db.get(args.quoteId);
		if (!quote) throw new ConvexError({ code: "NOT_FOUND" });
		if (quote.orgId !== args.orgId) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		const contactRedo = await ctx.db.get(args.clientContactId);
		if (
			!contactRedo ||
			contactRedo.orgId !== args.orgId ||
			contactRedo.clientId !== quote.clientId
		) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		if (quote.latestDocumentId == null) {
			const fallbackDoc = await ctx.db.get(args.expectedDocumentId);
			if (
				!fallbackDoc ||
				fallbackDoc.orgId !== args.orgId ||
				fallbackDoc.documentType !== "quote" ||
				fallbackDoc.documentId !== args.quoteId
			) {
				throw new ConvexError({
					code: "QUOTE_VERSION_STALE",
					latestDocumentId: quote.latestDocumentId,
				});
			}
			await ctx.db.patch(args.quoteId, {
				latestDocumentId: args.expectedDocumentId,
			});
		} else if (quote.latestDocumentId !== args.expectedDocumentId) {
			throw new ConvexError({
				code: "QUOTE_VERSION_STALE",
				latestDocumentId: quote.latestDocumentId,
			});
		}
		if (quote.status !== "sent") {
			throw new ConvexError({ code: "QUOTE_NOT_PENDING" });
		}

		const now = Date.now();

		// 1. Insert audit row FIRST.
		const auditId = await ctx.db.insert("quoteApprovals", {
			quoteId: args.quoteId,
			orgId: quote.orgId,
			clientContactId: args.clientContactId,
			action: args.action,
			declineReason:
				args.action === "declined" ? args.declineReason : undefined,
			signatureStorageId:
				args.action === "approved" ? args.signatureStorageId : undefined,
			signatureMode:
				args.action === "approved" ? args.signatureMode : undefined,
			signatureRawData:
				args.action === "approved" ? args.signatureRawData : undefined,
			ipAddress: args.ipAddress,
			userAgent: args.userAgent.slice(0, 512),
			documentId: args.expectedDocumentId,
			documentVersion: args.documentVersion,
			lineItemsSnapshot: args.lineItemsSnapshot,
			subtotalSnapshot: args.subtotal,
			taxSnapshot: args.taxAmount,
			totalSnapshot: args.total,
			termsSnapshot: args.terms,
			termsAcceptedAt: args.action === "approved" ? now : undefined,
			createdAt: now,
		});

		// 2. Patch quote status SECOND.
		const newStatus = args.action === "approved" ? "approved" : "declined";
		const patch =
			args.action === "approved"
				? { status: newStatus as "approved", approvedAt: now }
				: { status: newStatus as "declined", declinedAt: now };
		const oldStatus = quote.status;
		await ctx.db.patch(args.quoteId, patch);

		const updatedQuote = await ctx.db.get(args.quoteId);
		if (updatedQuote) {
			await AggregateHelpers.updateQuote(
				ctx,
				quote as Doc<"quotes">,
				updatedQuote as Doc<"quotes">,
			);
		}

		// 4. Activity helper THIRD (with portal-aware fallback).
		if (updatedQuote) {
			await logQuoteActivity(
				ctx,
				updatedQuote,
				args.clientCompanyName,
				args.action,
			);
		}

		// 5. Emit status-change event LAST (after audit + patch + activity).
		const source =
			args.action === "approved"
				? "portal.quotes.approve"
				: "portal.quotes.decline";
		await emitStatusChangeEvent(
			ctx,
			quote.orgId,
			"quote",
			args.quoteId,
			oldStatus,
			newStatus,
			source,
		);

		return { auditId, createdAt: now };
	},
});

// ---------------------------------------------------------------------------
// Public approve action (single orchestrator — no separate uploadSignature)
// ---------------------------------------------------------------------------

export const approve = action({
	args: {
		quoteId: v.id("quotes"),
		expectedDocumentId: v.id("documents"),
		signatureBase64: v.string(),
		signatureMode: v.union(v.literal("typed"), v.literal("drawn")),
		signatureRawData: v.string(),
		ipAddress: v.string(),
		userAgent: v.string(),
		termsAccepted: v.literal(true),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		auditId: Id<"quoteApprovals">;
		action: "approved";
		createdAt: number;
		documentVersion: number;
		lineItemsCount: number;
		total: number;
		signatureStorageId: Id<"_storage">;
		signatureUrl: string | null;
	}> => {
		const session = await ctx.runQuery(internal.portal.quotes._getPortalSessionForAction, {});
		await ctx.runMutation(internal.portal.quotes._rateLimitPreflight, {
			jti: session.tokenJti,
			bucket: "portalQuoteApprove",
		});
		const preflight = await ctx.runQuery(
			internal.portal.quotes._preflightApproval,
			{
				quoteId: args.quoteId,
				expectedDocumentId: args.expectedDocumentId,
				clientContactId: session.clientContactId,
				orgId: session.orgId,
			},
		);
		const match = args.signatureBase64.match(/^data:image\/png;base64,(.+)$/);
		if (!match) {
			throw new ConvexError({ code: "INVALID_SIGNATURE_FORMAT" });
		}
		const binary = atob(match[1]!);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		if (bytes.byteLength > 256_000) {
			throw new ConvexError({ code: "SIGNATURE_TOO_LARGE" });
		}
		const blob = new Blob([bytes], { type: "image/png" });
		const signatureStorageId: Id<"_storage"> = await ctx.storage.store(blob);

		try {
			const { auditId, createdAt } = await ctx.runMutation(
				internal.portal.quotes._commitApproval,
				{
					quoteId: args.quoteId,
					expectedDocumentId: args.expectedDocumentId,
					clientContactId: session.clientContactId,
					orgId: session.orgId,
					action: "approved" as const,
					signatureStorageId,
					signatureMode: args.signatureMode,
					signatureRawData: args.signatureRawData,
					ipAddress: args.ipAddress,
					userAgent: args.userAgent,
					documentVersion: preflight.documentVersion,
					lineItemsSnapshot: preflight.lineItemsSnapshot,
					subtotal: preflight.subtotal,
					taxAmount: preflight.taxAmount,
					total: preflight.total,
					terms: preflight.terms,
					clientCompanyName: preflight.clientCompanyName,
				},
			);
			const signatureUrl = await ctx.storage.getUrl(signatureStorageId);
			return {
				auditId,
				action: "approved" as const,
				createdAt,
				documentVersion: preflight.documentVersion,
				lineItemsCount: preflight.lineItemsSnapshot.length,
				total: preflight.total,
				signatureStorageId,
				signatureUrl,
			};
		} catch (err) {
			await ctx.storage.delete(signatureStorageId).catch(() => {
				/* swallow cleanup error so original is the one re-thrown */
			});
			throw err;
		}
	},
});

// ---------------------------------------------------------------------------
// Public decline mutation (no signature blob, so no action wrapper needed).
// ---------------------------------------------------------------------------

export const decline = mutation({
	args: {
		quoteId: v.id("quotes"),
		expectedDocumentId: v.id("documents"),
		declineReason: v.optional(v.string()),
		ipAddress: v.string(),
		userAgent: v.string(),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		auditId: Id<"quoteApprovals">;
		action: "declined";
		createdAt: number;
		documentVersion: number;
		lineItemsCount: number;
		total: number;
	}> => {
		const session = await getPortalSessionOrThrow(ctx);

		const rl = await rateLimiter.limit(ctx, "portalQuoteDecline", {
			key: session.tokenJti,
			throws: false,
		});
		if (!rl.ok) {
			throw new ConvexError({
				code: "RATE_LIMITED",
				retryAfter: rl.retryAfter ?? 10_000,
			});
		}

		const quote = await ctx.db.get(args.quoteId);
		if (!quote) throw new ConvexError({ code: "NOT_FOUND" });
		if (quote.orgId !== session.orgId) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		const client = await ctx.db.get(quote.clientId);
		if (!client || client.orgId !== session.orgId) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		const contact = await ctx.db.get(session.clientContactId);
		if (
			!contact ||
			contact.clientId !== quote.clientId ||
			contact.orgId !== session.orgId
		) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}
		if (quote.latestDocumentId == null) {
			const fallbackDoc = await ctx.db.get(args.expectedDocumentId);
			if (
				!fallbackDoc ||
				fallbackDoc.orgId !== session.orgId ||
				fallbackDoc.documentType !== "quote" ||
				fallbackDoc.documentId !== args.quoteId
			) {
				throw new ConvexError({
					code: "QUOTE_VERSION_STALE",
					latestDocumentId: quote.latestDocumentId,
				});
			}
		} else if (quote.latestDocumentId !== args.expectedDocumentId) {
			throw new ConvexError({
				code: "QUOTE_VERSION_STALE",
				latestDocumentId: quote.latestDocumentId,
			});
		}
		if (quote.status !== "sent") {
			throw new ConvexError({ code: "QUOTE_NOT_PENDING" });
		}
		const document = await ctx.db.get(args.expectedDocumentId);
		if (!document) throw new ConvexError({ code: "NOT_FOUND" });

		const lineItems = await ctx.db
			.query("quoteLineItems")
			.withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
			.collect();
		const lineItemsSnapshot = lineItems
			.slice()
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((li) => ({
				description: li.description,
				quantity: li.quantity,
				unit: li.unit,
				rate: li.rate,
				amount: li.amount,
				sortOrder: li.sortOrder,
			}));

		const normalizedReason =
			args.declineReason && args.declineReason.trim().length > 0
				? args.declineReason.trim().slice(0, 2000)
				: undefined;

		const recomputedTotals = await calculateQuoteTotals(ctx, args.quoteId, {
			discountEnabled: quote.discountEnabled,
			discountAmount: quote.discountAmount,
			discountType: quote.discountType,
			taxEnabled: quote.taxEnabled,
			taxRate: quote.taxRate,
		});

		const now = Date.now();
		const auditId = await ctx.db.insert("quoteApprovals", {
			quoteId: args.quoteId,
			orgId: quote.orgId,
			clientContactId: session.clientContactId,
			action: "declined",
			declineReason: normalizedReason,
			ipAddress: args.ipAddress,
			userAgent: args.userAgent.slice(0, 512),
			documentId: args.expectedDocumentId,
			documentVersion: document.version,
			lineItemsSnapshot,
			subtotalSnapshot: recomputedTotals.subtotal,
			taxSnapshot: recomputedTotals.taxAmount,
			totalSnapshot: recomputedTotals.total,
			termsSnapshot: quote.terms,
			createdAt: now,
		});

		await ctx.db.patch(args.quoteId, {
			status: "declined",
			declinedAt: now,
		});

		const updatedQuote = await ctx.db.get(args.quoteId);
		if (updatedQuote) {
			await AggregateHelpers.updateQuote(
				ctx,
				quote as Doc<"quotes">,
				updatedQuote as Doc<"quotes">,
			);
			await logQuoteActivity(
				ctx,
				updatedQuote,
				client.companyName ?? "Unknown",
				"declined",
			);
		}

		await emitStatusChangeEvent(
			ctx,
			quote.orgId,
			"quote",
			args.quoteId,
			"sent",
			"declined",
			"portal.quotes.decline",
		);

		return {
			auditId,
			action: "declined" as const,
			createdAt: now,
			documentVersion: document.version,
			lineItemsCount: lineItemsSnapshot.length,
			total: recomputedTotals.total,
		};
	},
});
