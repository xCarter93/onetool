import { ConvexError, v } from "convex/values";
import { getCurrentUser } from "./lib/auth";
import { getOptionalOrgId } from "./lib/queries";
import {
	optionalUserQuery,
	userMutation,
	type UserMutationCtx,
} from "./lib/factories";
import { isBlockedAttachmentFilename } from "./lib/attachmentPolicy";

/** Reachable from inbox compose and the quote/invoice modals. */
async function requireComposeAccess(ctx: UserMutationCtx): Promise<void> {
	const allowed =
		(await ctx.can("inbox", "modify")) ||
		(await ctx.can("quotes", "modify")) ||
		(await ctx.can("invoices", "modify"));
	if (!allowed) {
		await ctx.requireLevel("inbox", "modify");
	}
}

/**
 * Signed upload URL for a composer attachment. The returned storageId is
 * passed back on the send mutation's `attachments` argument.
 */
export const generateUploadUrl = userMutation({
	args: {},
	returns: v.string(),
	handler: async (ctx) => {
		await requireComposeAccess(ctx);
		return await ctx.storage.generateUploadUrl();
	},
});

/**
 * Claim an uploaded blob for this org. Call right after the signed upload
 * completes: without a claim the send path refuses the storageId, which is what
 * stops one org attaching another's file.
 */
export const registerUpload = userMutation({
	args: {
		storageId: v.id("_storage"),
		filename: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireComposeAccess(ctx);

		if (isBlockedAttachmentFilename(args.filename)) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: `"${args.filename}" is a file type email providers refuse. Attach it as a PDF or zip instead.`,
			});
		}

		const meta = await ctx.db.system.get(args.storageId);
		if (!meta) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "That upload is no longer available. Try uploading it again.",
			});
		}

		const existing = await ctx.db
			.query("emailUploads")
			.withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
			.first();
		if (existing) {
			// Another org already claimed it — say nothing that confirms it exists.
			if (existing.orgId !== ctx.orgId) {
				throw new ConvexError({
					code: "NOT_FOUND",
					message:
						"That upload is no longer available. Try uploading it again.",
				});
			}
			return null;
		}

		await ctx.db.insert("emailUploads", {
			orgId: ctx.orgId,
			storageId: args.storageId,
			filename: args.filename,
			uploadedBy: ctx.user._id,
			createdAt: Date.now(),
		});
		return null;
	},
});

/**
 * List all attachments for an email message
 */
export const listByEmail = optionalUserQuery({
	args: {
		emailMessageId: v.id("emailMessages"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return [];
		}

		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) {
			return [];
		}

		// Verify the email belongs to the user's organization
		const email = await ctx.db.get(args.emailMessageId);
		if (!email || email.orgId !== orgId) {
			return [];
		}

		const attachments = await ctx.db
			.query("emailAttachments")
			.withIndex("by_email", (q) => q.eq("emailMessageId", args.emailMessageId))
			.collect();

		return attachments;
	},
});

/**
 * Get download URL for an attachment
 */
export const getDownloadUrl = optionalUserQuery({
	args: {
		attachmentId: v.id("emailAttachments"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return null;
		}

		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) {
			return null;
		}

		const attachment = await ctx.db.get(args.attachmentId);
		if (!attachment || attachment.orgId !== orgId) {
			return null;
		}

		if (!attachment.storageId) {
			return null;
		}

		const url = await ctx.storage.getUrl(attachment.storageId);
		return url;
	},
});

/**
 * Mark an attachment as downloaded (for tracking purposes)
 */
export const markAsDownloaded = userMutation({
	args: {
		attachmentId: v.id("emailAttachments"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			return { success: false };
		}

		const orgId = await getOptionalOrgId(ctx);
		if (!orgId) {
			return { success: false };
		}

		const attachment = await ctx.db.get(args.attachmentId);
		if (!attachment || attachment.orgId !== orgId) {
			return { success: false };
		}

		// In the future, you could add a downloadCount field to track this
		// For now, just return success
		return { success: true };
	},
});

