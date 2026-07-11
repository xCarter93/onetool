import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { emptyListResult } from "./lib/queries";
import { optionalUserQuery, userMutation } from "./lib/factories";

/**
 * List emails sent to a specific client
 */
export const listByClient = optionalUserQuery({
	args: {
		clientId: v.id("clients"),
	},
	handler: async (ctx, args): Promise<Doc<"emailMessages">[]> => {
		if (!ctx.orgId) return emptyListResult<Doc<"emailMessages">>();
		await ctx.requireLevel("inbox", "view");
		const orgId = ctx.orgId;

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
export const getByResendId = optionalUserQuery({
	args: {
		resendEmailId: v.string(),
	},
	handler: async (ctx, args) => {
		if (!ctx.orgId) return null;
		await ctx.requireLevel("inbox", "view");
		const orgId = ctx.orgId;

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
export const getRecentEmails = optionalUserQuery({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		if (!ctx.orgId) return emptyListResult<Doc<"emailMessages">>();
		await ctx.requireLevel("inbox", "view");
		const orgId = ctx.orgId;

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
export const countUnopened = optionalUserQuery({
	args: {
		clientId: v.id("clients"),
	},
	handler: async (ctx, args) => {
		if (!ctx.orgId) return 0;
		await ctx.requireLevel("inbox", "view");
		const orgId = ctx.orgId;

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
export const getClientEmailStats = optionalUserQuery({
	args: {
		clientId: v.id("clients"),
	},
	handler: async (ctx, args) => {
		if (!ctx.orgId) return null;
		await ctx.requireLevel("inbox", "view");
		const orgId = ctx.orgId;

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
 * Get a single email thread with all its messages, oldest-first.
 * Keyed on the first-class `emailThreads` row (`threadDocId`) via `by_thread_doc`
 * — the legacy string-`threadId` subject-widening hack is gone now that threads
 * are a real table.
 */
export const getEmailThread = optionalUserQuery({
	args: {
		threadDocId: v.id("emailThreads"),
	},
	handler: async (ctx, args) => {
		if (!ctx.orgId) return null;
		await ctx.requireLevel("inbox", "view");
		const orgId = ctx.orgId;

		// The thread must belong to this org before returning any of its messages.
		const thread = await ctx.db.get(args.threadDocId);
		if (!thread || thread.orgId !== orgId) return null;

		// by_thread_doc is [threadDocId, sentAt] → already oldest-first.
		const messages = await ctx.db
			.query("emailMessages")
			.withIndex("by_thread_doc", (q) =>
				q.eq("threadDocId", args.threadDocId)
			)
			.collect();

		const orgMessages = messages
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
 * Thread summary type for grouped email conversations.
 * Keyed on the first-class `emailThreads` row.
 */
export interface EmailThreadSummary {
	threadDocId: Id<"emailThreads">;
	subject: string;
	latestMessage: string;
	latestMessageAt: number;
	messageCount: number;
	hasUnread: boolean;
	participants: string[];
}

/**
 * List email threads for a client (grouped conversations), newest-first.
 * Reads the first-class `emailThreads` table directly (no per-message grouping)
 * via `by_client`, using the denormalized display fields.
 */
export const listThreadsByClient = optionalUserQuery({
	args: {
		clientId: v.id("clients"),
	},
	handler: async (ctx, args): Promise<EmailThreadSummary[]> => {
		if (!ctx.orgId) return emptyListResult<EmailThreadSummary>();
		await ctx.requireLevel("inbox", "view");
		const orgId = ctx.orgId;

		const threads = await ctx.db
			.query("emailThreads")
			.withIndex("by_client", (q) => q.eq("clientId", args.clientId))
			.collect();

		return threads
			.filter((t) => t.orgId === orgId && t.status !== "archived")
			.sort((a, b) => b.lastMessageAt - a.lastMessageAt)
			.map((t) => ({
				threadDocId: t._id,
				subject: t.subject ?? t.subjectNormalized,
				latestMessage: t.lastMessagePreview ?? "",
				latestMessageAt: t.lastMessageAt,
				messageCount: t.messageCount,
				hasUnread: t.unreadCount > 0,
				participants: t.participantEmails,
			}));
	},
});

/**
 * Get an email with its attachments
 */
export const getEmailWithAttachments = optionalUserQuery({
	args: {
		emailMessageId: v.id("emailMessages"),
	},
	handler: async (ctx, args) => {
		if (!ctx.orgId) return null;
		await ctx.requireLevel("inbox", "view");
		const orgId = ctx.orgId;

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
