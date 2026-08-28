/**
 * Normalized email shapes. All app send code operates on these; provider
 * specifics live behind the outbound seam (email/outbound.ts). Kept minimal
 * (Resend-only ships) per PRD §3.1 — a second provider would add an adapter,
 * not a registry.
 */

import type { Id } from "../_generated/dataModel";

/** A file to attach, already in Convex storage. */
export interface OutboundAttachment {
	storageId: Id<"_storage">;
	filename: string;
	mimeType: string;
	size: number; // bytes; re-derived from storage metadata server-side
}

/** A message to send, provider-agnostic. */
export interface OutboundMessage {
	from: string; // "Name <addr>"
	to: string[];
	cc?: string[];
	bcc?: string[];
	replyTo?: string[];
	subject: string;
	html: string;
	text?: string;
	inReplyTo?: string; // RFC 5322 Message-ID this replies to
	references?: string[]; // RFC Message-ID chain (oldest -> newest)
	idempotencyKey?: string; // app-level dedup key (e.g. "quote-<id>-sent")
	/**
	 * Attachments force the manual transport: the durable component's
	 * sendEmail has no attachments option, so the send is deferred to an
	 * action that streams the blobs and calls the raw SDK. See
	 * email/attachmentSend.ts.
	 */
	attachments?: OutboundAttachment[];
}
