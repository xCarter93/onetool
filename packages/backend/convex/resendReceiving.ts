import { internalMutation, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { resendClient } from "./lib/resendClient";
import type { Doc, Id } from "./_generated/dataModel";
import { systemMutation } from "./lib/factories";
import { deriveVisibleText } from "./email/replyParser";
import {
	resolveInboundThread,
	stripPlusTag,
	bumpThread,
} from "./email/threads";

// Validate RESEND_API_KEY before initializing client
if (!process.env.RESEND_API_KEY) {
	throw new Error(
		"RESEND_API_KEY environment variable is not set. " +
			"Please configure it in your Convex dashboard under Settings > Environment Variables."
	);
}


/**
 * Handle inbound email from Resend webhook (Action)
 *
 * According to Resend docs, the webhook payload contains only metadata.
 * We need to call the Resend API to get the full email content.
 * See: https://resend.com/docs/dashboard/receiving/introduction
 *
 * This is an ACTION because it needs to fetch data from external API.
 */
export const handleInboundEmail = internalAction({
	args: {
		emailId: v.string(), // Resend email ID
		from: v.string(), // Sender email
		to: v.array(v.string()), // Recipient emails
		subject: v.string(),
		messageId: v.string(), // RFC 5322 Message-ID (webhook fallback)
		inReplyTo: v.optional(v.string()),
		references: v.optional(v.array(v.string())),
		attachments: v.optional(
			v.array(
				v.object({
					id: v.string(),
					filename: v.string(),
					content_type: v.string(),
					content_disposition: v.optional(v.string()),
					content_id: v.optional(v.string()),
				})
			)
		),
	},
	handler: async (
		ctx,
		args
	): Promise<{
		success: boolean;
		emailMessageId?: string;
		orgId?: string;
		error?: string;
	}> => {
		// Step 1: Fetch + normalize inbound content. receiving.get() reliably
		// returns RFC threading headers + received_for (verified live); prefer
		// those over the flaky webhook metadata.
		const content = await fetchInboundContent(args.emailId);

		if (!content) {
			console.error("Failed to fetch email content from Resend API");
			return { success: false, error: "Failed to fetch email content" };
		}

		const rfcMessageId = content.rfcMessageId ?? args.messageId;
		const inReplyTo = content.inReplyTo ?? args.inReplyTo;
		const references =
			content.references.length > 0 ? content.references : args.references;
		const receivedForAddress = content.receivedForAddress ?? args.to[0];
		const visibleText = deriveVisibleText({
			text: content.text,
			html: content.html,
		});

		// Step 2: Persist via the mutation
		const result: {
			success: boolean;
			emailMessageId?: string;
			orgId?: string;
			error?: string;
		} = await ctx.runMutation(internal.resendReceiving.processInboundEmail, {
			emailId: args.emailId,
			from: args.from,
			to: args.to,
			subject: args.subject,
			rfcMessageId,
			inReplyTo,
			references,
			receivedForAddress,
			attachments: args.attachments,
			htmlBody: content.html,
			textBody: content.text,
			visibleText,
		});

		// Step 3: Download attachments if present (requires network access).
		// emailMessageId is absent when the mutation skipped (duplicate delivery,
		// general-inbox mail) — nothing to attach to in that case.
		if (
			result.success &&
			result.emailMessageId &&
			args.attachments &&
			args.attachments.length > 0
		) {
			for (const attachment of args.attachments) {
				await ctx.runAction(internal.resendReceiving.downloadAttachmentAction, {
					emailId: args.emailId,
					emailMessageId: result.emailMessageId!,
					orgId: result.orgId!,
					attachmentId: attachment.id,
					filename: attachment.filename,
					contentType: attachment.content_type,
				});
			}
		}

		return result;
	},
});

/**
 * Process and store inbound email (Mutation)
 *
 * This is a MUTATION because it writes to the database.
 * It receives the email content from the action.
 */
export const processInboundEmail = internalMutation({
	args: {
		emailId: v.string(),
		from: v.string(),
		to: v.array(v.string()),
		subject: v.string(),
		rfcMessageId: v.string(),
		inReplyTo: v.optional(v.string()),
		references: v.optional(v.array(v.string())),
		receivedForAddress: v.optional(v.string()),
		attachments: v.optional(
			v.array(
				v.object({
					id: v.string(),
					filename: v.string(),
					content_type: v.string(),
					content_disposition: v.optional(v.string()),
					content_id: v.optional(v.string()),
				})
			)
		),
		htmlBody: v.optional(v.string()),
		textBody: v.optional(v.string()),
		visibleText: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (!Array.isArray(args.to) || args.to.length === 0) {
			console.error("Invalid or empty 'to' array in incoming email", {
				to: args.to,
				from: args.from,
				subject: args.subject,
			});
			throw new Error("Email must have at least one recipient in 'to' field");
		}

		// Dedup: Resend/Svix can redeliver the same event (retries, dashboard
		// redelivery). One inbound email must produce exactly one row — a second
		// insert would also double-bump the thread's message/unread counts.
		const alreadyIngested = await ctx.db
			.query("emailMessages")
			.withIndex("by_resend_id", (q) => q.eq("resendEmailId", args.emailId))
			.first();
		if (alreadyIngested) {
			return {
				success: true,
				skipped: true,
				reason: "Duplicate delivery - already ingested",
			};
		}

		// Resolve recipient + any plus-addressed thread token, then the base
		// address that identifies the org.
		const recipientRaw = args.receivedForAddress ?? args.to[0];
		const { base: baseAddress, token: plusToken } = stripPlusTag(recipientRaw);

		// A plus-token deterministically identifies a thread (and thus its org)
		// for mail we originated — resolve it BEFORE any generic-inbox
		// short-circuit, so replies to orgs sending from the shared fallback
		// address (no receivingAddress configured) still route.
		let organization: Doc<"organizations"> | null = null;
		if (plusToken) {
			const tokenThreadId = ctx.db.normalizeId("emailThreads", plusToken);
			if (tokenThreadId) {
				const tokenThread = await ctx.db.get(tokenThreadId);
				if (tokenThread) {
					organization = await ctx.db.get(tokenThread.orgId);
				}
			}
		}

		if (!organization) {
			// support@onetool.biz is a general inbox, not org-specific.
			if (baseAddress === "support@onetool.biz") {
				console.log(
					`Skipping inbound email for support@onetool.biz. From: ${args.from}, Subject: ${args.subject}`
				);
				return {
					success: true,
					skipped: true,
					reason: "General support email - not organization-specific",
				};
			}

			// Find the org by receiving address via the index (not a table scan).
			organization = await ctx.db
				.query("organizations")
				.withIndex("by_receiving_address", (q) =>
					q.eq("receivingAddress", baseAddress)
				)
				.first();
		}

		if (!organization) {
			console.error(
				`Organization not found for receiving address: ${baseAddress}`
			);
			return { success: false, error: "Organization not found" };
		}

		// Parse sender; match to a client contact if we know them (else unknown).
		const { email: fromEmail, name: fromName } = parseEmailAddress(args.from);
		const clientContact = await ctx.db
			.query("clientContacts")
			.withIndex("by_org", (q) => q.eq("orgId", organization._id))
			.filter((q) => q.eq(q.field("email"), fromEmail))
			.first();
		let clientId: Id<"clients"> | null = clientContact?.clientId ?? null;

		const receivedAt = Date.now();

		// Resolve the thread (plus-token -> headers -> subject -> new). Unknown
		// senders still get a thread (clientId null) instead of being dropped.
		const threadDocId = await resolveInboundThread(ctx, {
			orgId: organization._id,
			clientId,
			plusToken,
			inReplyTo: args.inReplyTo ?? null,
			references: args.references ?? [],
			subject: args.subject,
			rfcMessageId: args.rfcMessageId,
			fromEmail,
			receivedAt,
		});

		// Adopt the thread's linked client when the sender isn't a recognized
		// contact (e.g. the thread was manually linked from the inbox), so new
		// messages on a linked thread don't regress to unlinked.
		const threadDoc = await ctx.db.get(threadDocId);
		if (!clientId && threadDoc?.clientId) {
			clientId = threadDoc.clientId;
		}

		const visibleText = args.visibleText ?? "";
		const messagePreview = (
			visibleText ||
			args.textBody ||
			(args.htmlBody ? stripHtml(args.htmlBody) : "")
		).substring(0, 100);

		const emailMessageId = await ctx.db.insert("emailMessages", {
			orgId: organization._id,
			clientId,
			resendEmailId: args.emailId,
			direction: "inbound",
			threadId: threadDocId, // legacy string mirror (kept through migration)
			threadDocId,
			rfcMessageId: args.rfcMessageId,
			inReplyTo: args.inReplyTo,
			references: args.references,
			subject: args.subject,
			messageBody: args.textBody || "",
			messagePreview,
			htmlBody: args.htmlBody,
			textBody: args.textBody,
			visibleText,
			fromEmail,
			fromName,
			toEmail: baseAddress,
			toName: organization.name,
			hasAttachments: !!(args.attachments && args.attachments.length > 0),
			status: "delivered",
			sentAt: receivedAt,
			deliveredAt: receivedAt,
		});

		// Thread aggregates (inbound => unread++); link a client if we just learned
		// one for a previously-unlinked thread.
		await bumpThread(ctx, threadDocId, {
			sentAt: receivedAt,
			participantEmail: fromEmail,
			incUnread: true,
			subject: args.subject,
			preview: messagePreview,
			direction: "inbound",
		});
		if (clientId && threadDoc && threadDoc.clientId === null) {
			await ctx.db.patch(threadDocId, { clientId });
		}

		// Activity row: client-scoped when known (via contact match or thread
		// link), else an unknown-sender note.
		if (clientId) {
			const entityName = clientContact
				? clientContact.firstName + " " + clientContact.lastName
				: ((await ctx.db.get(clientId))?.companyName ?? fromEmail);
			await ctx.db.insert("activities", {
				orgId: organization._id,
				userId: organization.ownerUserId,
				activityType: "email_delivered",
				entityType: "client",
				entityId: clientId,
				entityName,
				description: `Received email: ${args.subject}`,
				metadata: {
					emailId: emailMessageId,
					subject: args.subject,
					preview: messagePreview,
				},
				timestamp: receivedAt,
				isVisible: true,
			});
		} else {
			await ctx.db.insert("activities", {
				orgId: organization._id,
				userId: organization.ownerUserId,
				activityType: "email_delivered",
				entityType: "organization",
				entityId: organization._id,
				entityName: organization.name,
				description: `Received email from unknown sender: ${fromEmail}`,
				metadata: {
					emailId: emailMessageId,
					subject: args.subject,
					preview: messagePreview,
				},
				timestamp: receivedAt,
				isVisible: true,
			});
		}

		return {
			success: true,
			emailMessageId,
			orgId: organization._id,
		};
	},
});

/**
 * Download and store email attachment from Resend (Action)
 *
 * This is an ACTION because it needs to fetch data from external API and store in Convex storage.
 */
export const downloadAttachmentAction = internalAction({
	args: {
		emailId: v.string(),
		emailMessageId: v.string(),
		orgId: v.string(),
		attachmentId: v.string(),
		filename: v.string(),
		contentType: v.string(),
	},
	handler: async (ctx, args) => {
		try {
			// Fetch attachment from Resend API
			const attachmentData = await fetchAttachment(
				args.emailId,
				args.attachmentId
			);

			if (!attachmentData) {
				console.error(`Failed to download attachment: ${args.filename}`);
				return { success: false };
			}

			// Store in Convex storage (actions have access to store())
			const storageId = await ctx.storage.store(
				new Blob([attachmentData], { type: args.contentType })
			);

			// Call mutation to create the database record
			await ctx.runMutation(internal.resendReceiving.createAttachmentRecord, {
				emailMessageId: args.emailMessageId as Id<"emailMessages">,
				orgId: args.orgId as Id<"organizations">,
				attachmentId: args.attachmentId,
				filename: args.filename,
				contentType: args.contentType,
				storageId,
				size: attachmentData.byteLength,
			});

			return { success: true };
		} catch (error) {
			console.error(`Error downloading attachment ${args.filename}:`, error);
			return { success: false, error: String(error) };
		}
	},
});

/**
 * Create attachment record in database (Mutation)
 *
 * This is a MUTATION because it writes to the database.
 * The file is already stored in the action, so we just need to create the record.
 */
export const createAttachmentRecord = systemMutation({
	args: {
		emailMessageId: v.id("emailMessages"),
		attachmentId: v.string(),
		filename: v.string(),
		contentType: v.string(),
		storageId: v.id("_storage"),
		size: v.number(),
	},
	handler: async (ctx, args) => {
		// Create attachment record
		await ctx.db.insert("emailAttachments", {
			orgId: ctx.orgId,
			emailMessageId: args.emailMessageId,
			attachmentId: args.attachmentId,
			filename: args.filename,
			contentType: args.contentType,
			size: args.size,
			storageId: args.storageId,
			receivedAt: Date.now(),
		});

		return { success: true, storageId: args.storageId };
	},
});

// Helper functions

/**
 * Parse email address into name and email
 * Format: "John Doe <john@example.com>" or "john@example.com"
 */
function parseEmailAddress(address: string): { name: string; email: string } {
	const match = address.match(/^(.+?)\s*<(.+?)>$/);
	if (match) {
		return {
			name: match[1].trim().replace(/^["']|["']$/g, ""),
			email: match[2].trim(),
		};
	}
	return {
		name: address.split("@")[0],
		email: address.trim(),
	};
}

/**
 * Strip HTML tags to get plain text
 */
function stripHtml(html: string): string {
	return html
		.replace(/<style[^>]*>.*?<\/style>/gi, "")
		.replace(/<script[^>]*>.*?<\/script>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Fetch + normalize inbound content from the Resend Receiving API.
 * receiving.get() returns parsed html/text plus a headers object and top-level
 * message_id/received_for (verified live). We surface the RFC threading fields
 * here so the mutation matches provider-agnostically.
 */
interface NormalizedInboundContent {
	html?: string;
	text?: string;
	rfcMessageId: string;
	inReplyTo: string | null;
	references: string[];
	receivedForAddress: string | null;
}

async function fetchInboundContent(
	emailId: string
): Promise<NormalizedInboundContent | null> {
	try {
		const { data, error } = await resendClient.emails.receiving.get(emailId);

		if (error) {
			console.error(`Resend API error:`, error);
			return null;
		}
		if (!data) {
			console.error("No data returned from Resend API");
			return null;
		}

		const d = data as unknown as {
			html?: string;
			text?: string;
			message_id?: string;
			received_for?: string[];
			headers?: Record<string, string>;
		};
		const headers = d.headers ?? {};
		const references = (headers["references"] ?? "")
			.split(/\s+/)
			.map((s) => s.trim())
			.filter(Boolean);

		return {
			html: d.html || undefined,
			text: d.text || undefined,
			rfcMessageId: d.message_id || headers["message-id"] || emailId,
			inReplyTo: headers["in-reply-to"] ?? null,
			references,
			receivedForAddress: d.received_for?.[0] ?? null,
		};
	} catch (error) {
		console.error("Error fetching email content:", error);
		return null;
	}
}

/**
 * Fetch attachment from Resend API
 */
async function fetchAttachment(
	emailId: string,
	attachmentId: string
): Promise<ArrayBuffer | null> {
	try {
		const response = await fetch(
			`https://api.resend.com/emails/${emailId}/attachments/${attachmentId}`,
			{
				headers: {
					Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
				},
			}
		);

		if (!response.ok) {
			console.error(
				`Resend API error: ${response.status} ${response.statusText}`
			);
			return null;
		}

		return await response.arrayBuffer();
	} catch (error) {
		console.error("Error fetching attachment:", error);
		return null;
	}
}
