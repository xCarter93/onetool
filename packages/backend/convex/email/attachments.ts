import { ConvexError, v } from "convex/values";
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { OutboundAttachment } from "./types";
import { isBlockedAttachmentFilename } from "../lib/attachmentPolicy";

/**
 * Total raw bytes allowed per email. Resend's own ceiling is 40MB *after*
 * base64 (~30MB raw), but Gmail rejects around 25MB, so the usable cap is
 * lower than either provider limit.
 */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Validator for the attachment argument shared by every compose surface. */
export const outboundAttachmentValidator = v.object({
	storageId: v.id("_storage"),
	filename: v.string(),
	mimeType: v.string(),
	size: v.number(),
});

/** The quote or invoice whose generated PDFs may be attached without a claim. */
export interface AttachmentEntity {
	type: "quote" | "invoice";
	id: string;
}

/**
 * A storageId is attachable only if this org claimed it at upload time, or it
 * is a PDF this org generated for the entity being sent.
 */
async function ownsStorage(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	storageId: Id<"_storage">,
	entity: AttachmentEntity | undefined
): Promise<boolean> {
	const claim = await ctx.db
		.query("emailUploads")
		.withIndex("by_storage", (q) => q.eq("storageId", storageId))
		.first();
	if (claim) return claim.orgId === orgId;

	if (!entity) return false;
	const documents = await ctx.db
		.query("documents")
		.withIndex("by_document", (q) =>
			q.eq("documentType", entity.type).eq("documentId", entity.id)
		)
		.collect();
	return documents.some(
		(doc) =>
			doc.orgId === orgId &&
			(doc.storageId === storageId || doc.signedStorageId === storageId)
	);
}

/**
 * Resolve client-supplied attachment descriptors against real storage
 * metadata: the filename must be sendable, the org must own the blob, and the
 * true total must fit the cap. The client's `size` is advisory only — never
 * trusted for the cap.
 */
export async function resolveOutboundAttachments(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	attachments: OutboundAttachment[] | undefined,
	entity?: AttachmentEntity
): Promise<OutboundAttachment[] | undefined> {
	if (!attachments || attachments.length === 0) return undefined;

	const resolved: OutboundAttachment[] = [];
	let total = 0;
	for (const attachment of attachments) {
		// Re-checked on the SEND filename, not just at upload: otherwise a blob
		// claimed as "safe.pdf" could be sent as "payload.exe".
		if (isBlockedAttachmentFilename(attachment.filename)) {
			throw new ConvexError({
				code: "BAD_REQUEST",
				message: `"${attachment.filename}" is a file type email providers refuse. Remove it and try again.`,
			});
		}

		const meta = await ctx.db.system.get(attachment.storageId);
		if (
			!meta ||
			!(await ownsStorage(ctx, orgId, attachment.storageId, entity))
		) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: `Attachment "${attachment.filename}" is no longer available. Remove it and try again.`,
			});
		}
		total += meta.size;
		resolved.push({
			storageId: attachment.storageId,
			filename: attachment.filename,
			mimeType: meta.contentType ?? attachment.mimeType,
			size: meta.size,
		});
	}

	if (total > MAX_ATTACHMENT_BYTES) {
		const totalMb = (total / (1024 * 1024)).toFixed(1);
		throw new ConvexError({
			code: "CONFLICT",
			message: `Attachments total ${totalMb}MB, over the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB limit. Remove one and try again.`,
		});
	}

	return resolved;
}

/**
 * Record the attachment rows for a deferred send and schedule the action that
 * actually delivers it. Call immediately after inserting the emailMessages row
 * whose `sendOutbound` result came back `deferred`.
 */
export async function recordOutboundAttachments(
	ctx: MutationCtx,
	args: {
		orgId: Id<"organizations">;
		emailMessageId: Id<"emailMessages">;
		attachments: OutboundAttachment[];
		from: string;
		to: string[];
		cc?: string[];
		bcc?: string[];
		replyTo?: string[];
		subject: string;
		html: string;
		text?: string;
		inReplyTo?: string;
		references?: string[];
	}
): Promise<void> {
	const now = Date.now();
	for (const attachment of args.attachments) {
		await ctx.db.insert("emailAttachments", {
			orgId: args.orgId,
			emailMessageId: args.emailMessageId,
			direction: "outbound",
			filename: attachment.filename,
			contentType: attachment.mimeType,
			size: attachment.size,
			storageId: attachment.storageId,
			receivedAt: now,
		});
	}

	await ctx.scheduler.runAfter(0, internal.email.attachmentSend.deliver, {
		emailMessageId: args.emailMessageId,
		from: args.from,
		to: args.to,
		cc: args.cc,
		bcc: args.bcc,
		replyTo: args.replyTo,
		subject: args.subject,
		html: args.html,
		text: args.text,
		inReplyTo: args.inReplyTo,
		references: args.references,
	});
}
