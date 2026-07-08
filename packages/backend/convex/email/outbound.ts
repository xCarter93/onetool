import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { resend } from "./durableResend";
import { OutboundMessage } from "./types";
import { isSuppressed } from "./suppressions";

export interface SendResult {
	resendEmailId: string | null; // null when skipped
	skipped?: "suppressed" | "duplicate";
	emailMessageId?: Id<"emailMessages">; // set when a duplicate short-circuits
}

/**
 * The single outbound seam. Every app send path goes through here; provider
 * specifics (the durable component + RFC header mapping + idempotency +
 * suppression) are localized to this module. Swap this file to change providers.
 */
export async function sendOutbound(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	msg: OutboundMessage
): Promise<SendResult> {
	// App-level idempotency: the component guarantees a single enqueue sends
	// once, but can't stop us enqueuing twice for the same logical action.
	const idempotencyKey = msg.idempotencyKey;
	if (idempotencyKey) {
		const existing = await ctx.db
			.query("emailMessages")
			.withIndex("by_idempotency_key", (q) =>
				q.eq("idempotencyKey", idempotencyKey)
			)
			.first();
		if (existing && existing.orgId === orgId) {
			return {
				resendEmailId: existing.resendEmailId,
				skipped: "duplicate",
				emailMessageId: existing._id,
			};
		}
	}

	// Suppression: never send to a hard-bounced/complained/manually-blocked address.
	for (const to of msg.to) {
		if (await isSuppressed(ctx, orgId, to)) {
			return { resendEmailId: null, skipped: "suppressed" };
		}
	}

	// Map normalized message -> durable component options. RFC threading headers
	// go through the generic `headers` array (the component has no dedicated field).
	const headers: { name: string; value: string }[] = [];
	if (msg.inReplyTo) headers.push({ name: "In-Reply-To", value: msg.inReplyTo });
	if (msg.references && msg.references.length > 0) {
		headers.push({ name: "References", value: msg.references.join(" ") });
	}

	const emailId = await resend.sendEmail(ctx, {
		from: msg.from,
		to: msg.to,
		subject: msg.subject,
		html: msg.html,
		...(msg.text ? { text: msg.text } : {}),
		...(msg.replyTo && msg.replyTo.length > 0 ? { replyTo: msg.replyTo } : {}),
		...(headers.length > 0 ? { headers } : {}),
	});

	return { resendEmailId: emailId };
}
