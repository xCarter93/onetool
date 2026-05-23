import { v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";
import { Doc, Id, TableNames } from "./_generated/dataModel";
import { internal, api } from "./_generated/api";
import { logWebhookSuccess, logWebhookError } from "./lib/webhooks";

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Get an entity by ID, throwing if not found.
 * Used by internal mutations that don't require org validation.
 */
async function fetchEntityOrThrow<T extends TableNames>(
	ctx: MutationCtx,
	table: T,
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
// Internal Mutations
// ============================================================================

/**
 * Update document with BoldSign document ID and initial status.
 * Called after successfully sending a document to BoldSign for signature.
 */
export const updateDocumentWithBoldSign = internalMutation({
	args: {
		documentId: v.id("documents"),
		boldsignDocumentId: v.string(),
		recipients: v.array(
			v.object({
				id: v.optional(v.string()),
				name: v.string(),
				email: v.string(),
				signerType: v.union(v.literal("Signer"), v.literal("CC")),
				signerOrder: v.optional(v.number()),
			})
		),
		viewUrl: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await fetchEntityOrThrow(ctx, "documents", args.documentId, "Document");

		await ctx.db.patch(args.documentId, {
			boldsignDocumentId: args.boldsignDocumentId,
			boldsign: {
				documentId: args.boldsignDocumentId,
				status: "Sent",
				sentTo: args.recipients,
				sentAt: Date.now(),
				viewUrl: args.viewUrl,
			},
		});
	},
});

/**
 * Update quote with the latest document ID and mark as sent.
 * Called after a quote document is sent for signature.
 */
export const updateQuoteLatestDocument = internalMutation({
	args: {
		quoteId: v.id("quotes"),
		documentId: v.id("documents"),
	},
	handler: async (ctx, args) => {
		await fetchEntityOrThrow(ctx, "quotes", args.quoteId, "Quote");

		await ctx.db.patch(args.quoteId, {
			latestDocumentId: args.documentId,
			status: "sent",
			sentAt: Date.now(),
		});
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

		// Track e-signature usage for plan limits on Sent event
		if (typedEventType === "Sent") {
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
		status?: "approved" | "declined" | "expired";
		approvedAt?: number;
		declinedAt?: number;
	} = {};

	switch (eventType) {
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
			// Other events (Sent, Viewed, Signed) don't update quote status
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
		await fetchEntityOrThrow(ctx, "documents", args.documentId, "Document");

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
