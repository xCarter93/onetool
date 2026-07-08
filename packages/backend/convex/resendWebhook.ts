import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { vOnEmailEventArgs } from "@convex-dev/resend";
import { logWebhookError, logWebhookSuccess } from "./lib/webhooks";
import { recordSuppression } from "./email/suppressions";

const WEBHOOK_SERVICE = "Resend";

/**
 * Email lifecycle events, delivered via the @convex-dev/resend component's
 * onEmailEvent callback (registered in email/durableResend.ts; http.ts
 * forwards the raw Resend webhook to the component).
 *
 * `args.id` is the component EmailId — the value sendOutbound stores in
 * `emailMessages.resendEmailId`. Correlating on it is required: the raw
 * webhook payload carries Resend's own email_id, which we never see at send
 * time (sendEmail returns the component id), so a direct lookup on webhook
 * payloads can never match an outbound row.
 */
export const handleEmailEvent = internalMutation({
	args: vOnEmailEventArgs,
	returns: v.object({
		success: v.boolean(),
		message: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const eventType = args.event.type;
		const parsedCreatedAt = Date.parse(args.event.created_at);
		const eventTimestamp = Number.isNaN(parsedCreatedAt)
			? Date.now()
			: parsedCreatedAt;

		// Find the email message by the component EmailId we stored at send time.
		const emailMessage = await ctx.db
			.query("emailMessages")
			.withIndex("by_resend_id", (q) => q.eq("resendEmailId", args.id))
			.first();

		if (!emailMessage) {
			// Emails sent outside sendOutbound (or before the row was written).
			logWebhookError(
				WEBHOOK_SERVICE,
				eventType,
				new Error("Email message not found"),
				args.id
			);
			return { success: false, message: "Email message not found" };
		}

		// Statuses that out-of-order/late events must never overwrite.
		const isTerminal =
			emailMessage.status === "bounced" ||
			emailMessage.status === "complained" ||
			emailMessage.status === "failed";

		switch (eventType) {
			case "email.delivered":
				// Idempotent against webhook redelivery, and never regress a
				// terminal status on out-of-order delivery events.
				if (
					isTerminal ||
					emailMessage.status === "delivered" ||
					emailMessage.status === "opened" ||
					emailMessage.deliveredAt !== undefined
				) {
					break;
				}
				await ctx.db.patch(emailMessage._id, {
					status: "delivered",
					deliveredAt: eventTimestamp,
				});

				// Create activity for delivery (only if sentBy + client are defined)
				if (emailMessage.sentBy && emailMessage.clientId) {
					await ctx.db.insert("activities", {
						orgId: emailMessage.orgId,
						userId: emailMessage.sentBy,
						activityType: "email_delivered",
						entityType: "client",
						entityId: emailMessage.clientId,
						entityName: emailMessage.toName,
						description: `Email delivered: ${emailMessage.subject}`,
						metadata: {
							emailId: emailMessage._id,
							subject: emailMessage.subject,
						},
						timestamp: eventTimestamp,
						isVisible: true,
					});
				}
				break;

			case "email.opened": {
				// Skip if already opened or already in a terminal state.
				if (emailMessage.openedAt !== undefined || isTerminal) {
					break;
				}

				await ctx.db.patch(emailMessage._id, {
					status: "opened",
					openedAt: eventTimestamp,
				});

				// Create activity only after successful patch (only if sentBy + client are defined)
				if (emailMessage.sentBy && emailMessage.clientId) {
					await ctx.db.insert("activities", {
						orgId: emailMessage.orgId,
						userId: emailMessage.sentBy,
						activityType: "email_opened",
						entityType: "client",
						entityId: emailMessage.clientId,
						entityName: emailMessage.toName,
						description: `Email opened: ${emailMessage.subject}`,
						metadata: {
							emailId: emailMessage._id,
							subject: emailMessage.subject,
						},
						timestamp: eventTimestamp,
						isVisible: true,
					});
				}
				break;
			}

			case "email.bounced":
				await ctx.db.patch(emailMessage._id, {
					status: "bounced",
					bouncedAt: eventTimestamp,
				});
				// Suppress the recipient so we never send to it again.
				// (Resend surfaces hard bounces here; soft bounces are retried
				// internally and generally don't fire this event.)
				await recordSuppression(ctx, {
					orgId: emailMessage.orgId,
					email: emailMessage.toEmail,
					reason: "hard_bounce",
					source: "resend_webhook",
				});
				break;

			case "email.complained":
				await ctx.db.patch(emailMessage._id, {
					status: "complained",
					complainedAt: eventTimestamp,
				});
				await recordSuppression(ctx, {
					orgId: emailMessage.orgId,
					email: emailMessage.toEmail,
					reason: "complaint",
					source: "resend_webhook",
				});
				break;

			case "email.failed":
				// Permanent send failure — surface it instead of leaving "sent",
				// but don't clobber a more specific bounce/complaint verdict.
				if (isTerminal) {
					break;
				}
				await ctx.db.patch(emailMessage._id, {
					status: "failed",
					failedAt: eventTimestamp,
				});
				break;

			case "email.sent":
				// Update sent timestamp if needed
				if (!emailMessage.sentAt) {
					await ctx.db.patch(emailMessage._id, {
						sentAt: eventTimestamp,
					});
				}
				break;

			case "email.delivery_delayed":
			case "email.clicked":
				// Transient / informational — a terminal event follows.
				break;
		}

		logWebhookSuccess(WEBHOOK_SERVICE, eventType, args.id);
		return { success: true };
	},
});
