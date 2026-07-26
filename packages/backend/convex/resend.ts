import { v } from "convex/values";
import { getCurrentUserOrThrow, getCurrentUserOrgId } from "./lib/auth";
import { userMutation } from "./lib/factories";
import { sendOutbound } from "./email/outbound";
import type { OutboundMessage } from "./email/types";
import {
	getOrCreateOutboundThread,
	bumpThread,
	plusTagAddress,
} from "./email/threads";
import { SERVER_EVENTS, trackServerEvent } from "./lib/posthog";
import { buildEmailHtml, resolveFromEmail } from "./email/branding";

// Re-export the durable component instance so existing callers (portal/email.ts)
// keep importing `resend` from here; the instance itself lives in the seam.
export { resend } from "./email/durableResend";

/**
 * Send an email to a client with organization branding
 */
export const sendClientEmail = userMutation({
	args: {
		clientId: v.id("clients"),
		subject: v.string(),
		messageBody: v.string(),
		threadId: v.optional(v.string()), // Optional for starting a thread
		contactId: v.optional(v.id("clientContacts")), // Recipient; defaults to primary
	},
	handler: async (ctx, args) => {
		await ctx.requireLevel("inbox", "modify");
		const user = await getCurrentUserOrThrow(ctx);
		const orgId = await getCurrentUserOrgId(ctx);

		// Get organization details for branding
		const organization = await ctx.db.get(orgId);
		if (!organization) {
			throw new Error("Organization not found");
		}

		// Get client details
		const client = await ctx.db.get(args.clientId);
		if (!client) {
			throw new Error("Client not found");
		}

		// Verify client belongs to the organization
		if (client.orgId !== orgId) {
			throw new Error("Client does not belong to your organization");
		}

		// Get primary contact
		const primaryContact = await ctx.db
			.query("clientContacts")
			.withIndex("by_primary", (q) =>
				q.eq("clientId", args.clientId).eq("isPrimary", true)
			)
			.first();

		// Resolve recipient: explicit selection or fall back to the primary contact.
		let recipient = primaryContact;
		if (args.contactId) {
			const selected = await ctx.db.get(args.contactId);
			if (!selected || selected.clientId !== args.clientId) {
				throw new Error("Selected contact does not belong to this client");
			}
			recipient = selected;
		}

		if (!recipient || !recipient.email) {
			throw new Error("Selected contact does not have a valid email address");
		}

		// Build email HTML with organization branding
		const emailHtml = buildEmailHtml({
			logoUrl: organization.logoUrl,
			organizationName: organization.name,
			organizationEmail: organization.email,
			organizationPhone: organization.phone,
			organizationAddress: organization.address,
			clientName: `${recipient.firstName} ${recipient.lastName}`,
			messageBody: args.messageBody,
			senderName: user.name, // Add sender's name for personalization
		});

		// Resolve from email with fallback chain: receivingAddress -> env var -> default
		const fromEmail = resolveFromEmail(organization);
		const fromName = user.name || organization.name || "OneTool"; // Fallback to org name or "OneTool"

		// Resolve/lookup the conversation thread this send belongs to.
		const threadDocId = await getOrCreateOutboundThread(ctx, {
			orgId,
			clientId: args.clientId,
			subject: args.subject,
			legacyThreadId: args.threadId,
		});

		const message: OutboundMessage = {
			from: `${fromName} <${fromEmail}>`,
			to: [recipient.email],
			replyTo: [plusTagAddress(resolveFromEmail(organization), threadDocId)],
			subject: args.subject,
			html: emailHtml,
		};

		const result = await sendOutbound(ctx, orgId, message);
		if (result.skipped === "suppressed") {
			throw new Error(
				"This recipient's address is suppressed (a previous email hard-bounced or was marked as spam)."
			);
		}
		const emailId = result.resendEmailId;
		if (!emailId) {
			throw new Error("Email could not be sent.");
		}

		// Create message preview (first 100 chars)
		const messagePreview = args.messageBody.substring(0, 100);

		// Legacy string threadId now mirrors threadDocId through the migration,
		// so client-tab grouping (by_thread) stays consistent with the new model.
		const threadId = threadDocId;

		// Store email record
		const emailMessageId = await ctx.db.insert("emailMessages", {
			orgId,
			clientId: args.clientId,
			resendEmailId: emailId,
			direction: "outbound",
			threadId,
			threadDocId,
			subject: args.subject,
			messageBody: args.messageBody,
			messagePreview,
			fromEmail: fromEmail,
			fromName: fromName,
			toEmail: recipient.email,
			toName: `${recipient.firstName} ${recipient.lastName}`,
			status: "sent",
			sentAt: Date.now(),
			sentBy: user._id,
		});

		await bumpThread(ctx, threadDocId, {
			sentAt: Date.now(),
			participantEmail: recipient.email,
			subject: args.subject,
			preview: messagePreview,
			direction: "outbound",
		});

		await trackServerEvent(ctx, {
			event: SERVER_EVENTS.EMAIL_SENT,
			orgId,
			actorUserId: user._id,
			properties: {
				email_message_id: emailMessageId,
				thread_id: threadDocId,
				client_id: args.clientId,
				is_reply: false,
			},
		});

		// Log activity
		await ctx.db.insert("activities", {
			orgId,
			userId: user._id,
			activityType: "email_sent",
			entityType: "client",
			entityId: args.clientId,
			entityName: client.companyName,
			description: `Sent email: ${args.subject}`,
			metadata: {
				emailId: emailMessageId,
				subject: args.subject,
				preview: messagePreview,
			},
			timestamp: Date.now(),
			isVisible: true,
		});

		return {
			emailId,
			emailMessageId,
			threadId,
		};
	},
});

/**
 * Reply to an email thread
 */
export const replyToEmail = userMutation({
	args: {
		emailMessageId: v.id("emailMessages"), // The message being replied to
		messageBody: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.requireLevel("inbox", "modify");
		const user = await getCurrentUserOrThrow(ctx);
		const orgId = await getCurrentUserOrgId(ctx);

		// Get the original email
		const originalEmail = await ctx.db.get(args.emailMessageId);
		if (!originalEmail) {
			throw new Error("Original email not found");
		}

		if (originalEmail.orgId !== orgId) {
			throw new Error("Email does not belong to your organization");
		}

		// Get organization details
		const organization = await ctx.db.get(orgId);
		if (!organization) {
			throw new Error("Organization not found");
		}

		// Reply requires a client-linked original; unknown-sender threads
		// (clientId === null) can't be replied to through this path.
		const clientId = originalEmail.clientId;
		if (!clientId) {
			throw new Error("Cannot reply to an email with no linked client");
		}

		// Get client details
		const client = await ctx.db.get(clientId);
		if (!client) {
			throw new Error("Client not found");
		}

		// Get primary contact
		const primaryContact = await ctx.db
			.query("clientContacts")
			.withIndex("by_primary", (q) =>
				q.eq("clientId", clientId).eq("isPrimary", true)
			)
			.first();

		if (!primaryContact || !primaryContact.email) {
			throw new Error("Client does not have a valid primary contact email");
		}

		// Build the RFC References chain (best-effort — real Message-IDs arrive
		// with inbound in P3; pre-P3 originals may lack rfcMessageId).
		const parentRfcId = originalEmail.rfcMessageId;
		const references = [
			...(originalEmail.references ?? []),
			...(parentRfcId ? [parentRfcId] : []),
		];

		// Build email HTML with organization branding
		const emailHtml = buildEmailHtml({
			logoUrl: organization.logoUrl,
			organizationName: organization.name,
			organizationEmail: organization.email,
			organizationPhone: organization.phone,
			organizationAddress: organization.address,
			clientName: `${primaryContact.firstName} ${primaryContact.lastName}`,
			messageBody: args.messageBody,
			senderName: user.name,
		});

		// Resolve from email with fallback chain: receivingAddress -> env var -> default
		const fromEmail = resolveFromEmail(organization);
		const fromName = user.name || organization.name || "OneTool";

		// Add "Re: " prefix if not already present
		const subject = originalEmail.subject.startsWith("Re:")
			? originalEmail.subject
			: `Re: ${originalEmail.subject}`;

		const threadDocId = await getOrCreateOutboundThread(ctx, {
			orgId,
			clientId,
			subject,
			existingThreadDocId: originalEmail.threadDocId,
			legacyThreadId: originalEmail.threadId,
		});

		const message: OutboundMessage = {
			from: `${fromName} <${fromEmail}>`,
			to: [primaryContact.email],
			replyTo: [plusTagAddress(resolveFromEmail(organization), threadDocId)],
			subject,
			html: emailHtml,
			// RFC threading headers so the recipient's client threads our reply.
			...(parentRfcId ? { inReplyTo: parentRfcId } : {}),
			...(references.length > 0 ? { references } : {}),
		};

		const result = await sendOutbound(ctx, orgId, message);
		if (result.skipped === "suppressed") {
			throw new Error(
				"This recipient's address is suppressed (a previous email hard-bounced or was marked as spam)."
			);
		}
		const emailId = result.resendEmailId;
		if (!emailId) {
			throw new Error("Email could not be sent.");
		}

		// Create message preview
		const messagePreview = args.messageBody.substring(0, 100);

		// Store email record with threading information
		const emailMessageId = await ctx.db.insert("emailMessages", {
			orgId,
			clientId,
			resendEmailId: emailId,
			direction: "outbound",
			threadId: threadDocId,
			threadDocId,
			inReplyTo: parentRfcId,
			references,
			subject,
			messageBody: args.messageBody,
			messagePreview,
			fromEmail,
			fromName,
			toEmail: primaryContact.email,
			toName: `${primaryContact.firstName} ${primaryContact.lastName}`,
			status: "sent",
			sentAt: Date.now(),
			sentBy: user._id,
		});

		await bumpThread(ctx, threadDocId, {
			sentAt: Date.now(),
			participantEmail: primaryContact.email,
			subject,
			preview: messagePreview,
			direction: "outbound",
		});

		await trackServerEvent(ctx, {
			event: SERVER_EVENTS.EMAIL_SENT,
			orgId,
			actorUserId: user._id,
			properties: {
				email_message_id: emailMessageId,
				thread_id: threadDocId,
				client_id: clientId,
				is_reply: true,
			},
		});

		// Log activity
		await ctx.db.insert("activities", {
			orgId,
			userId: user._id,
			activityType: "email_sent",
			entityType: "client",
			entityId: clientId,
			entityName: client.companyName,
			description: `Replied to email: ${subject}`,
			metadata: {
				emailId: emailMessageId,
				subject,
				preview: messagePreview,
			},
			timestamp: Date.now(),
			isVisible: true,
		});

		return {
			emailId,
			emailMessageId,
		};
	},
});

