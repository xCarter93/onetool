import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId, getCurrentUser } from "./lib/auth";
import { getOptionalOrgId } from "./lib/queries";
import { StorageHelpers } from "./lib/storage";
import { getMembership } from "./lib/memberships";
import { optionalUserQuery, userMutation } from "./lib/factories";

/**
 * Message Attachments operations
 * Handles file attachments for mention messages/notifications
 */

// Type definitions
type MessageAttachment = Doc<"messageAttachments">;
type MessageAttachmentId = Id<"messageAttachments">;

/**
 * Helper: Get attachment with org validation
 */
async function getAttachmentWithOrgValidation(
	ctx: QueryCtx | MutationCtx,
	id: MessageAttachmentId
): Promise<MessageAttachment | null> {
	const userOrgId = await getCurrentUserOrgId(ctx);
	const attachment = await ctx.db.get(id);

	if (!attachment) {
		return null;
	}

	if (attachment.orgId !== userOrgId) {
		throw new Error("Attachment does not belong to your organization");
	}

	return attachment;
}

/**
 * Helper: Get attachment or throw
 */
async function getAttachmentOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: MessageAttachmentId
): Promise<MessageAttachment> {
	const attachment = await getAttachmentWithOrgValidation(ctx, id);
	if (!attachment) {
		throw new Error("Attachment not found");
	}
	return attachment;
}

/**
 * Generate an upload URL for file uploads
 */
export const generateUploadUrl = userMutation({
	args: {},
	handler: async (ctx) => {
		// Ensure user is authenticated
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("Not authenticated");
		}

		return await StorageHelpers.generateUploadUrl(ctx);
	},
});

/**
 * Create a new message attachment record after file is uploaded
 */
export const create = userMutation({
	args: {
		notificationId: v.id("notifications"),
		entityType: v.union(
			v.literal("client"),
			v.literal("project"),
			v.literal("quote")
		),
		entityId: v.string(),
		fileName: v.string(),
		fileSize: v.number(),
		mimeType: v.string(),
		storageId: v.id("_storage"),
	},
	handler: async (ctx, args): Promise<MessageAttachmentId> => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("Not authenticated");
		}

		const userOrgId = await getCurrentUserOrgId(ctx);

		// Validate notification exists and belongs to user's org
		const notification = await ctx.db.get(args.notificationId);
		if (!notification) {
			throw new Error("Notification not found");
		}
		if (notification.orgId !== userOrgId) {
			throw new Error("Notification does not belong to your organization");
		}

		// Validate file metadata
		const validation = StorageHelpers.validateFileMetadata({
			fileName: args.fileName,
			fileSize: args.fileSize,
			mimeType: args.mimeType,
		});

		if (!validation.valid) {
			// If validation fails, delete the uploaded file
			await StorageHelpers.deleteFromStorage(ctx, args.storageId);
			throw new Error(validation.error || "Invalid file");
		}

		// Create attachment record
		const attachmentId = await ctx.db.insert("messageAttachments", {
			orgId: userOrgId,
			notificationId: args.notificationId,
			uploadedBy: user._id,
			entityType: args.entityType,
			entityId: args.entityId,
			fileName: args.fileName,
			fileSize: args.fileSize,
			mimeType: args.mimeType,
			storageId: args.storageId,
			uploadedAt: Date.now(),
		});

		// Update notification to mark it has attachments
		await ctx.db.patch(args.notificationId, {
			hasAttachments: true,
		});

		return attachmentId;
	},
});

/**
 * Get attachments for a notification
 */
export const listByNotification = optionalUserQuery({
	args: {
		notificationId: v.id("notifications"),
	},
	handler: async (ctx, args): Promise<MessageAttachment[]> => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return [];
		}

		// Validate notification access
		const notification = await ctx.db.get(args.notificationId);
		if (!notification || notification.orgId !== userOrgId) {
			return [];
		}

		const attachments = await ctx.db
			.query("messageAttachments")
			.withIndex("by_notification", (q) =>
				q.eq("notificationId", args.notificationId)
			)
			.collect();

		// Filter by org (extra safety)
		return attachments.filter((a) => a.orgId === userOrgId);
	},
});

/**
 * Get attachments for a notification with download URLs
 * Optimized to avoid N+1 query problem
 */
export const listByNotificationWithUrls = optionalUserQuery({
	args: {
		notificationId: v.id("notifications"),
	},
	handler: async (
		ctx,
		args
	): Promise<(MessageAttachment & { downloadUrl: string | null })[]> => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return [];
		}

		// Validate notification access
		const notification = await ctx.db.get(args.notificationId);
		if (!notification || notification.orgId !== userOrgId) {
			return [];
		}

		const attachments = await ctx.db
			.query("messageAttachments")
			.withIndex("by_notification", (q) =>
				q.eq("notificationId", args.notificationId)
			)
			.collect();

		// Filter by org (extra safety)
		const filtered = attachments.filter((a) => a.orgId === userOrgId);

		// Fetch download URLs for all attachments in parallel
		const withUrls = await Promise.all(
			filtered.map(async (attachment) => {
				const downloadUrl = await StorageHelpers.getStorageUrl(
					ctx,
					attachment.storageId
				);
				return {
					...attachment,
					downloadUrl,
				};
			})
		);

		return withUrls;
	},
});

/**
 * Get all attachments for a specific entity (client, project, or quote)
 * Includes download URLs to avoid N+1 query problem
 */
export const listByEntity = optionalUserQuery({
	args: {
		entityType: v.union(
			v.literal("client"),
			v.literal("project"),
			v.literal("quote")
		),
		entityId: v.string(),
	},
	handler: async (
		ctx,
		args
	): Promise<(MessageAttachment & { downloadUrl: string | null })[]> => {
		const userOrgId = ctx.orgId;
		if (!userOrgId) {
			return [];
		}

		// Attachment metadata follows the parent entity's view grant.
		const entityObject = (
			{ client: "clients", project: "projects", quote: "quotes" } as const
		)[args.entityType];
		if (!(await ctx.gateRead(entityObject))) {
			return [];
		}

		const attachments = await ctx.db
			.query("messageAttachments")
			.withIndex("by_entity", (q) =>
				q.eq("entityType", args.entityType).eq("entityId", args.entityId)
			)
			.collect();

		// Filter by org and sort by upload time (newest first)
		const filtered = attachments
			.filter((a) => a.orgId === userOrgId)
			.sort((a, b) => b.uploadedAt - a.uploadedAt);

		// Fetch download URLs for all attachments in parallel
		const withUrls = await Promise.all(
			filtered.map(async (attachment) => {
				const downloadUrl = await StorageHelpers.getStorageUrl(
					ctx,
					attachment.storageId
				);
				return {
					...attachment,
					downloadUrl,
				};
			})
		);

		return withUrls;
	},
});

/**
 * Get a specific attachment with metadata and URL
 */
export const get = optionalUserQuery({
	args: { id: v.id("messageAttachments") },
	handler: async (
		ctx,
		args
	): Promise<
		| (MessageAttachment & {
				url: string | null;
				category: "image" | "document" | "archive" | "other";
				formattedSize: string;
		  })
		| null
	> => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return null;
		}

		const attachment = await getAttachmentWithOrgValidation(ctx, args.id);
		if (!attachment) {
			return null;
		}

		const url = await StorageHelpers.getStorageUrl(ctx, attachment.storageId);
		const category = StorageHelpers.getFileCategory(attachment.mimeType);
		const formattedSize = StorageHelpers.formatFileSize(attachment.fileSize);

		return {
			...attachment,
			url,
			category,
			formattedSize,
		};
	},
});

/**
 * Get download URL for an attachment
 */
export const getDownloadUrl = optionalUserQuery({
	args: { id: v.id("messageAttachments") },
	handler: async (ctx, args): Promise<string | null> => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return null;
		}

		const attachment = await getAttachmentWithOrgValidation(ctx, args.id);
		if (!attachment) {
			return null;
		}

		return await StorageHelpers.getStorageUrl(ctx, attachment.storageId);
	},
});

/**
 * Delete an attachment
 */
export const remove = userMutation({
	args: { id: v.id("messageAttachments") },
	handler: async (ctx, args): Promise<MessageAttachmentId> => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new Error("Not authenticated");
		}

		const attachment = await getAttachmentOrThrow(ctx, args.id);

		// Only the uploader or org admin can delete
		if (attachment.uploadedBy !== user._id) {
			// TODO: Add admin check if needed
			throw new Error("You can only delete your own attachments");
		}

		// Delete from storage
		const deleteResult = await StorageHelpers.deleteFromStorage(
			ctx,
			attachment.storageId
		);

		if (!deleteResult.success) {
			console.warn(`Failed to delete file from storage: ${deleteResult.error}`);
			// Continue anyway - remove DB record
		}

		// Delete the record
		await ctx.db.delete(args.id);

		// Check if notification still has other attachments
		const remainingAttachments = await ctx.db
			.query("messageAttachments")
			.withIndex("by_notification", (q) =>
				q.eq("notificationId", attachment.notificationId)
			)
			.collect();

		// Update notification flag if no more attachments
		if (remainingAttachments.length === 0) {
			await ctx.db.patch(attachment.notificationId, {
				hasAttachments: false,
			});
		}

		return args.id;
	},
});

/**
 * Get all attachments uploaded by a user (for stats/management)
 */
export const listByUploader = optionalUserQuery({
	args: {
		userId: v.optional(v.id("users")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<MessageAttachment[]> => {
		const currentUser = await getCurrentUser(ctx);
		if (!currentUser) {
			return [];
		}

		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return [];
		}

		const userId = args.userId || currentUser._id;

		// If a specific userId was provided, validate it belongs to the same organization
		if (args.userId) {
			const targetUser = await ctx.db.get(args.userId);
			if (!targetUser) {
				// User not found
				return [];
			}

			// Check if user is a member of the current organization
			const membership = await getMembership(ctx, args.userId, userOrgId);
			if (!membership) {
				// User does not belong to the same organization
				return [];
			}
		}

		let attachments = await ctx.db
			.query("messageAttachments")
			.withIndex("by_uploader", (q) => q.eq("uploadedBy", userId))
			.collect();

		// Filter by current organization
		attachments = attachments.filter((a) => a.orgId === userOrgId);

		// Sort by upload time (newest first)
		attachments.sort((a, b) => b.uploadedAt - a.uploadedAt);

		// Apply limit if specified
		if (args.limit && args.limit > 0) {
			attachments = attachments.slice(0, args.limit);
		}

		return attachments;
	},
});

/**
 * Get attachment statistics for organization
 */
export const getStats = optionalUserQuery({
	args: {},
	handler: async (ctx) => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return {
				total: 0,
				totalSize: 0,
				byCategory: {
					image: 0,
					document: 0,
					archive: 0,
					other: 0,
				},
				thisMonth: 0,
			};
		}

		const attachments = await ctx.db
			.query("messageAttachments")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		const stats = {
			total: attachments.length,
			totalSize: 0,
			byCategory: {
				image: 0,
				document: 0,
				archive: 0,
				other: 0,
			},
			thisMonth: 0,
		};

		const monthStart = new Date();
		monthStart.setDate(1);
		monthStart.setHours(0, 0, 0, 0);
		const monthStartTime = monthStart.getTime();

		attachments.forEach((attachment) => {
			stats.totalSize += attachment.fileSize;

			const category = StorageHelpers.getFileCategory(attachment.mimeType);
			stats.byCategory[category]++;

			if (attachment.uploadedAt >= monthStartTime) {
				stats.thisMonth++;
			}
		});

		return stats;
	},
});

/**
 * Validate file before upload (called from client)
 */
export const validateFile = optionalUserQuery({
	args: {
		fileName: v.string(),
		fileSize: v.number(),
		mimeType: v.string(),
	},
	handler: async (ctx, args) => {
		// Just validate using the shared helper
		return StorageHelpers.validateFileMetadata({
			fileName: args.fileName,
			fileSize: args.fileSize,
			mimeType: args.mimeType,
		});
	},
});
