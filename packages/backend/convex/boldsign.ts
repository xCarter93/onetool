import { v } from "convex/values";
import {
	internalMutation,
	internalQuery,
	MutationCtx,
	QueryCtx,
} from "./_generated/server";
import { Doc, Id, TableNames } from "./_generated/dataModel";
import { internal, api } from "./_generated/api";
import { logWebhookSuccess, logWebhookError } from "./lib/webhooks";
import { getCurrentUserOrgId } from "./lib/auth";
import { hasPremiumAccess } from "./lib/permissions";
import {
	computeEsignaturesSentThisMonth,
	FREE_ESIGNATURES_PER_MONTH,
} from "./usage";

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

type EmbeddedRequestContext = {
	quoteTitle: string;
	message: string;
	filename: string;
	pdfStorageId: Id<"_storage">;
	documentId: Id<"documents">;
	signers: DerivedSigner[];
	enableSigningOrder: boolean;
	usage: { used: number; limit: number | null; overCap: boolean };
	// A non-expired embedded Draft to reuse instead of minting a new one.
	existing: { sendUrl: string; boldsignDocumentId: string } | null;
};

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

export const getEmbeddedRequestContext = internalQuery({
	args: { quoteId: v.id("quotes") },
	handler: async (ctx, args): Promise<EmbeddedRequestContext> => {
		const orgId = await getCurrentUserOrgId(ctx);

		const quote = await ctx.db.get(args.quoteId);
		if (!quote || quote.orgId !== orgId) {
			throw new Error("Quote does not belong to your organization");
		}

		const latest = await getLatestQuoteDocument(ctx, quote._id, orgId);
		if (!latest) {
			throw new Error("No PDF has been generated for this quote yet");
		}

		// Reuse a non-expired embedded Draft (idempotent /sign visits).
		const now = Date.now();
		const existing =
			latest.boldsign?.status === "Draft" &&
			latest.boldsign.viewUrl &&
			latest.boldsign.sendUrlExpiresAt &&
			latest.boldsign.sendUrlExpiresAt > now
				? {
						sendUrl: latest.boldsign.viewUrl,
						boldsignDocumentId: latest.boldsign.documentId,
					}
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
		const organization = await ctx.db.get(orgId);
		if (!organization) throw new Error("Organization not found");
		const limit = (await hasPremiumAccess(ctx))
			? null
			: FREE_ESIGNATURES_PER_MONTH;
		const used = await computeEsignaturesSentThisMonth(ctx, organization, orgId);

		const quoteLabel = quote.quoteNumber || quote._id.slice(-6);
		return {
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
		const orgId = await getCurrentUserOrgId(ctx);

		const quote = await ctx.db.get(args.quoteId);
		if (!quote || quote.orgId !== orgId) {
			throw new Error("Quote does not belong to your organization");
		}

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
		// redelivers webhooks (at-least-once), so guarding on the current status
		// stops a replayed "Sent" from double-counting and wrongly tripping the cap.
		if (typedEventType === "Sent" && document.boldsign.status === "Draft") {
			await ctx.scheduler.runAfter(
				0,
				internal.usage.incrementEsignatureCount,
				{ orgId: document.orgId }
			);
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

			// Schedule signed document download if quote has a project
			if (quote.projectId) {
				console.log(
					`[BoldSign] Scheduling signed document download for quote ${quote._id} (project: ${quote.projectId})`
				);
				await ctx.scheduler.runAfter(
					0,
					internal.boldsign.triggerDocumentDownload,
					{
						documentId: document._id,
						boldsignDocumentId,
					}
				);
			} else {
				console.log(
					`[BoldSign] Skipping download for quote ${quote._id} - no project linked`
				);
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
	}
}

/**
 * Update document with signed PDF storage ID.
 * Called after downloading the completed/signed document from BoldSign.
 */
export const updateDocumentWithSignedPdf = internalMutation({
	args: {
		documentId: v.id("documents"),
		signedStorageId: v.id("_storage"),
	},
	handler: async (ctx, args) => {
		await fetchEntityOrThrow(ctx, args.documentId, "Document");

		await ctx.db.patch(args.documentId, {
			signedStorageId: args.signedStorageId,
		});

		console.log(
			`[BoldSign] Document ${args.documentId} updated with signed storage ID: ${args.signedStorageId}`
		);
	},
});

/**
 * Trigger download of completed/signed document from BoldSign.
 * Schedules the download action to run immediately.
 */
export const triggerDocumentDownload = internalMutation({
	args: {
		documentId: v.id("documents"),
		boldsignDocumentId: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.scheduler.runAfter(
			0,
			api.boldsignActions.downloadCompletedDocument,
			{
				documentId: args.documentId,
				boldsignDocumentId: args.boldsignDocumentId,
			}
		);
	},
});
