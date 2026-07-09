/**
 * Normalized email shapes. All app send code operates on these; provider
 * specifics live behind the outbound seam (email/outbound.ts). Kept minimal
 * (Resend-only ships) per PRD §3.1 — a second provider would add an adapter,
 * not a registry.
 */

/** A message to send, provider-agnostic. */
export interface OutboundMessage {
	from: string; // "Name <addr>"
	to: string[];
	replyTo?: string[];
	subject: string;
	html: string;
	text?: string;
	inReplyTo?: string; // RFC 5322 Message-ID this replies to
	references?: string[]; // RFC Message-ID chain (oldest -> newest)
	idempotencyKey?: string; // app-level dedup key (e.g. "quote-<id>-sent")
}
