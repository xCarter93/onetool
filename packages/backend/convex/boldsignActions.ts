"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { DocumentApi, DocumentSigner, EmbeddedDocumentRequest } from "boldsign";

// ============================================================================
// BoldSign API Configuration
// ============================================================================

const LOG_PREFIX = "[BoldSign]";

/**
 * Get the BoldSign API key from environment, throwing if not configured.
 */
function getBoldSignApiKey(): string {
	const apiKey = process.env.BOLDSIGN_API_KEY;
	if (!apiKey) {
		throw new Error(
			"BOLDSIGN_API_KEY is not configured. Please add it to your environment variables."
		);
	}
	return apiKey;
}

/**
 * Initialize and configure the BoldSign DocumentApi client.
 */
function createDocumentApi(): InstanceType<typeof DocumentApi> {
	const apiKey = getBoldSignApiKey();
	const documentApi = new DocumentApi();
	documentApi.setApiKey(apiKey);
	return documentApi;
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Result of creating an embedded BoldSign send request.
 * Annotated explicitly to avoid the _generated/api type cycle.
 */
type CreateEmbeddedResult =
	// `reused` = an existing draft (e.g. Save & Close) was resumed rather than
	// minted; the client must not discard it on back-navigation.
	| { ok: true; sendUrl: string; boldsignDocumentId: string; reused: boolean }
	| { ok: false; reason: "limit"; used: number; limit: number }
	| { ok: false; reason: "no_signer" };

/**
 * Create an embedded BoldSign sending request for a quote's latest PDF and
 * return a sendUrl to render in an iframe. The user places/confirms fields and
 * edits recipients inside BoldSign's editor, then clicks Send themselves.
 *
 * Replaces the old one-shot `sendDocumentForSignature`. The quote is not marked
 * "sent" here — that transition happens on the Sent webhook once the user
 * actually sends. Enforces the free-plan monthly e-sig cap server-side.
 */
export const createEmbeddedSignatureRequest = action({
	args: {
		quoteId: v.id("quotes"),
		// The caller's window origin, used only to build the in-iframe
		// post-send redirect fallback (postMessage is the primary signal).
		origin: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<CreateEmbeddedResult> => {
		// Org-scoped context: latest PDF, derived signers, cap verdict, reusable Draft.
		const context = await ctx.runQuery(
			internal.boldsign.getEmbeddedRequestContext,
			{ quoteId: args.quoteId }
		);

		// Enforce the monthly cap before creating any BoldSign draft.
		if (context.usage.overCap) {
			return {
				ok: false,
				reason: "limit",
				used: context.usage.used,
				limit: context.usage.limit ?? 0,
			};
		}

		// Reuse a still-valid embedded Draft (idempotent /sign revisits).
		if (context.existing) {
			return {
				ok: true,
				sendUrl: context.existing.sendUrl,
				boldsignDocumentId: context.existing.boldsignDocumentId,
				reused: true,
			};
		}

		// Need at least one signer with an email to send.
		if (context.signers.length === 0) {
			return { ok: false, reason: "no_signer" };
		}

		// Download the stored quote PDF into a Node buffer.
		const blob = await ctx.storage.get(context.pdfStorageId);
		if (!blob) {
			throw new Error("Stored quote PDF not found");
		}
		const pdfBuffer = Buffer.from(await blob.arrayBuffer());

		// Build the embedded request. Invisible text tags in the PDF pre-place
		// the signature/date fields; land on FillingPage (edit recipients) with
		// navigation to PreparePage (adjust fields) before sending.
		const request = new EmbeddedDocumentRequest();
		request.title = context.quoteTitle;
		request.message = context.message;
		request.files = [
			{
				value: pdfBuffer,
				options: {
					filename: context.filename,
					contentType: "application/pdf",
				},
			},
		];
		request.signers = context.signers.map((s) => {
			const signer = new DocumentSigner();
			signer.name = s.name;
			signer.emailAddress = s.email;
			signer.signerOrder = s.signerOrder;
			signer.signerType = DocumentSigner.SignerTypeEnum.Signer;
			return signer;
		});
		request.useTextTags = true;
		request.enableSigningOrder = context.enableSigningOrder;
		request.sendViewOption =
			EmbeddedDocumentRequest.SendViewOptionEnum.FillingPage;
		request.showNavigationButtons = true;
		request.showSendButton = true;
		request.showToolbar = true;
		request.showSaveButton = true;
		request.disableEmails = false;

		const sendUrlExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
		request.sendLinkValidTill = new Date(sendUrlExpiresAt);
		// Post-send redirect fallback (postMessage is the primary signal). The
		// redirect fires in the sender's own session, so we normalize via URL()
		// and require http(s) rather than reflect a raw caller string.
		if (args.origin) {
			try {
				const parsed = new URL(args.origin);
				if (parsed.protocol === "https:" || parsed.protocol === "http:") {
					request.redirectUrl = `${parsed.origin}/quotes/${args.quoteId}`;
				}
			} catch {
				// Ignore a malformed caller-provided origin.
			}
		}

		const documentApi = createDocumentApi();
		console.log(
			`${LOG_PREFIX} Creating embedded request with ${context.signers.length} signer(s)`
		);
		const response =
			await documentApi.createEmbeddedRequestUrlDocument(request);

		if (!response.sendUrl || !response.documentId) {
			throw new Error("BoldSign did not return an embedded send URL");
		}

		// Persist the Draft (boldsignDocumentId is required for webhook correlation).
		await ctx.runMutation(internal.boldsign.updateDocumentWithEmbeddedRequest, {
			quoteId: args.quoteId,
			documentId: context.documentId,
			boldsignDocumentId: response.documentId,
			sendUrl: response.sendUrl,
			sendUrlExpiresAt,
			sentTo: context.signers.map((s) => ({
				name: s.name,
				email: s.email,
				signerType: "Signer",
				signerOrder: s.signerOrder,
			})),
		});

		return {
			ok: true,
			sendUrl: response.sendUrl,
			boldsignDocumentId: response.documentId,
			reused: false,
		};
	},
});

/**
 * Discard an abandoned embedded Draft: the user opened the BoldSign editor but
 * navigated back without sending. Deletes the draft on BoldSign first and only
 * clears our local state when that succeeds (a 404 counts — already gone), so
 * a document the user actually sent moments earlier is never orphaned locally:
 * the delete call fails for in-progress documents and the Sent webhook wins.
 * Deleting a draft fires no BoldSign webhooks and no signer emails exist yet.
 */
export const discardEmbeddedSignatureRequest = action({
	args: { quoteId: v.id("quotes") },
	handler: async (ctx, args): Promise<{ discarded: boolean }> => {
		const draft = await ctx.runQuery(internal.boldsign.getEmbeddedDraft, {
			quoteId: args.quoteId,
		});
		if (!draft) return { discarded: false };

		const documentApi = createDocumentApi();
		try {
			await documentApi.deleteDocument(draft.boldsignDocumentId, true);
		} catch (error) {
			const status = (error as { response?: { status?: number } }).response
				?.status;
			if (status !== 404) {
				console.warn(`${LOG_PREFIX} Draft delete failed; keeping local state`, {
					boldsignDocumentId: draft.boldsignDocumentId,
					status,
					error: error instanceof Error ? error.message : String(error),
				});
				return { discarded: false };
			}
		}

		await ctx.runMutation(internal.boldsign.clearEmbeddedDraft, {
			documentId: draft.documentId,
			boldsignDocumentId: draft.boldsignDocumentId,
		});
		console.log(`${LOG_PREFIX} Abandoned draft discarded`, {
			boldsignDocumentId: draft.boldsignDocumentId,
		});
		return { discarded: true };
	},
});

// Action to download completed/signed document from BoldSign
export const downloadCompletedDocument = action({
	args: {
		documentId: v.id("documents"),
		boldsignDocumentId: v.string(),
	},
	handler: async (ctx, args) => {
		// Validate API key is configured
		const apiKey = getBoldSignApiKey();

		console.log(`${LOG_PREFIX} Downloading completed document`, {
			boldsignDocumentId: args.boldsignDocumentId,
		});

		try {
			// Download the signed PDF from BoldSign API
			const downloadUrl = `https://api.boldsign.com/v1/document/download?documentId=${args.boldsignDocumentId}`;

			// Set up fetch timeout using AbortController
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

			let response;
			try {
				response = await fetch(downloadUrl, {
					method: "GET",
					headers: {
						accept: "application/pdf, application/octet-stream",
						"X-API-KEY": apiKey,
					},
					signal: controller.signal,
				});
			} catch (error) {
				clearTimeout(timeoutId);
				if ((error as Error).name === "AbortError") {
					throw new Error(
						"Request to download document from BoldSign timed out after 10 seconds"
					);
				}
				throw error;
			}

			// Clear timeout on success
			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(
					`Failed to download document from BoldSign: ${response.status} ${response.statusText}`
				);
			}

			// Get the PDF buffer
			const pdfBuffer = await response.arrayBuffer();

			// Store the signed PDF in Convex storage
			const blob = new Blob([pdfBuffer], { type: "application/pdf" });
			const signedStorageId = await ctx.storage.store(blob);

			console.log(`${LOG_PREFIX} Signed document stored`, {
				signedStorageId,
			});

			// Update the document record with the signed storage ID
			await ctx.runMutation(internal.boldsign.updateDocumentWithSignedPdf, {
				documentId: args.documentId,
				signedStorageId,
			});

			return { success: true, signedStorageId };
		} catch (error) {
			console.error(`${LOG_PREFIX} Error downloading completed document`, {
				boldsignDocumentId: args.boldsignDocumentId,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	},
});
