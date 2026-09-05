import { v } from "convex/values";
import { internalQuery, MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation } from "./lib/triggers";
import { Doc, Id, TableNames } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { logWebhookSuccess, logWebhookError } from "./lib/webhooks";
import { celebrateQuoteApproved } from "./lib/celebrations";
import { getCurrentUser, getCurrentUserOrgId } from "./lib/auth";
import {
	denyPermission,
	hasAllRecords,
	requireLevel,
} from "./lib/permissions";
import {
	METERS,
	consumeMeter,
	entitlementsFromIdentity,
	getMeterUsage,
} from "./lib/entitlements";
import { isRecordInActorScope } from "./lib/factories";
import { externalIoPool, EXTERNAL_FETCH_RETRY } from "./externalIoPool";
import { resolveMemberUserIds } from "./lib/automationExec/actions";

/**
 * Two ways a Completed event turns out to be a redelivery. A stored signed PDF
 * means the first download finished, and re-downloading would overwrite
 * signedStorageId and orphan that blob. A live `workId` means the first one is
 * still running, so enqueueing again would race it for the same row.
 *
 * Failure clears the workId, so a later redelivery is free to try again. A job
 * that dies without `onComplete` ever firing is the pool's recovery to resolve,
 * not this predicate's.
 */
export function shouldDownloadSignedPdf(document: Doc<"documents">): boolean {
	if (document.signedStorageId !== undefined) return false;
	return document.signedPdfDownload?.workId === undefined;
}

/** Cap on vendor error text copied onto the document row. */
const DOWNLOAD_ERROR_CAP = 1000;

/**
 * Tell the org's admins one time that a signed PDF never arrived. In-app only
 * and deliberately absent from PUSHABLE_TYPES, matching the other failure
 * alerts — this is a next-morning problem, not a 3am buzz.
 *
 * Never throws: an alert hiccup must not roll back the failure patch.
 */
export async function notifySignedPdfDownloadFailed(
	ctx: MutationCtx,
	documentId: Id<"documents">
): Promise<void> {
	try {
		const document = await ctx.db.get(documentId);
		if (!document || document.signedPdfDownload?.notifiedAt) return;
		if (document.documentType !== "quote") return;

		const quoteId = ctx.db.normalizeId("quotes", document.documentId);
		const quote = quoteId ? await ctx.db.get(quoteId) : null;
		const label = quote?.quoteNumber ?? "a quote";

		for (const userId of await resolveMemberUserIds(
			ctx,
			document.orgId,
			true
		)) {
			await ctx.db.insert("notifications", {
				orgId: document.orgId,
				userId,
				notificationType: "boldsign_download_failed",
				title: "Signed document didn't arrive",
				// No user-triggerable retry exists for this download, so don't
				// promise one.
				message: `${label} was signed, but we couldn't retrieve the signed PDF. Contact support and we'll recover it.`,
				entityType: "quote",
				entityId: document.documentId,
				actionUrl: quoteId ? `/quotes/${quoteId}` : "/quotes",
				isRead: false,
				sentVia: "in_app",
				sentAt: Date.now(),
				priority: "high",
			});
		}

		await ctx.db.patch(documentId, {
			signedPdfDownload: {
				...document.signedPdfDownload,
				notifiedAt: Date.now(),
			},
		});
	} catch (err) {
		console.error(
			`[BoldSign] notifySignedPdfDownloadFailed failed for document ${documentId}`,
			err
		);
	}
}

/**
 * Terminal outcome of a pooled signed-PDF download. Success clears the marker;
 * anything else records the failure and tells the org's admins, because a
 * client has signed a quote whose countersigned PDF never made it into the
 * account.
 *
 * Notifies once per document, keyed on `notifiedAt` rather than on an unread
 * notification: the reconcile sweep re-detects the same document every run
 * until it is fixed, so an unread check would re-alert the moment someone
 * reads the last one.
 */
export const onSignedPdfDownloadComplete = internalMutation({
	args: {
		workId: v.string(),
		context: v.object({ documentId: v.id("documents") }),
		result: v.any(),
	},
	handler: async (ctx, { context, result }) => {
		const document = await ctx.db.get(context.documentId);
		if (!document) return;

		if (result?.kind === "success") {
			await ctx.db.patch(document._id, { signedPdfDownload: undefined });
			return;
		}

		const error =
			result?.kind === "failed"
				? String(result.error).slice(0, DOWNLOAD_ERROR_CAP)
				: "Download was cancelled";

		await ctx.db.patch(document._id, {
			signedPdfDownload: {
				failedAt: Date.now(),
				error,
				notifiedAt: document.signedPdfDownload?.notifiedAt,
			},
		});

		await notifySignedPdfDownloadFailed(ctx, document._id);
	},
});

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Get an entity by ID, throwing if not found.
 * Used by internal mutations that don't require org validation.
 */
async function fetchEntityOrThrow<T extends TableNames>(
	ctx: MutationCtx,
	id: Id<T>,
	entityName: string
): Promise<Doc<T>> {
	const entity = await ctx.db.get(id);
	if (!entity) {
		throw new Error(`${entityName} not found: ${id}`);
	}
	return entity;
}

/**
 * BoldSign status type mapping
 */
type BoldSignStatus =
	| "Sent"
	| "Viewed"
	| "Signed"
	| "Completed"
	| "Declined"
	| "Revoked"
	| "Expired";

/**
 * Timestamp field names for BoldSign event types
 */
const BOLDSIGN_TIMESTAMP_FIELDS: Record<BoldSignStatus, string> = {
	Sent: "sentAt",
	Viewed: "viewedAt",
	Signed: "signedAt",
	Completed: "completedAt",
	Declined: "declinedAt",
	Revoked: "revokedAt",
	Expired: "expiredAt",
};

// ============================================================================
// Embedded Sending (in-app BoldSign editor)
// ============================================================================

/**
 * A signer derived server-side from OneTool quote data. The user can still
 * edit/add/remove signers inside the BoldSign editor before sending.
 */
type DerivedSigner = { name: string; email: string; signerOrder: number };

type EmbeddedRequestReady = {
	ok: true;
	quoteTitle: string;
	message: string;
	filename: string;
	pdfStorageId: Id<"_storage">;
	documentId: Id<"documents">;
	signers: DerivedSigner[];
	enableSigningOrder: boolean;
	usage: { used: number; limit: number | null; overCap: boolean };
	// An embedded Draft to resume instead of minting a new document. The edit
	// URL is minted fresh per visit, so this is not gated on link expiry.
	existing: { boldsignDocumentId: string } | null;
};

/**
 * A quote with no generated PDF is an expected state, not a failure, so it is
 * returned as a typed reason alongside the action's limit / no_signer verdicts.
 */
type EmbeddedRequestContext =
	| EmbeddedRequestReady
	| { ok: false; reason: "no_pdf" };

/**
 * Gather everything the embedded-request action needs, org-scoped to the
 * caller. Resolves the latest quote PDF, derives default signers (client
 * primary contact + optional org countersigner, mirroring the retired send
 * drawer), computes the monthly e-sig cap verdict, and surfaces a reusable
 * non-expired Draft for idempotency. Runs in query context (no BoldSign call).
 */
/**
 * Latest PDF document row for a quote (highest version), org-scoped.
 * Mirrors documents.getLatest. Returns null if no PDF has been generated.
 */
async function getLatestQuoteDocument(
	ctx: { db: QueryCtx["db"] },
	quoteId: Id<"quotes">,
	orgId: Id<"organizations">
): Promise<Doc<"documents"> | null> {
	const documents = await ctx.db
		.query("documents")
		.withIndex("by_document", (q) =>
			q.eq("documentType", "quote").eq("documentId", quoteId)
		)
		.collect();
	const orgDocuments = documents.filter((doc) => doc.orgId === orgId);
	if (orgDocuments.length === 0) return null;
	return orgDocuments.reduce((a, b) => {
		if (a.version && b.version) return b.version > a.version ? b : a;
		return b.generatedAt > a.generatedAt ? b : a;
	});
}

/**
 * Resolve the caller's org, load the quote, and enforce quotes-modify plus
 * project/client scope. Every e-sign entry point that reads or mutates a
 * quote's embedded-signature state must go through this — org membership
 * alone is not the boundary (PRD §4.4).
 */
async function authorizeQuoteModify(
	ctx: QueryCtx | MutationCtx,
	quoteId: Id<"quotes">
): Promise<{ quote: Doc<"quotes">; orgId: Id<"organizations"> }> {
	const orgId = await getCurrentUserOrgId(ctx);

	const quote = await ctx.db.get(quoteId);
	if (!quote || quote.orgId !== orgId) {
		throw new Error("Quote does not belong to your organization");
	}

	await requireLevel(ctx, "quotes", "modify");
	if (!(await hasAllRecords(ctx, "quotes"))) {
		const user = await getCurrentUser(ctx);
		const inScope = user
			? await isRecordInActorScope(ctx, user._id, orgId, {
					projectId: quote.projectId,
					clientId: quote.clientId,
				})
			: false;
		if (!inScope) {
			denyPermission({ object: "quotes", scope: true, userId: user?._id, orgId });
		}
	}

	return { quote, orgId };
}

export const getEmbeddedRequestContext = internalQuery({
	args: { quoteId: v.id("quotes") },
	handler: async (ctx, args): Promise<EmbeddedRequestContext> => {
		// Caller identity flows through the action into this internal query.
		const { quote, orgId } = await authorizeQuoteModify(ctx, args.quoteId);

		const latest = await getLatestQuoteDocument(ctx, quote._id, orgId);
		if (!latest) {
			return { ok: false, reason: "no_pdf" };
		}

		// Resume any embedded Draft (idempotent /sign visits). Deliberately not
		// gated on sendUrlExpiresAt: the action mints a fresh edit URL for the
		// existing document, so a lapsed link no longer strands the draft or
		// orphans it behind a newly minted replacement.
		const existing =
			latest.boldsign?.status === "Draft"
				? { boldsignDocumentId: latest.boldsign.documentId }
				: null;

		// Derive default signers (mirrors send-email-sheet.tsx recipient build).
		const signers: DerivedSigner[] = [];
		const countersigner =
			quote.requiresCountersignature && quote.countersignerId
				? await ctx.db.get(quote.countersignerId)
				: null;
		const clientSignerOrder = quote.signingOrder === "org_first" ? 2 : 1;
		const orgSignerOrder = quote.signingOrder === "org_first" ? 1 : 2;

		const primaryContact = await ctx.db
			.query("clientContacts")
			.withIndex("by_primary", (q) =>
				q.eq("clientId", quote.clientId).eq("isPrimary", true)
			)
			.first();
		if (primaryContact?.email) {
			signers.push({
				name: `${primaryContact.firstName} ${primaryContact.lastName}`.trim(),
				email: primaryContact.email,
				signerOrder: countersigner ? clientSignerOrder : 1,
			});
		}
		if (countersigner?.email) {
			signers.push({
				name: countersigner.name || countersigner.email,
				email: countersigner.email,
				signerOrder: orgSignerOrder,
			});
		}

		// Server-side monthly e-sig cap (the real enforcement boundary).
		const esigUsage = await getMeterUsage(
			ctx,
			orgId,
			"esignatures",
			(await entitlementsFromIdentity(ctx)).plan
		);
		const limit = METERS.esignatures.enforce ? esigUsage.limit : null;
		const used = esigUsage.used;

		const quoteLabel = quote.quoteNumber || quote._id.slice(-6);
		return {
			ok: true,
			quoteTitle: `Quote ${quoteLabel}`,
			message: quote.clientMessage || "Please review and sign this quote.",
			filename: `Quote-${quoteLabel}.pdf`,
			pdfStorageId: latest.storageId,
			documentId: latest._id,
			signers,
			enableSigningOrder: signers.length > 1,
			usage: { used, limit, overCap: limit !== null && used >= limit },
			existing,
		};
	},
});

/**
 * Persist a freshly created embedded request (BoldSign Draft) onto the document
 * and point the quote at it. The quote is NOT marked "sent" here — that happens
 * on the Sent webhook once the user actually sends from inside the editor.
 * Overwrites any prior boldsign state on this row (v1 re-prepare; see PRD §14.8).
 */
export const updateDocumentWithEmbeddedRequest = internalMutation({
	args: {
		quoteId: v.id("quotes"),
		documentId: v.id("documents"),
		boldsignDocumentId: v.string(),
		sendUrl: v.string(),
		sendUrlExpiresAt: v.number(),
		sentTo: v.array(
			v.object({
				name: v.string(),
				email: v.string(),
				signerType: v.string(),
				signerOrder: v.optional(v.number()),
			})
		),
	},
	handler: async (ctx, args): Promise<void> => {
		const document = await fetchEntityOrThrow(
			ctx,
			args.documentId,
			"Document"
		);
		const quote = await fetchEntityOrThrow(ctx, args.quoteId, "Quote");

		// Defensive: the caller derives both IDs together, but reject a mismatch
		// so a future caller can't cross-wire latestDocumentId between quotes/orgs.
		if (
			document.orgId !== quote.orgId ||
			document.documentType !== "quote" ||
			document.documentId !== (quote._id as string)
		) {
			throw new Error("Document does not belong to this quote");
		}

		await ctx.db.patch(args.documentId, {
			boldsignDocumentId: args.boldsignDocumentId,
			boldsign: {
				documentId: args.boldsignDocumentId,
				status: "Draft",
				sentTo: args.sentTo,
				viewUrl: args.sendUrl,
				sendUrlExpiresAt: args.sendUrlExpiresAt,
				draftSavedAt: Date.now(),
			},
		});

		await ctx.db.patch(args.quoteId, {
			latestDocumentId: args.documentId,
		});
	},
});

/**
 * The latest quote document's embedded Draft, if one exists — org-scoped.
 * Used by the discard action to decide whether there's anything to clean up.
 */
export const getEmbeddedDraft = internalQuery({
	args: { quoteId: v.id("quotes") },
	returns: v.union(
		v.object({
			documentId: v.id("documents"),
			boldsignDocumentId: v.string(),
		}),
		v.null()
	),
	handler: async (
		ctx,
		args
	): Promise<{
		documentId: Id<"documents">;
		boldsignDocumentId: string;
	} | null> => {
		// Discarding a draft is a quote mutation; same boundary as creating one.
		const { quote, orgId } = await authorizeQuoteModify(ctx, args.quoteId);

		const latest = await getLatestQuoteDocument(ctx, quote._id, orgId);
		if (!latest || latest.boldsign?.status !== "Draft") return null;
		return {
			documentId: latest._id,
			boldsignDocumentId: latest.boldsign.documentId,
		};
	},
});

/**
 * Remove the embedded Draft state from a document after the BoldSign draft has
 * been deleted remotely. Guarded on status + documentId so a Sent webhook that
 * raced ahead of the user's back-navigation wins and the state is kept.
 */
export const clearEmbeddedDraft = internalMutation({
	args: {
		documentId: v.id("documents"),
		boldsignDocumentId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const document = await fetchEntityOrThrow(ctx, args.documentId, "Document");
		if (
			document.boldsign?.status !== "Draft" ||
			document.boldsign.documentId !== args.boldsignDocumentId
		) {
			return null;
		}
		await ctx.db.patch(args.documentId, {
			boldsign: undefined,
			boldsignDocumentId: undefined,
		});
		return null;
	},
});

/**
 * Stamp the Draft's save time after the user clicks Save & Close in the editor.
 * The Signatures tab shows this as "Saved <time>"; without it the tab falls
 * back to the PDF's generatedAt, which can be weeks stale.
 */
export const markEmbeddedDraftSaved = mutation({
	args: { quoteId: v.id("quotes") },
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const { quote, orgId } = await authorizeQuoteModify(ctx, args.quoteId);

		const latest = await getLatestQuoteDocument(ctx, quote._id, orgId);
		// Only a live Draft has a save time; a racing Sent webhook wins.
		if (!latest || latest.boldsign?.status !== "Draft") return null;

		await ctx.db.patch(latest._id, {
			boldsign: { ...latest.boldsign, draftSavedAt: Date.now() },
		});
		return null;
	},
});

/**
 * Handle BoldSign webhook events.
 * Updates document status and cascades changes to associated quotes.
 *
 * Supported events: Sent, Viewed, Signed, Completed, Declined, Revoked, Expired
 */
export const handleWebhook = internalMutation({
	args: {
		boldsignDocumentId: v.string(),
		eventType: v.string(),
		eventTimestamp: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const SERVICE = "BoldSign";
		const { boldsignDocumentId, eventType } = args;

		// Find document by BoldSign document ID using index
		const document = await ctx.db
			.query("documents")
			.withIndex("by_boldsign_documentId", (q) =>
				q.eq("boldsignDocumentId", boldsignDocumentId)
			)
			.first();

		if (!document) {
			logWebhookError(
				SERVICE,
				eventType,
				`Document not found for BoldSign ID: ${boldsignDocumentId}`,
				boldsignDocumentId
			);
			throw new Error(
				`Document not found for BoldSign document ID: ${boldsignDocumentId}`
			);
		}

		if (!document.boldsign) {
			logWebhookError(
				SERVICE,
				eventType,
				`Document missing BoldSign data`,
				boldsignDocumentId
			);
			throw new Error(
				`Document missing BoldSign data for BoldSign document ID: ${boldsignDocumentId}`
			);
		}

		const timestamp = args.eventTimestamp || Date.now();

		// Validate event type and get timestamp field
		const validEventTypes: BoldSignStatus[] = [
			"Sent",
			"Viewed",
			"Signed",
			"Completed",
			"Declined",
			"Revoked",
			"Expired",
		];

		if (!validEventTypes.includes(eventType as BoldSignStatus)) {
			console.log(`[${SERVICE}] Unhandled event type: ${eventType}`);
			return;
		}

		const typedEventType = eventType as BoldSignStatus;
		const timestampField = BOLDSIGN_TIMESTAMP_FIELDS[typedEventType];

		// Build the updated boldsign object
		const updatedBoldsign = {
			...document.boldsign,
			status: typedEventType,
			[timestampField]: timestamp,
		};

		// Count usage only on the genuine Draft→Sent transition. BoldSign
		// publishes no redelivery policy, so this guards defensively: if a "Sent"
		// is ever replayed it can't double-count and wrongly trip the cap.
		if (typedEventType === "Sent" && document.boldsign.status === "Draft") {
			await consumeMeter(ctx, document.orgId, "esignatures");
		}

		// Update the document
		await ctx.db.patch(document._id, {
			boldsign: updatedBoldsign,
		});

		// Handle quote-specific updates if document is associated with a quote
		if (document.documentType === "quote") {
			await handleQuoteStatusUpdate(
				ctx,
				document,
				typedEventType,
				timestamp,
				boldsignDocumentId
			);
		}

		logWebhookSuccess(SERVICE, eventType, boldsignDocumentId);
	},
});

/**
 * Handle quote status updates based on BoldSign events.
 * Internal helper for handleWebhook.
 */
async function handleQuoteStatusUpdate(
	ctx: MutationCtx,
	document: Doc<"documents">,
	eventType: BoldSignStatus,
	timestamp: number,
	boldsignDocumentId: string
): Promise<void> {
	const quote = await ctx.db.get(document.documentId as Id<"quotes">);

	if (!quote) {
		console.warn(
			`[BoldSign] Quote not found for document ${document._id} with documentId: ${document.documentId}`
		);
		return;
	}

	const quoteUpdates: {
		status?: "sent" | "approved" | "declined" | "expired";
		sentAt?: number;
		approvedAt?: number;
		declinedAt?: number;
	} = {};

	switch (eventType) {
		case "Sent":
			// Authoritative "quote sent" transition — the embedded flow only
			// sends once the user clicks Send inside the BoldSign editor. Guard
			// against a duplicate/out-of-order Sent regressing a terminal state.
			if (
				quote.status === "approved" ||
				quote.status === "declined" ||
				quote.status === "expired"
			) {
				return;
			}
			quoteUpdates.status = "sent";
			if (!quote.sentAt) quoteUpdates.sentAt = timestamp;
			break;

		case "Completed":
			quoteUpdates.status = "approved";
			quoteUpdates.approvedAt = timestamp;

			// Pool-routed rather than a raw scheduler kick: a scheduled action is
			// at-most-once, so a dropped container silently loses a signed legal
			// document. The pool's job record survives and retries.
			if (shouldDownloadSignedPdf(document)) {
				console.log(
					`[BoldSign] Enqueueing signed document download for quote ${quote._id}`
				);
				const workId = await externalIoPool.enqueueAction(
					ctx,
					internal.boldsignActions.downloadCompletedDocument,
					{ documentId: document._id, boldsignDocumentId },
					{
						retry: EXTERNAL_FETCH_RETRY,
						onComplete: internal.boldsign.onSignedPdfDownloadComplete,
						// onComplete receives only this context, never the action's
						// args, so the row to mark has to travel here.
						context: { documentId: document._id },
					}
				);
				await ctx.db.patch(document._id, {
					signedPdfDownload: { workId },
				});
			}
			break;

		case "Declined":
			quoteUpdates.status = "declined";
			quoteUpdates.declinedAt = timestamp;
			break;

		case "Expired":
			quoteUpdates.status = "expired";
			break;

		default:
			// Viewed, Signed, and Revoked don't change quote status
			return;
	}

	if (Object.keys(quoteUpdates).length > 0) {
		await ctx.db.patch(quote._id, quoteUpdates);
		if (quoteUpdates.status === "approved") {
			const updatedQuote = await ctx.db.get(quote._id);
			if (updatedQuote) {
				await celebrateQuoteApproved(ctx, updatedQuote);
			}
		}
	}
}

/**
 * Update document with signed PDF storage ID.
 * Called after downloading the completed/signed document from BoldSign.
 */
export const updateDocumentWithSignedPdf = internalMutation({
	args: {
		documentId: v.id("documents"),
		boldsignDocumentId: v.string(),
		signedStorageId: v.id("_storage"),
	},
	handler: async (ctx, args) => {
		const document = await fetchEntityOrThrow(ctx, args.documentId, "Document");

		// fetchEntityOrThrow is existence-only, so pin the pair here: a PDF
		// downloaded for one BoldSign document can never land on another row.
		if (document.boldsignDocumentId !== args.boldsignDocumentId) {
			throw new Error(
				`Document ${args.documentId} is not linked to BoldSign document ${args.boldsignDocumentId}`
			);
		}

		await ctx.db.patch(args.documentId, {
			signedStorageId: args.signedStorageId,
		});

		console.log(
			`[BoldSign] Document ${args.documentId} updated with signed storage ID: ${args.signedStorageId}`
		);
	},
});
