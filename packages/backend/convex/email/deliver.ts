import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { sendOutbound } from "./outbound";
import { recordOutboundAttachments } from "./attachments";
import { bumpThread } from "./threads";
import type { OutboundMessage } from "./types";

export interface DeliverOutboundResult {
	outcome: "sent" | "duplicate" | "suppressed";
	emailMessageId?: Id<"emailMessages">;
	/** Empty string until the attachment action reports back. */
	resendEmailId: string | null;
}

/**
 * Send + record: runs the outbound seam, writes the emailMessages row, hands
 * a deferred (attachment-bearing) send to its action, and bumps the thread.
 * Every entity-linked and inbox send goes through here so the inbox stays a
 * complete record of what left the org.
 */
export async function deliverOutbound(
	ctx: MutationCtx,
	args: {
		orgId: Id<"organizations">;
		clientId: Id<"clients"> | null;
		threadDocId: Id<"emailThreads">;
		message: OutboundMessage;
		record: {
			messageBody: string;
			messagePreview: string;
			fromEmail: string;
			fromName: string;
			toName: string;
			htmlBody?: string;
			visibleText?: string;
			sentBy?: Id<"users">;
			systemSent?: boolean;
			quoteId?: Id<"quotes">;
			invoiceId?: Id<"invoices">;
			projectId?: Id<"projects">;
		};
	}
): Promise<DeliverOutboundResult> {
	const { message, record } = args;
	const result = await sendOutbound(ctx, args.orgId, message);

	if (result.skipped === "suppressed") {
		return { outcome: "suppressed", resendEmailId: null };
	}
	if (result.skipped === "duplicate") {
		return {
			outcome: "duplicate",
			emailMessageId: result.emailMessageId,
			resendEmailId: result.resendEmailId,
		};
	}
	if (!result.resendEmailId && !result.deferred) {
		throw new Error("Email could not be sent.");
	}

	const sentAt = Date.now();
	const attachments = message.attachments ?? [];
	const emailMessageId = await ctx.db.insert("emailMessages", {
		orgId: args.orgId,
		clientId: args.clientId,
		// Deferred sends learn their provider id in the scheduled action.
		resendEmailId: result.resendEmailId ?? "",
		direction: "outbound",
		threadId: args.threadDocId,
		threadDocId: args.threadDocId,
		subject: message.subject,
		messageBody: record.messageBody,
		messagePreview: record.messagePreview,
		...(record.htmlBody ? { htmlBody: record.htmlBody } : {}),
		...(record.visibleText ? { visibleText: record.visibleText } : {}),
		fromEmail: record.fromEmail,
		fromName: record.fromName,
		toEmail: message.to[0],
		toName: record.toName,
		...(message.cc && message.cc.length > 0 ? { cc: message.cc } : {}),
		...(message.bcc && message.bcc.length > 0 ? { bcc: message.bcc } : {}),
		...(attachments.length > 0 ? { hasAttachments: true } : {}),
		...(message.inReplyTo ? { inReplyTo: message.inReplyTo } : {}),
		...(message.references ? { references: message.references } : {}),
		...(message.idempotencyKey
			? { idempotencyKey: message.idempotencyKey }
			: {}),
		...(record.quoteId ? { quoteId: record.quoteId } : {}),
		...(record.invoiceId ? { invoiceId: record.invoiceId } : {}),
		...(record.projectId ? { projectId: record.projectId } : {}),
		...(record.systemSent ? { systemSent: true } : {}),
		status: "sent",
		sentAt,
		...(record.sentBy ? { sentBy: record.sentBy } : {}),
	});

	if (result.deferred) {
		await recordOutboundAttachments(ctx, {
			orgId: args.orgId,
			emailMessageId,
			attachments,
			from: message.from,
			to: message.to,
			cc: message.cc,
			bcc: message.bcc,
			replyTo: message.replyTo,
			subject: message.subject,
			html: message.html,
			text: message.text,
			inReplyTo: message.inReplyTo,
			references: message.references,
		});
	}

	await bumpThread(ctx, args.threadDocId, {
		sentAt,
		participantEmail: message.to[0],
		subject: message.subject,
		preview: record.messagePreview,
		direction: "outbound",
	});

	return {
		outcome: "sent",
		emailMessageId,
		resendEmailId: result.resendEmailId,
	};
}
