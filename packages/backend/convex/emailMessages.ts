import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getOptionalOrgId, emptyListResult } from "./lib/queries";

/**
 * List emails sent to a specific client
 */
export const listByClient = query({
	args: {
		clientId: v.id("clients"),
	},
	handler: async (ctx, args): Promise<Doc<"emailMessages">[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult<Doc<"emailMessages">>();

		// Get emails for this client, filtered by org
		const emails = await ctx.db
			.query("emailMessages")
			.withIndex("by_client", (q) => q.eq("clientId", args.clientId))
			.order("desc")
			.collect();

		return emails.filter((email) => email.orgId === orgId);
	},
});

/**
 * Get a specific email by Resend email ID
 */
export const getByResendId = query({
	args: {
		resendEmailId: v.string(),
	},
	handler: async (ctx, args) => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		const email = await ctx.db
			.query("emailMessages")
			.withIndex("by_resend_id", (q) =>
				q.eq("resendEmailId", args.resendEmailId)
			)
			.first();

		if (!email || email.orgId !== orgId) {
			return null;
		}

		return email;
	},
});

/**
 * Get recent email activities for the organization
 */
export const getRecentEmails = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		return await ctx.db
			.query("emailMessages")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.order("desc")
			.take(args.limit || 50);
	},
});

/**
 * Count unread/unopened emails for a client
 */
export const countUnopened = query({
	args: {
		clientId: v.id("clients"),
	},
	handler: async (ctx, args) => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return 0;

		// Query for both "sent" and "delivered" emails separately
		const [sentEmails, deliveredEmails] = await Promise.all([
			ctx.db
				.query("emailMessages")
				.withIndex("by_client_status", (q) =>
					q.eq("clientId", args.clientId).eq("status", "sent")
				)
				.collect(),
			ctx.db
				.query("emailMessages")
				.withIndex("by_client_status", (q) =>
					q.eq("clientId", args.clientId).eq("status", "delivered")
				)
				.collect(),
		]);

		// Merge and filter to only emails from the user's organization
		const orgEmails = [...sentEmails, ...deliveredEmails].filter(
			(email) => email.orgId === orgId
		);

		// Count emails that are sent or delivered but not opened
		return orgEmails.filter((email) => !email.openedAt).length;
	},
});

/**
 * Get email statistics for a client
 */
export const getClientEmailStats = query({
	args: {
		clientId: v.id("clients"),
	},
	handler: async (ctx, args) => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		const emails = await ctx.db
			.query("emailMessages")
			.withIndex("by_client", (q) => q.eq("clientId", args.clientId))
			.collect();

		// Filter to only emails from the user's organization
		const orgEmails = emails.filter((email) => email.orgId === orgId);

		return {
			total: orgEmails.length,
			sent: orgEmails.filter((e) => e.status === "sent").length,
			delivered: orgEmails.filter((e) => e.status === "delivered").length,
			opened: orgEmails.filter((e) => e.status === "opened").length,
			bounced: orgEmails.filter((e) => e.status === "bounced").length,
			complained: orgEmails.filter((e) => e.status === "complained").length,
			openRate:
				orgEmails.length > 0
					? Math.round(
							(orgEmails.filter((e) => e.openedAt).length / orgEmails.length) *
								100
						)
					: 0,
		};
	},
});

/**
 * Get a single email thread with all messages
 * Matches by threadId OR by subject (for when threadIds don't match due to batch ID issues)
 */
export const getEmailThread = query({
	args: {
		threadId: v.string(),
	},
	handler: async (ctx, args) => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		// Get all messages in this thread by threadId
		const messagesByThreadId = await ctx.db
			.query("emailMessages")
			.withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
			.collect();

		// Also get the first message to extract its subject
		const firstMessage = messagesByThreadId[0];

		let allMessages = messagesByThreadId;

		// If we found a message, also search by subject to catch related messages
		if (firstMessage) {
			const cleanSubject = firstMessage.subject.replace(/^Re:\s*/i, "").trim();

			// Get client ID from first message
			const clientId = firstMessage.clientId;

			// Find all messages for this client
			const clientMessages = await ctx.db
				.query("emailMessages")
				.withIndex("by_client", (q) => q.eq("clientId", clientId))
				.collect();

			// Filter by matching subject (with or without "Re:")
			const messagesBySubject = clientMessages.filter((msg) => {
				const msgCleanSubject = msg.subject.replace(/^Re:\s*/i, "").trim();
				return msgCleanSubject === cleanSubject;
			});

			// Combine and deduplicate
			const messageMap = new Map<string, Doc<"emailMessages">>();
			[...messagesByThreadId, ...messagesBySubject].forEach((msg) => {
				messageMap.set(msg._id, msg);
			});

			allMessages = Array.from(messageMap.values());
		}

		// Filter to only messages from the user's organization
		const orgMessages = allMessages
			.filter((msg) => msg.orgId === orgId)
			.sort((a, b) => a.sentAt - b.sentAt);

		// Enrich with sender information
		const enrichedMessages = await Promise.all(
			orgMessages.map(async (msg) => {
				let senderName = msg.fromName;
				let senderAvatar: string | null = null;

				// If outbound, get user info
				if (msg.direction === "outbound" && msg.sentBy) {
					const sender = await ctx.db.get(msg.sentBy);
					if (sender) {
						senderName = sender.name;
						senderAvatar = sender.image ?? null;
					}
				}

				return {
					...msg,
					senderName,
					senderAvatar,
				};
			})
		);

		return enrichedMessages;
	},
});

/**
 * Thread summary type for grouped email conversations
 */
export interface EmailThreadSummary {
	threadId: string;
	subject: string;
	latestMessage: string;
	latestMessageAt: number;
	messageCount: number;
	hasUnread: boolean;
	participants: string[];
}

/**
 * List email threads for a client (grouped conversations)
 */
export const listThreadsByClient = query({
	args: {
		clientId: v.id("clients"),
	},
	handler: async (ctx, args) => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult<EmailThreadSummary>();

		// Get all emails for this client
		const emails = await ctx.db
			.query("emailMessages")
			.withIndex("by_client", (q) => q.eq("clientId", args.clientId))
			.collect();

		// Filter to only emails from the user's organization
		const orgEmails = emails.filter((email) => email.orgId === orgId);

		// Group by thread
		const threadMap = new Map<string, EmailThreadSummary>();

		for (const email of orgEmails) {
			const threadId = email.threadId || email._id;
			const existing = threadMap.get(threadId);

			if (!existing) {
				threadMap.set(threadId, {
					threadId,
					subject: email.subject,
					latestMessage:
						email.messagePreview || email.messageBody.substring(0, 100),
					latestMessageAt: email.sentAt,
					messageCount: 1,
					hasUnread: email.direction === "inbound" && !email.openedAt,
					participants: [email.fromName],
				});
			} else {
				// Update if this is a later message
				if (email.sentAt > existing.latestMessageAt) {
					existing.latestMessage =
						email.messagePreview || email.messageBody.substring(0, 100);
					existing.latestMessageAt = email.sentAt;
				}
				existing.messageCount++;
				if (email.direction === "inbound" && !email.openedAt) {
					existing.hasUnread = true;
				}
				if (!existing.participants.includes(email.fromName)) {
					existing.participants.push(email.fromName);
				}
			}
		}

		// Convert to array and sort by latest message
		return Array.from(threadMap.values()).sort(
			(a, b) => b.latestMessageAt - a.latestMessageAt
		);
	},
});

/**
 * Get an email with its attachments
 */
export const getEmailWithAttachments = query({
	args: {
		emailMessageId: v.id("emailMessages"),
	},
	handler: async (ctx, args) => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return null;

		const email = await ctx.db.get(args.emailMessageId);
		if (!email || email.orgId !== orgId) {
			return null;
		}

		// Get attachments if any
		let attachments: Doc<"emailAttachments">[] = [];
		if (email.hasAttachments) {
			attachments = await ctx.db
				.query("emailAttachments")
				.withIndex("by_email", (q) =>
					q.eq("emailMessageId", args.emailMessageId)
				)
				.collect();
		}

		return {
			...email,
			attachments,
		};
	},
});
