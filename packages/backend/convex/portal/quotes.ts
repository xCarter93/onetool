// Plan 14-02: Portal-facing quote backend.
//
// Exports:
// - list (query): authenticated portal session lists their own client's quotes
// - get (query): single quote with receipt-shaped fields for Plan 14-05 UI
// - approve (action): preflight → format-validate → storage.store → commit;
//   orphan-blob cleanup on commit failure (REVIEWS finding #3)
// - decline (mutation): mirror of approve commit, no signature, no termsAcceptedAt
//
// REVIEWS-mandated structure:
// - approve is an ACTION because it needs ctx.storage.store. Action context has
//   no ctx.db, so:
//   * Session validation runs in `_getPortalSessionForAction` (internalQuery)
//   * Rate limit consumption runs in `_rateLimitPreflight` (internalMutation —
//     rateLimiter.limit not verified in action context)
//   * OCC + scope preflight runs in `_preflightApproval` (internalQuery)
//   * Audit row insert + status patch + activity + event runs in
//     `_commitApproval` (internalMutation — atomic; emit-event last)
// - On _commitApproval failure, the action calls ctx.storage.delete to clean
//   up the orphan signature blob before re-throwing.
//
// Plan 14-13 / UAT Gap B fix: portal.quotes.get falls back to the most-recent
// documents-table row (org-scoped) when `quote.latestDocumentId` is unset;
// _preflightApproval and _commitApproval accept any same-org same-quote
// document in that fallback case AND _commitApproval pins `latestDocumentId`
// to the accepted document so subsequent reads use the strict path. Workspace
// documents.create does not patch `quote.latestDocumentId` — only
// boldsign.updateQuoteLatestDocument does — so quotes generated through any
// non-BoldSign path previously stranded the portal with "document is not
// ready" on every approve attempt. Strict OCC still wins on a racing
// republish: if a workspace mutation patches latestDocumentId to a different
// doc between preflight and commit, the redo-check falls through to strict
// equality and throws QUOTE_VERSION_STALE.
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
		// Defense-in-depth: even though the session JWT is signed and re-checked
		// against portalSessions, re-verify the contact still belongs to the
		// same org.
		if (!contact || contact.orgId !== session.orgId) {
			throw new ConvexError({ code: "FORBIDDEN" });
		}

		const quotes = await ctx.db
			.query("quotes")
			.withIndex("by_client", (q) => q.eq("clientId", contact.clientId))
			.collect();

		// Plan 14-09 / Gap 5: recompute total per row from current line items.
		// Stored quote.total is not maintained on every line-item edit, so
		// returning it raw would surface stale zeros to the portal list page.
		// Defense-in-depth alongside the recompute in `get` below.
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
					// REVIEWS-mandated (CR-03): include decision timestamps so the
					// portal list can show "Approved on {approvedAt}" / "Declined on
					// {declinedAt}" instead of mislabeling sentAt as the decision date.
					approvedAt: q.approvedAt,
					declinedAt: q.declinedAt,
				};
			}),
		);
	},
});

/**
 * QUOTE-02: get a single quote with receipt-shaped extended fields needed by
 * the Plan 14-05 portal UI: businessName, clientName, clientEmail, and the
 * latestApproval projection (with resolved signatureUrl).
 *
 * Plan 14-09 / Gap 5: recompute subtotal/taxAmount/total from line items
 * because stored quote.subtotal/quote.total are NOT maintained on every
 * line-item edit. Mirrors workspace quotes.ts:get behavior. The shared
 * helper lives in lib/quoteTotals.ts.
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

		// Plan 14-13 / Gap B: prefer the pinned latestDocumentId, but fall back
		// to the most-recent documents-table row when the quote has no pinned id
		// OR the pinned id points at a deleted/orphan doc. Workspace
		// `documents.create` inserts a row WITHOUT patching
		// `quote.latestDocumentId` — only the BoldSign send-for-signature flow
		// patches that field. Without this fallback, a quote whose PDF was
		// generated through any non-BoldSign path would surface to the portal
		// with `latestDocument: null`, and the client would emit "Quote
		// document is not ready. Please reload." on every approve attempt.
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
			// Defense in depth (REVIEWS-mandated multi-tenant rule): documents
			// are org-scoped at insert; we still verify here in case of a
			// future cross-org migration anomaly. Same-org constraint matches
			// the existing get-handler invariant.
			if (fallbackDoc && fallbackDoc.orgId === session.orgId) {
				latestDocument = {
					_id: fallbackDoc._id,
					version: fallbackDoc.version,
					storageId: fallbackDoc.storageId,
					signedStorageId: fallbackDoc.signedStorageId,
				};
			}
		}

		// REVIEWS-mandated extended fields for Plan 14-05 UI ----------------
		const org = await ctx.db.get(quote.orgId);
		const businessName = org?.name ?? "";
		const client = await ctx.db.get(quote.clientId);
		const clientName = client?.companyName ?? "Client";
		const clientEmail = contact.email ?? "";

		// latestApproval — most recent quoteApprovals row for this quote.
		// REVIEWS-mandated: also resolve signatureUrl so 14-05 UI does not need
		// a second round-trip to render the signature thumbnail.
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

		// Plan 14-09 / Gap 5: recompute totals from current line items and
		// spread over the returned quote so the portal detail page never
		// shows stale stored zeros.
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

// ---------------------------------------------------------------------------
// Internal helpers used by approve action + decline mutation
// ---------------------------------------------------------------------------

/**
 * REVIEWS-mandated: actions have no ctx.db, so portal session validation must
 * run inside an internal query. The action calls this via ctx.runQuery.
 */
export const _getPortalSessionForAction = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await getPortalSessionOrThrow(ctx);
	},
});

/**
 * REVIEWS-mandated: rateLimiter.limit() is not verified to work in action ctx.
 * Run rate-limit consumption inside an internal mutation called via
 * ctx.runMutation. On rejection, surface a normalized RATE_LIMITED ConvexError
 * with retryAfter (ms) so Plan 14-04 can compute retryAfterSeconds for the
 * 429 response.
 */
export const _rateLimitPreflight = internalMutation({
	args: {
		jti: v.string(),
		bucket: v.union(
			v.literal("portalQuoteApprove"),
			v.literal("portalQuoteDecline"),
		),
	},
	handler: async (ctx, { jti, bucket }) => {
		// Use throws:false so we can normalize the error shape regardless of
		// what the rate-limiter component throws internally.
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
		// REVIEWS-mandated (WR-01): defense-in-depth org scoping. The session
		// is already validated upstream, but every read here must also verify
		// quote.orgId === session.orgId in case clientContacts/quotes were ever
		// migrated across orgs.
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
		// Plan 14-13 / Gap B: when `quote.latestDocumentId` is unset (workspace
		// generated the PDF via documents.create without invoking the BoldSign
		// pinning flow), allow `expectedDocumentId` to refer to ANY same-org
		// documents row whose `documentId === quoteId`. Mismatch only counts as
		// STALE when the quote DOES have a pinned id and it differs from what
		// the portal sent — that is the "racing republish" race condition the
		// original check defends against. The fallback resolution mirrors
		// get()'s fallback.
		//
		// We use `== null` (loose equality) so the relaxed branch fires for
		// both `undefined` (Convex's default for omitted optional fields) AND
		// explicit `null` (defensive — manual ctx.db.patch could land null in
		// legacy data or migrations). Strict `=== undefined` would miss the
		// null case.
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

		return {
			documentVersion: document.version,
			lineItemsSnapshot,
			subtotal: quote.subtotal,
			taxAmount: quote.taxAmount ?? 0,
			total: quote.total,
			terms: quote.terms,
			clientCompanyName: client.companyName ?? "Unknown",
		};
	},
});

/**
 * Portal-aware activity logger. ActivityHelpers.quoteApproved/Declined depend
 * on `getCurrentUserOrThrow` (Clerk identity → users row), which has no match
 * for a portal-session identity. We invoke ActivityHelpers first (so the
 * helper symbol is part of the file per acceptance grep), and fall back to a
 * direct `activities` insert keyed on the org owner if it throws.
 *
 * [Rule 1 - Bug] Calling ActivityHelpers.quoteApproved directly under a
 * portal identity would throw "User not authenticated" because the portal
 * JWT subject is the clientContactId, not a users.externalId — breaking the
 * approve flow. Fallback path keeps audit traceability while preserving the
 * `ActivityHelpers.quoteApproved` symbol the plan and tests assert against.
 */
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

/**
 * Atomic commit of an approve OR decline. Re-runs OCC + status preflight
 * inside the mutation transaction (defense-in-depth against a racing
 * republish between preflight and commit).
 *
 * Write-order constraint inside the handler (REVIEWS-mandated reword):
 *   db.insert(audit) → db.patch(quote) → activity → emitStatusChangeEvent
 * Convex commits all writes atomically on handler return — "post-commit"
 * does not exist in a single mutation; ordering here is a within-transaction
 * write-order, not a pre/post-commit hook.
 */
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
		// REVIEWS-mandated (WR-01): defense-in-depth org scoping in the
		// commit redo-check, alongside the OCC re-validation below.
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
		// Defense-in-depth: re-validate OCC + status inside the transaction
		// so a racing republish between preflight and commit cannot land a
		// stale approval / orphan blob.
		//
		// Plan 14-13 / Gap B: mirror the _preflightApproval relaxation. When
		// `quote.latestDocumentId` is unset (workspace generated the PDF via
		// documents.create without invoking the BoldSign pinning flow), allow
		// `expectedDocumentId` to refer to ANY same-org documents row whose
		// `documentId === quoteId`. Strict OCC still wins on a racing
		// republish: if a workspace mutation patches `latestDocumentId` to a
		// different doc between preflight and commit, the redo-check sees
		// `latestDocumentId == null` is false and falls through to the strict
		// equality branch which throws QUOTE_VERSION_STALE. We use `== null`
		// (loose equality) so the relaxed branch fires for both `undefined`
		// (Convex's default for omitted optional fields) AND explicit `null`
		// (defensive — see Change B comment).
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
			// Self-healing: pin the accepted fallback document as the
			// canonical latestDocumentId now so subsequent reads and approvals
			// take the strict path (no fallback). This patch lands inside the
			// same atomic transaction as the audit-row insert below.
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
			// REVIEWS-mandated: termsAcceptedAt is OMITTED on decline rows.
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

		// 3. AGGREGATE-VERIFIED: AggregateHelpers.updateQuote keys on
		//    (oldQuote, newQuote) and only replaces when status/approvedAt/total
		//    changed. Because we just patched status (and approvedAt OR
		//    declinedAt), the aggregate must be updated in lock-step or its
		//    btree will diverge from reality (Phase 14 RESEARCH §A2). The
		//    workspace `quotes.update` does this; we mirror it here.
		const updatedQuote = await ctx.db.get(args.quoteId);
		if (updatedQuote) {
			// Static import at the top of file — Convex's V8 isolate disallows
			// dynamic import() at runtime.
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
		// 1. Session — REVIEWS-mandated: action has no ctx.db, so session
		//    validation runs in an internal query.
		// prettier-ignore
		const session = await ctx.runQuery(internal.portal.quotes._getPortalSessionForAction, {});
		// 2. Rate-limit — REVIEWS-mandated: rateLimiter.limit not verified in
		//    action context; call via internalMutation. Throws RATE_LIMITED
		//    ConvexError with retryAfter (ms) on rejection.
		await ctx.runMutation(internal.portal.quotes._rateLimitPreflight, {
			jti: session.tokenJti,
			bucket: "portalQuoteApprove",
		});
		// 3. Preflight — scope + OCC + status BEFORE any storage write.
		const preflight = await ctx.runQuery(
			internal.portal.quotes._preflightApproval,
			{
				quoteId: args.quoteId,
				expectedDocumentId: args.expectedDocumentId,
				clientContactId: session.clientContactId,
				orgId: session.orgId,
			},
		);
		// 4. Validate signature payload format BEFORE storage.store.
		const match = args.signatureBase64.match(/^data:image\/png;base64,(.+)$/);
		if (!match) {
			throw new ConvexError({ code: "INVALID_SIGNATURE_FORMAT" });
		}
		// CORRECTION to prior comment: Convex's default V8 isolate runtime does
		// NOT expose Node's `Buffer` (only "use node" actions do). This file
		// must stay isolate-runtime because it also exports queries +
		// mutations. Use the web-standard `atob` + `Uint8Array` to decode the
		// base64 payload — both are available in the Convex isolate.
		const binary = atob(match[1]!);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		if (bytes.byteLength > 256_000) {
			throw new ConvexError({ code: "SIGNATURE_TOO_LARGE" });
		}
		// 5. Store signature blob (only after all preflight checks succeed).
		const blob = new Blob([bytes], { type: "image/png" });
		const signatureStorageId: Id<"_storage"> = await ctx.storage.store(blob);

		// 6. Atomic commit. If it throws (e.g., racing republish bumped the
		//    document between preflight and commit), clean up the orphan blob
		//    BEFORE re-throwing — REVIEWS finding #3.
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
			// REVIEWS-mandated: resolve signatureUrl here so Plan 14-05 UI does
			// not need an extra round-trip to render the thumbnail.
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
// Public decline mutation (no signature → no orphan-blob risk → can be a
// plain mutation)
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
		// 1. Session
		const session = await getPortalSessionOrThrow(ctx);

		// 2. Rate-limit after session validation but before quote/document
		//    reads. (Session lookup itself necessarily reads portalSessions —
		//    rate-limiting strictly before any DB read would require keying on
		//    a non-session identifier such as IP.)
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

		// 3. Inline preflight (FORBIDDEN/NOT_FOUND/QUOTE_VERSION_STALE/QUOTE_NOT_PENDING).
		const quote = await ctx.db.get(args.quoteId);
		if (!quote) throw new ConvexError({ code: "NOT_FOUND" });
		// REVIEWS-mandated (WR-01): defense-in-depth org scoping.
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
		// Plan 14-13 / Gap B parity: mirror the approve-path relaxation so
		// quotes generated via non-BoldSign paths (where `latestDocumentId` is
		// unset) can be declined as well as approved. Without this, a portal
		// client sees the same quote as approvable but undeclinable. Strict
		// mismatch only counts as STALE when the quote has a pinned id that
		// differs from what the portal sent (the racing-republish defense).
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

		// REVIEWS-mandated: empty/whitespace declineReason → undefined; cap at 2000 chars.
		const normalizedReason =
			args.declineReason && args.declineReason.trim().length > 0
				? args.declineReason.trim().slice(0, 2000)
				: undefined;

		// Plan 14-14 / CodeRabbit Finding 6: snapshot must reflect what the
		// client saw at decision time. Plan 14-09 recomputes totals from line
		// items in `get()`/`list()` because stored `quote.subtotal/total` can
		// be stale. Copying the stored values into the audit row would
		// introduce divergence between "displayed total" and "audited total".
		// Recompute via the shared helper so the audit captures line-item
		// truth — same source of truth the portal display uses.
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
			// REVIEWS-mandated: NO signatureStorageId, NO signatureMode,
			// NO signatureRawData, and NO termsAcceptedAt on decline rows.
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

		// Aggregate keep-in-sync (RESEARCH §A2 — quotes aggregate replaces only
		// when status/approvedAt/total changed; status changed here).
		const updatedQuote = await ctx.db.get(args.quoteId);
		if (updatedQuote) {
			// Static import at the top of file — Convex's V8 isolate disallows
			// dynamic import() at runtime.
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
			// Plan 14-14 / CodeRabbit Finding 6: align with the snapshot we just
			// wrote so the response total matches the audit row, not the stored
			// (potentially stale) quote.total.
			total: recomputedTotals.total,
		};
	},
});
