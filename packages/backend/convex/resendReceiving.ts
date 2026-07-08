import { internalMutation, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { resendClient } from "./lib/resendClient";
import type { Id } from "./_generated/dataModel";
import { systemMutation } from "./lib/factories";

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
		messageId: v.string(), // RFC 5322 Message-ID
		inReplyTo: v.optional(v.string()), // Message-ID this is replying to
		references: v.optional(v.array(v.string())), // Full thread chain
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
		// Step 1: Fetch full email content from Resend API (required for inbound emails)
		const emailContent = await fetchEmailContent(args.emailId);

		if (!emailContent) {
			console.error("Failed to fetch email content from Resend API");
			return { success: false, error: "Failed to fetch email content" };
		}

		// Step 2: Call mutation to process and store the email
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
			messageId: args.messageId,
			inReplyTo: args.inReplyTo,
			references: args.references,
			attachments: args.attachments,
			htmlBody: emailContent.html,
			textBody: emailContent.text,
		});

		// Step 3: Download attachments if present (also requires network access)
		if (result.success && args.attachments && args.attachments.length > 0) {
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
		messageId: v.string(),
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
		htmlBody: v.optional(v.string()),
		textBody: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Step 1: Parse recipient to identify organization
		// Defensive bounds check for args.to array
		if (!Array.isArray(args.to) || args.to.length === 0) {
			console.error("Invalid or empty 'to' array in incoming email", {
				to: args.to,
				from: args.from,
				subject: args.subject,
				messageId: args.messageId,
			});
			throw new Error("Email must have at least one recipient in 'to' field");
		}

		const recipientEmail = args.to[0]; // Primary recipient

		// Special handling for support@onetool.biz - these are general inquiries/demo requests
		// that aren't associated with a specific organization, so we skip processing them
		if (recipientEmail === "support@onetool.biz") {
			console.log(
				`Skipping inbound email processing for support@onetool.biz - ` +
					`this is a general inquiry/demo request, not organization-specific. ` +
					`From: ${args.from}, Subject: ${args.subject}`
			);
			return {
				success: true,
				skipped: true,
				reason: "General support email - not organization-specific",
			};
		}

		// Step 2: Find organization by receiving address
		const organization = await ctx.db
			.query("organizations")
			.filter((q) => q.eq(q.field("receivingAddress"), recipientEmail))
			.first();

		if (!organization) {
			console.error(
				`Organization not found for receiving address: ${recipientEmail}`
			);
			return { success: false, error: "Organization not found" };
		}

		// Step 3: Parse sender email and name
		const { email: fromEmail, name: fromName } = parseEmailAddress(args.from);

		// Step 4: Try to match sender to a client contact
		const clientContact = await ctx.db
			.query("clientContacts")
			.withIndex("by_org", (q) => q.eq("orgId", organization._id))
			.filter((q) => q.eq(q.field("email"), fromEmail))
			.first();

		if (!clientContact) {
			console.warn(`No matching client contact found for sender: ${fromEmail}`);
			// Create activity for unknown sender
			await ctx.db.insert("activities", {
				orgId: organization._id,
				userId: organization.ownerUserId,
				activityType: "email_sent",
				entityType: "organization",
				entityId: organization._id,
				entityName: organization.name,
				description: `Received email from unknown sender: ${fromEmail}`,
				metadata: {
					emailId: args.emailId,
					from: fromEmail,
					subject: args.subject,
				},
				timestamp: Date.now(),
				isVisible: true,
			});
			return {
				success: false,
				error: "Unknown sender - no matching client contact",
			};
		}

		const clientId = clientContact.clientId;

		// Step 5: Determine or create thread ID
		let threadId: string;

		// Check if this is a reply by looking at inReplyTo OR subject starting with "Re:"
		const isReply = args.inReplyTo || args.subject.match(/^Re:/i);

		if (isReply) {
			// This is a reply - try to find the original message
			let originalMessage = null;

			// First, try searching by the threadId/inReplyTo field if provided
			if (args.inReplyTo) {
				originalMessage = await ctx.db
					.query("emailMessages")
					.filter((q) => q.eq(q.field("threadId"), args.inReplyTo))
					.first();
			}

			// If not found, try to find by subject (removing "Re: " prefix)
			if (!originalMessage) {
				const cleanSubject = args.subject.replace(/^Re:\s*/i, "").trim();
				const clientMessages = await ctx.db
					.query("emailMessages")
					.withIndex("by_client", (q) => q.eq("clientId", clientId))
					.collect();

				// Find a message with matching subject (could be the original or any in the thread)
				// Sort by most recent first to get the latest message in the thread
				originalMessage = clientMessages
					.sort((a, b) => b.sentAt - a.sentAt)
					.find((msg) => {
						const msgCleanSubject = msg.subject.replace(/^Re:\s*/i, "").trim();
						return (
							msg.subject === cleanSubject || msgCleanSubject === cleanSubject
						);
					});
			}

			if (originalMessage?.threadId) {
				// Use the thread ID from the original message
				threadId = originalMessage.threadId;
			} else {
				// Fall back to using the resendEmailId of the first message as thread root
				// This creates a new thread
				threadId = args.emailId;
				console.warn(
					"No original message found for reply, creating new thread"
				);
			}
		} else {
			// New conversation - use this message's Resend email ID as thread root
			threadId = args.emailId;
		}

		// Step 6: Insert email message record
		const messagePreview = args.textBody
			? args.textBody.substring(0, 100)
			: args.htmlBody
			? stripHtml(args.htmlBody).substring(0, 100)
			: "";

		const emailMessageId = await ctx.db.insert("emailMessages", {
			orgId: organization._id,
			clientId,
			resendEmailId: args.emailId,
			direction: "inbound",
			threadId,
			inReplyTo: args.inReplyTo,
			references: args.references,
			subject: args.subject,
			messageBody: args.textBody || "",
			messagePreview,
			htmlBody: args.htmlBody,
			textBody: args.textBody,
			fromEmail,
			fromName,
			toEmail: recipientEmail,
			toName: organization.name,
			hasAttachments: args.attachments && args.attachments.length > 0,
			status: "delivered",
			sentAt: Date.now(),
			deliveredAt: Date.now(),
		});

		// Step 7: Create activity
		await ctx.db.insert("activities", {
			orgId: organization._id,
			userId: organization.ownerUserId,
			activityType: "email_delivered",
			entityType: "client",
			entityId: clientId,
			entityName: clientContact.firstName + " " + clientContact.lastName,
			description: `Received email: ${args.subject}`,
			metadata: {
				emailId: emailMessageId,
				subject: args.subject,
				preview: messagePreview,
			},
			timestamp: Date.now(),
			isVisible: true,
		});

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
 * Fetch full email content from Resend Receiving API
 * According to Resend docs, use: resend.emails.receiving.get(emailId)
 * See: https://resend.com/docs/dashboard/receiving/get-email-content
 */
async function fetchEmailContent(
	emailId: string
): Promise<{ html?: string; text?: string } | null> {
	try {
		// Use the Resend SDK to fetch received email content
		const { data, error } = await resendClient.emails.receiving.get(emailId);

		if (error) {
			console.error(`Resend API error:`, error);
			return null;
		}

		if (!data) {
			console.error("No data returned from Resend API");
			return null;
		}

		// TEMP DIAGNOSTIC (P0 live-header test) — OFF by default to avoid logging
		// PII. Set Convex env EMAIL_HEADER_DEBUG=true to confirm whether the SDK's
		// receiving.get() actually surfaces In-Reply-To/References (decides the P3
		// build path), read the logs, then unset it. Remove once P3 lands.
		if (process.env.EMAIL_HEADER_DEBUG === "true") {
			try {
				const { html: _h, text: _t, ...nonBody } = data as unknown as Record<
					string,
					unknown
				>;
				console.log(
					"[HEADER-TEST] receiving.get() non-body fields:",
					JSON.stringify(nonBody, null, 2)
				);
			} catch (diagErr) {
				console.log(
					"[HEADER-TEST] failed to serialize receiving.get() payload",
					diagErr
				);
			}
		}

		return {
			html: data.html || undefined,
			text: data.text || undefined,
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
