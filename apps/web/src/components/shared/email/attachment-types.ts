import type { Id } from "@onetool/backend/convex/_generated/dataModel";

export interface ComposerAttachment {
	storageId: Id<"_storage">;
	filename: string;
	mimeType: string;
	size: number;
	source: "generated-pdf" | "upload";
}

/** Mirrors MAX_ATTACHMENT_BYTES in convex/email/attachments.ts. */
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Re-exported so the pick-time block list stays identical to the send-time one. */
export {
	BLOCKED_ATTACHMENT_EXTENSIONS,
	attachmentExtension,
	isBlockedAttachmentFilename,
} from "@onetool/backend/convex/lib/attachmentPolicy";

export function totalAttachmentBytes(
	attachments: readonly { size: number }[]
): number {
	return attachments.reduce((total, item) => total + item.size, 0);
}

/** Strips `source`, which is composer-only; Convex rejects unknown fields. */
export function toOutboundAttachments(
	attachments: readonly ComposerAttachment[]
): Omit<ComposerAttachment, "source">[] {
	return attachments.map(({ storageId, filename, mimeType, size }) => ({
		storageId,
		filename,
		mimeType,
		size,
	}));
}
