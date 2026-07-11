import {
	query,
	mutation,
	internalMutation,
	QueryCtx,
	MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId } from "./lib/auth";
import { DateUtils } from "./lib/shared";
import { requireMembership } from "./lib/memberships";
import {
	filterUndefined,
	requireUpdates,
} from "./lib/crud";
import { getOptionalOrgId, emptyListResult } from "./lib/queries";
import { enqueuePush } from "./push";
import {
	optionalUserQuery,
	systemMutation,
	userMutation,
	type UserMutationCtx,
} from "./lib/factories";

/**
 * Notification operations
 *
 * Uses shared CRUD utilities from lib/crud.ts for consistent patterns.
 * Notification-specific business logic (validation, stats, mentions) remains here.
 */

// ============================================================================
// Local Helper Functions (entity-specific logic only)
// ============================================================================

/**
 * Validate user exists and belongs to user's org
 */
async function validateUserAccess(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	existingOrgId?: Id<"organizations">
): Promise<void> {
	const userOrgId = existingOrgId ?? (await getCurrentUserOrgId(ctx));
	const user = await ctx.db.get(userId);

	if (!user) {
		throw new Error("User not found");
	}

	await requireMembership(ctx, userId, userOrgId);
}

/**
 * Create a notification with automatic orgId assignment
 */
async function createNotificationWithOrg(
	ctx: UserMutationCtx,
	data: Omit<
		Doc<"notifications">,
		"_id" | "_creationTime" | "orgId" | "priority"
	>
): Promise<Id<"notifications">> {
	// Validate user access
	await validateUserAccess(ctx, data.userId, ctx.orgId);

	const notificationData = {
		...data,
		orgId: ctx.orgId,
	};

	// Type assertion needed because schema still has deprecated priority field
	return await ctx.db.insert("notifications", notificationData as any);
}

// Define specific types for notification operations
type NotificationDocument = Doc<"notifications">;
type NotificationId = Id<"notifications">;

// ============================================================================
// Statistics Types and Helpers
// ============================================================================

// Interface for notification statistics
interface NotificationStats {
	total: number;
	unread: number;
	byType: {
		task_reminder: number;
		quote_approved: number;
		invoice_overdue: number;
		payment_received: number;
		project_deadline: number;
		team_assignment: number;
		client_mention: number;
		project_mention: number;
		quote_mention: number;
		// Stripe webhook lifecycle types.
		payment_failed: number;
		dispute_created: number;
		charge_refunded: number;
		// Connect lifecycle additions.
		payout_paid: number;
		payout_failed: number;
		capability_degraded: number;
		bank_account_changed: number;
		// Workflow-automation messages.
		automation_message: number;
		// Workflow-automation production failure alerts.
		automation_failed: number;
	};
	today: number;
	pending: number; // scheduled but not sent yet
}

function createEmptyNotificationStats(): NotificationStats {
	return {
		total: 0,
		unread: 0,
		byType: {
			task_reminder: 0,
			quote_approved: 0,
			invoice_overdue: 0,
			payment_received: 0,
			project_deadline: 0,
			team_assignment: 0,
			client_mention: 0,
			project_mention: 0,
			quote_mention: 0,
			payment_failed: 0,
			dispute_created: 0,
			charge_refunded: 0,
			payout_paid: 0,
			payout_failed: 0,
			capability_degraded: 0,
			bank_account_changed: 0,
			automation_message: 0,
			automation_failed: 0,
		},
		today: 0,
		pending: 0,
	};
}

/**
 * Calculate notification statistics from a list of notifications
 */
function calculateNotificationStats(
	notifications: NotificationDocument[]
): NotificationStats {
	const stats = createEmptyNotificationStats();
	stats.total = notifications.length;

	const now = Date.now();
	const todayStart = DateUtils.startOfDay(now);
	const todayEnd = DateUtils.endOfDay(now);

	notifications.forEach((notification: NotificationDocument) => {
		// Count unread
		if (!notification.isRead) {
			stats.unread++;
		}

		// Count by type
		stats.byType[notification.notificationType]++;

		// Count today's notifications
		if (
			notification._creationTime >= todayStart &&
			notification._creationTime <= todayEnd
		) {
			stats.today++;
		}

		// Count pending (scheduled but not sent)
		if (
			notification.scheduledFor &&
			notification.scheduledFor > now &&
			!notification.sentAt
		) {
			stats.pending++;
		}
	});

	return stats;
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all notifications for a specific user
 */
// TODO: Candidate for deletion if confirmed unused.
export const listByUser = optionalUserQuery({
	args: {
		userId: v.id("users"),
		isRead: v.optional(v.boolean()),
		notificationType: v.optional(
			v.union(
				v.literal("task_reminder"),
				v.literal("quote_approved"),
				v.literal("invoice_overdue"),
				v.literal("payment_received"),
				v.literal("project_deadline"),
				v.literal("team_assignment")
			)
		),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<NotificationDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		// Validate user access
		await validateUserAccess(ctx, args.userId, orgId);

		let notifications: NotificationDocument[];

		if (args.isRead !== undefined) {
			notifications = await ctx.db
				.query("notifications")
				.withIndex("by_user_read", (q) =>
					q.eq("userId", args.userId).eq("isRead", args.isRead as boolean)
				)
				.collect();
		} else {
			notifications = await ctx.db
				.query("notifications")
				.filter((q) => q.eq(q.field("userId"), args.userId))
				.collect();
		}

		// Filter by notification type if specified
		if (args.notificationType) {
			notifications = notifications.filter(
				(notification) =>
					notification.notificationType === args.notificationType
			);
		}

		// Sort by creation time (newest first)
		notifications.sort((a, b) => b._creationTime - a._creationTime);

		// Apply limit if specified
		if (args.limit) {
			notifications = notifications.slice(0, args.limit);
		}

		return notifications;
	},
});

/**
 * Get all notifications for the current user's organization
 */
// TODO: Candidate for deletion if confirmed unused.
export const list = optionalUserQuery({
	args: {
		notificationType: v.optional(
			v.union(
				v.literal("task_reminder"),
				v.literal("quote_approved"),
				v.literal("invoice_overdue"),
				v.literal("payment_received"),
				v.literal("project_deadline"),
				v.literal("team_assignment")
			)
		),
	},
	handler: async (ctx, args): Promise<NotificationDocument[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult();

		let notifications: NotificationDocument[];

		if (args.notificationType) {
			notifications = await ctx.db
				.query("notifications")
				.withIndex("by_type", (q) =>
					q.eq(
						"notificationType",
						args.notificationType as NonNullable<typeof args.notificationType>
					)
				)
				.collect();

			// Filter by organization
			notifications = notifications.filter((n) => n.orgId === orgId);
		} else {
			notifications = await ctx.db
				.query("notifications")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect();
		}

		// Sort by creation time (newest first)
		return notifications.sort((a, b) => b._creationTime - a._creationTime);
	},
});

/**
 * Get a specific notification by ID
 */
// TODO: Candidate for deletion if confirmed unused.
export const get = optionalUserQuery({
	args: { id: v.id("notifications") },
	handler: async (ctx, args): Promise<NotificationDocument | null> => {
		if (!ctx.orgId) return null;

		try {
			return await ctx.orgEntity("notifications", args.id);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Entity not found in notifications:")) {
				return null;
			}
			throw error;
		}
	},
});

/**
 * Get notification statistics for a user
 */
// TODO: Candidate for deletion if confirmed unused.
export const getStatsForUser = optionalUserQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, args): Promise<NotificationStats> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return createEmptyNotificationStats();

		// Validate user access
		await validateUserAccess(ctx, args.userId, orgId);

		const notifications = await ctx.db
			.query("notifications")
			.filter((q) => q.eq(q.field("userId"), args.userId))
			.collect();

		return calculateNotificationStats(notifications);
	},
});

/**
 * Get notification statistics for the organization
 */
// TODO: Candidate for deletion if confirmed unused.
export const getStats = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<NotificationStats> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return createEmptyNotificationStats();

		const notifications = await ctx.db
			.query("notifications")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		return calculateNotificationStats(notifications);
	},
});

/**
 * Get notifications due to be sent
 */
// TODO: Candidate for deletion if confirmed unused.
export const getDueNotifications = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<NotificationDocument[]> => {
		const now = Date.now();

		const notifications = await ctx.db
			.query("notifications")
			.withIndex("by_scheduled", (q) => q.lte("scheduledFor", now))
			.collect();

		// Only return notifications that haven't been sent yet
		return notifications.filter((notification) => !notification.sentAt);
	},
});

/**
 * List notifications for the current user in the current organization
 */
export const listForCurrentUser = optionalUserQuery({
	args: {
		isRead: v.optional(v.boolean()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const currentUser = await ctx.auth.getUserIdentity();
		if (!currentUser) {
			return { notifications: [], unreadCount: 0 };
		}

		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) {
			return { notifications: [], unreadCount: 0 };
		}

		// Get the user record
		const user = await ctx.db
			.query("users")
			.withIndex("by_external_id", (q) =>
				q.eq("externalId", currentUser.subject)
			)
			.first();

		if (!user) {
			return { notifications: [], unreadCount: 0 };
		}

		// Get notifications for this user in the current organization
		let notifications: NotificationDocument[];

		if (args.isRead !== undefined) {
			notifications = await ctx.db
				.query("notifications")
				.withIndex("by_user_read", (q) =>
					q.eq("userId", user._id).eq("isRead", args.isRead as boolean)
				)
				.order("desc")
				.collect();

			// Filter by current organization
			notifications = notifications.filter((n) => n.orgId === orgId);
		} else {
			notifications = await ctx.db
				.query("notifications")
				.filter((q) =>
					q.and(
						q.eq(q.field("userId"), user._id),
						q.eq(q.field("orgId"), orgId)
					)
				)
				.order("desc")
				.collect();
		}

		// Apply limit if specified
		if (args.limit) {
			notifications = notifications.slice(0, args.limit);
		}

		// Count unread notifications for current organization only
		const unreadCount = await ctx.db
			.query("notifications")
			.withIndex("by_user_read", (q) =>
				q.eq("userId", user._id).eq("isRead", false)
			)
			.collect()
			.then(
				(notifications) =>
					notifications.filter((n) => n.orgId === orgId).length
			);

		return { notifications, unreadCount };
	},
});

/**
 * List mention notifications for a specific entity
 */
/**
 * Return type for notification with author
 */
type NotificationWithAuthor = Doc<"notifications"> & {
	message: string;
	author: {
		_id: Id<"users">;
		name: string;
		email: string;
		image: string | null;
	} | null;
};

export const listByEntity = optionalUserQuery({
	args: {
		entityType: v.union(
			v.literal("client"),
			v.literal("project"),
			v.literal("quote")
		),
		entityId: v.string(),
	},
	handler: async (ctx, args): Promise<NotificationWithAuthor[]> => {
		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) return emptyListResult<NotificationWithAuthor>();

		// Get all notifications for this entity
		const notifications = await ctx.db
			.query("notifications")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();

		// Filter for mentions on this specific entity
		const mentionTypes: Record<string, string> = {
			client: "client_mention",
			project: "project_mention",
			quote: "quote_mention",
		};

		const entityNotifications = notifications.filter(
			(notification) =>
				notification.notificationType === mentionTypes[args.entityType] &&
				notification.entityId === args.entityId
		);

		// Fetch user details for each notification (author, not recipient)
		const notificationsWithUsers = await Promise.all(
			entityNotifications.map(async (notification) => {
				// Extract author ID from the message format "authorId:message"
				const colonIndex = notification.message.indexOf(":");
				const authorIdStr = notification.message.substring(0, colonIndex);
				const actualMessage = notification.message.substring(colonIndex + 1);

				// Get the author (person who created the message)
				let author = null;
				const authorId = authorIdStr as Id<"users">;
				const authorUser = await ctx.db.get(authorId);

				if (authorUser) {
					author = {
						_id: authorUser._id,
						name: authorUser.name,
						email: authorUser.email,
						image: authorUser.image,
					};
				}

				return {
					...notification,
					message: actualMessage,
					author,
				};
			})
		);

		// Sort by creation time (newest first for feed display)
		return notificationsWithUsers.sort(
			(a, b) => b._creationTime - a._creationTime
		);
	},
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new notification
 */
// TODO: Candidate for deletion if confirmed unused.
export const create = userMutation({
	args: {
		userId: v.id("users"),
		notificationType: v.union(
			v.literal("task_reminder"),
			v.literal("quote_approved"),
			v.literal("invoice_overdue"),
			v.literal("payment_received"),
			v.literal("project_deadline"),
			v.literal("team_assignment")
		),
		title: v.string(),
		message: v.string(),
		entityType: v.optional(
			v.union(
				v.literal("client"),
				v.literal("project"),
				v.literal("quote"),
				v.literal("invoice"),
				v.literal("task")
			)
		),
		entityId: v.optional(v.string()),
		actionUrl: v.optional(v.string()),
		scheduledFor: v.optional(v.number()),
		sentVia: v.optional(
			v.union(v.literal("email"), v.literal("sms"), v.literal("in_app"))
		),
	},
	handler: async (ctx, args): Promise<NotificationId> => {
		// Validate required fields
		if (!args.title.trim()) {
			throw new Error("Notification title is required");
		}

		if (!args.message.trim()) {
			throw new Error("Notification message is required");
		}

		// Validate scheduled time if provided
		if (args.scheduledFor && args.scheduledFor <= Date.now()) {
			throw new Error("Scheduled time must be in the future");
		}

		const notificationId = await createNotificationWithOrg(ctx, {
			...args,
			isRead: false,
		});

		return notificationId;
	},
});

/**
 * Update a notification
 */
// TODO: Candidate for deletion if confirmed unused.
export const update = userMutation({
	args: {
		id: v.id("notifications"),
		title: v.optional(v.string()),
		message: v.optional(v.string()),
		actionUrl: v.optional(v.string()),
		scheduledFor: v.optional(v.number()),
		sentVia: v.optional(
			v.union(v.literal("email"), v.literal("sms"), v.literal("in_app"))
		),
	},
	handler: async (ctx, args): Promise<NotificationId> => {
		const { id, ...updates } = args;

		// Validate fields if being updated
		if (updates.title !== undefined && !updates.title.trim()) {
			throw new Error("Notification title cannot be empty");
		}

		if (updates.message !== undefined && !updates.message.trim()) {
			throw new Error("Notification message cannot be empty");
		}

		if (updates.scheduledFor && updates.scheduledFor <= Date.now()) {
			throw new Error("Scheduled time must be in the future");
		}

		// Filter and validate updates using shared utility
		const filteredUpdates = filterUndefined(updates);
		requireUpdates(filteredUpdates);

		// Validate notification exists and belongs to user's org
		await ctx.orgEntity("notifications", id);

		await ctx.db.patch(id, filteredUpdates);

		return id;
	},
});

/**
 * Mark a notification as read
 */
// TODO: Candidate for deletion if confirmed unused.
export const markRead = userMutation({
	args: { id: v.id("notifications") },
	handler: async (ctx, args): Promise<NotificationId> => {
		const notification = await ctx.orgEntity("notifications", args.id);

		if (notification.isRead) {
			throw new Error("Notification is already read");
		}

		await ctx.db.patch(args.id, {
			isRead: true,
			readAt: Date.now(),
		});

		return args.id;
	},
});

/**
 * Mark a notification as unread
 */
// TODO: Candidate for deletion if confirmed unused.
export const markUnread = userMutation({
	args: { id: v.id("notifications") },
	handler: async (ctx, args): Promise<NotificationId> => {
		const notification = await ctx.orgEntity("notifications", args.id);

		if (!notification.isRead) {
			throw new Error("Notification is already unread");
		}

		await ctx.db.patch(args.id, {
			isRead: false,
			readAt: undefined,
		});

		return args.id;
	},
});

/**
 * Mark multiple notifications as read
 */
// TODO: Candidate for deletion if confirmed unused.
export const markMultipleRead = userMutation({
	args: { ids: v.array(v.id("notifications")) },
	handler: async (ctx, args): Promise<{ updated: number }> => {
		const now = Date.now();
		let updated = 0;

		for (const id of args.ids) {
			let notification: NotificationDocument;
			try {
				notification = await ctx.orgEntity("notifications", id);
			} catch (error) {
				if (error instanceof Error && error.message.startsWith("Entity not found in notifications:")) {
					continue;
				}
				throw error;
			}
			if (!notification.isRead) {
				await ctx.db.patch(id, {
					isRead: true,
					readAt: now,
				});
				updated++;
			}
		}

		return { updated };
	},
});

/**
 * Mark every unread notification for the current user (in the active org) as read
 */
export const markAllRead = userMutation({
	args: {},
	handler: async (ctx): Promise<{ updated: number }> => {
		const now = Date.now();
		const unread = await ctx.db
			.query("notifications")
			.withIndex("by_user_read", (q) =>
				q.eq("userId", ctx.user._id).eq("isRead", false)
			)
			.collect();

		let updated = 0;
		for (const notification of unread) {
			// by_user_read isn't org-scoped; skip notifications from other orgs.
			if (notification.orgId !== ctx.orgId) continue;
			await ctx.db.patch(notification._id, { isRead: true, readAt: now });
			updated++;
		}

		return { updated };
	},
});

/**
 * Mark a notification as sent
 */
// TODO: Candidate for deletion if confirmed unused.
export const markSent = userMutation({
	args: {
		id: v.id("notifications"),
		sentVia: v.union(v.literal("email"), v.literal("sms"), v.literal("in_app")),
	},
	handler: async (ctx, args): Promise<NotificationId> => {
		await ctx.orgEntity("notifications", args.id);

		await ctx.db.patch(args.id, {
			sentAt: Date.now(),
			sentVia: args.sentVia,
		});

		return args.id;
	},
});

/**
 * Delete a notification
 */
// TODO: Candidate for deletion if confirmed unused.
export const remove = userMutation({
	args: { id: v.id("notifications") },
	handler: async (ctx, args): Promise<NotificationId> => {
		await ctx.orgEntity("notifications", args.id); // Validate access
		await ctx.db.delete(args.id);
		return args.id;
	},
});

/**
 * Delete old read notifications (cleanup)
 */
// TODO: Candidate for deletion if confirmed unused.
export const cleanupOldNotifications = userMutation({
	args: { daysOld: v.number() },
	handler: async (ctx, args): Promise<{ deletedCount: number }> => {
		if (args.daysOld < 1) {
			throw new Error("Days old must be at least 1");
		}

		const userOrgId = await getCurrentUserOrgId(ctx);
		const cutoffTime = Date.now() - args.daysOld * 24 * 60 * 60 * 1000;

		const notifications = await ctx.db
			.query("notifications")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		// Filter to old read notifications
		const toDelete = notifications.filter(
			(notification) =>
				notification.isRead && notification._creationTime < cutoffTime
		);

		// Delete old notifications
		for (const notification of toDelete) {
			await ctx.db.delete(notification._id);
		}

		return { deletedCount: toDelete.length };
	},
});

/**
 * Emit an org-owner notification for a Stripe webhook lifecycle event.
 */
export const createWebhookNotificationInternal = systemMutation({
	args: {
		type: v.union(
			v.literal("payment_failed"),
			v.literal("dispute_created"),
			v.literal("charge_refunded"),
			v.literal("payout_paid"),
			v.literal("payout_failed"),
			v.literal("capability_degraded"),
			v.literal("bank_account_changed")
		),
		paymentId: v.optional(v.id("payments")),
		priority: v.union(v.literal("normal"), v.literal("high")),
		message: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const org = await ctx.db.get(ctx.orgId);
		if (!org) {
			console.warn(
				`createWebhookNotificationInternal: org ${ctx.orgId} not found`
			);
			return null;
		}

		const TITLE_BY_TYPE: Record<typeof args.type, string> = {
			payment_failed: "Payment failed",
			dispute_created: "Dispute filed",
			charge_refunded: "Refund issued",
			payout_paid: "Payout sent",
			payout_failed: "Payout failed",
			capability_degraded: "Stripe capability disabled",
			bank_account_changed: "Bank account updated",
		};
		const title = TITLE_BY_TYPE[args.type];

		// Only payment lifecycle notifications reference an invoice entity.
		// entityId must be the invoice doc ID — the payments table ID would
		// resolve to null when the UI follows entityType+entityId for navigation.
		// The dedicated `paymentId` field below still preserves the payment ref.
		const isInvoiceEntity =
			args.type === "payment_failed" ||
			args.type === "dispute_created" ||
			args.type === "charge_refunded";
		let invoiceEntityId: Id<"invoices"> | undefined;
		if (isInvoiceEntity && args.paymentId) {
			const payment = await ctx.db.get(args.paymentId);
			invoiceEntityId = payment?.invoiceId;
		}

		await ctx.db.insert("notifications", {
			orgId: ctx.orgId,
			userId: org.ownerUserId,
			notificationType: args.type,
			title,
			message: args.message,
			...(invoiceEntityId
				? { entityType: "invoice" as const, entityId: invoiceEntityId }
				: {}),
			isRead: false,
			sentVia: "in_app",
			sentAt: Date.now(),
			priority: args.priority,
			paymentId: args.paymentId,
		});
		return null;
	},
});

/**
 * Create a mention notification
 */
export const createMention = userMutation({
	args: {
		taggedUserId: v.id("users"),
		message: v.string(),
		entityType: v.union(
			v.literal("client"),
			v.literal("project"),
			v.literal("quote")
		),
		entityId: v.string(),
		entityName: v.string(),
		// Note: Maximum 10 attachments enforced in handler validation
		attachments: v.optional(
			v.array(
				v.object({
					storageId: v.id("_storage"),
					fileName: v.string(),
					fileSize: v.number(),
					mimeType: v.string(),
				})
			)
		),
	},
	handler: async (ctx, args): Promise<NotificationId> => {
		// Get current user
		const currentUser = await ctx.auth.getUserIdentity();
		if (!currentUser) {
			throw new Error("Not authenticated");
		}

		const userOrgId = await getCurrentUserOrgId(ctx);

		// Get the current user's record (the author)
		const author = await ctx.db
			.query("users")
			.withIndex("by_external_id", (q) =>
				q.eq("externalId", currentUser.subject)
			)
			.first();

		if (!author) {
			throw new Error("User not found");
		}

		// Validate message
		if (!args.message.trim()) {
			throw new Error("Message cannot be empty");
		}

		// Validate tagged user exists and is in same organization
		await validateUserAccess(ctx, args.taggedUserId, userOrgId);

		// Validate attachments if provided
		if (args.attachments && args.attachments.length > 0) {
			const MAX_ATTACHMENTS = 10;
			const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
			const MAX_FILENAME_LENGTH = 255;
			const MIME_TYPE_REGEX =
				/^[a-zA-Z0-9][a-zA-Z0-9!#$&^_+-]+\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]+$/;

			// Validate attachment count
			if (args.attachments.length > MAX_ATTACHMENTS) {
				throw new Error("Maximum 10 attachments allowed per message");
			}

			for (const attachment of args.attachments) {
				// Validate fileName
				const trimmedFileName = attachment.fileName.trim();
				if (!trimmedFileName) {
					throw new Error("Attachment fileName cannot be empty");
				}
				if (trimmedFileName.length > MAX_FILENAME_LENGTH) {
					throw new Error(
						`Attachment fileName exceeds maximum length of ${MAX_FILENAME_LENGTH} characters`
					);
				}
				// Check for path traversal patterns
				if (
					trimmedFileName.includes("../") ||
					trimmedFileName.startsWith("/") ||
					trimmedFileName.startsWith("\\")
				) {
					throw new Error(
						`Invalid fileName: path traversal characters are not allowed`
					);
				}

				// Validate fileSize
				if (attachment.fileSize <= 0) {
					throw new Error("Attachment fileSize must be greater than 0");
				}
				if (attachment.fileSize > MAX_FILE_SIZE) {
					throw new Error(
						`Attachment fileSize exceeds maximum size of ${MAX_FILE_SIZE} bytes (100MB)`
					);
				}

				// Validate mimeType
				if (!attachment.mimeType.includes("/")) {
					throw new Error("Invalid mimeType: must follow type/subtype pattern");
				}
				if (!MIME_TYPE_REGEX.test(attachment.mimeType)) {
					throw new Error(`Invalid mimeType format: ${attachment.mimeType}`);
				}

				// Verify storageId exists
				try {
					const storageUrl = await ctx.storage.getUrl(attachment.storageId);
					if (!storageUrl) {
						throw new Error(
							`Storage file not found for storageId: ${attachment.storageId}`
						);
					}
				} catch {
					throw new Error(
						`Invalid storageId: ${attachment.storageId} - file does not exist in storage`
					);
				}
			}
		}

		// Generate action URL
		const actionUrl = `/${args.entityType}s/${args.entityId}`;

		// Determine notification type
		const notificationTypeMap = {
			client: "client_mention" as const,
			project: "project_mention" as const,
			quote: "quote_mention" as const,
		};

		const notificationType = notificationTypeMap[args.entityType];

		// Create title with author name
		const title = `${author.name} mentioned you in ${args.entityName}`;

		// Store the author's ID in the title field temporarily
		// We'll use a special format: "authorId:message"
		const messageWithAuthor = `${author._id}:${args.message}`;

		const hasAttachments = args.attachments && args.attachments.length > 0;

		// Create the notification
		// Note: We create the notification FIRST to get the notificationId needed for attachments
		// If attachment creation fails, we'll clean up by deleting the notification
		const notificationId = await createNotificationWithOrg(ctx, {
			userId: args.taggedUserId,
			notificationType,
			title,
			message: messageWithAuthor, // Store author ID with message
			entityType: args.entityType,
			entityId: args.entityId,
			actionUrl,
			isRead: false,
			sentVia: "in_app",
			sentAt: Date.now(),
			hasAttachments,
		});

		// Create attachment records if any
		// If this fails, delete the notification to maintain consistency
		if (hasAttachments) {
			try {
				for (const attachment of args.attachments!) {
					await ctx.db.insert("messageAttachments", {
						orgId: userOrgId,
						notificationId,
						uploadedBy: author._id,
						entityType: args.entityType,
						entityId: args.entityId,
						fileName: attachment.fileName,
						fileSize: attachment.fileSize,
						mimeType: attachment.mimeType,
						storageId: attachment.storageId,
						uploadedAt: Date.now(),
					});
				}
			} catch (error) {
				// Rollback: delete the notification we just created
				await ctx.db.delete(notificationId);

				// Clean up any partial attachments that might have been created
				const partialAttachments = await ctx.db
					.query("messageAttachments")
					.withIndex("by_notification", (q) =>
						q.eq("notificationId", notificationId)
					)
					.collect();

				for (const attachment of partialAttachments) {
					await ctx.db.delete(attachment._id);
				}

				// Re-throw the error after cleanup
				throw error;
			}
		}

		// Enqueue the device push AFTER the rollback block — a rolled-back mention
		// (which throws above) never reaches here. enqueuePush self-gates on
		// PUSHABLE_TYPES. Future notification types push by calling this same helper
		// at their creation site once their type is added to PUSHABLE_TYPES.
		// clerkOrgId is the Clerk active-org id (for plan 03's setActive), NOT the
		// Convex organizations._id — mirrors resolveCurrentUserOrgId in lib/auth.
		const clerkIdentity = currentUser as typeof currentUser & {
			activeOrgId?: string;
			orgId?: string | null;
			org_id?: string | null;
		};
		const clerkOrgId =
			clerkIdentity.activeOrgId ??
			clerkIdentity.orgId ??
			clerkIdentity.org_id ??
			"";
		await enqueuePush(ctx, {
			notificationType, // COMPUTED notificationTypeMap[entityType] — NOT a literal
			taggedUserId: args.taggedUserId,
			title,
			body: args.message, // RAW text, not the authorId:message composite
			url: actionUrl,
			notificationId,
			orgId: clerkOrgId,
		});

		return notificationId;
	},
});
