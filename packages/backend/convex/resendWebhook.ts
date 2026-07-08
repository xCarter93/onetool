import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { logWebhookError, logWebhookSuccess } from "./lib/webhooks";
import { recordSuppression } from "./email/suppressions";

const WEBHOOK_SERVICE = "Resend";

/**
 * Process Resend webhook events for email tracking
 */
export const handleWebhookEvent = internalMutation({
	args: {
		eventType: v.union(
			v.literal("email.sent"),
			v.literal("email.delivered"),
			v.literal("email.delivered_delayed"),
			v.literal("email.complained"),
			v.literal("email.bounced"),
			v.literal("email.opened")
		),
		emailId: v.string(),
		timestamp: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const eventTimestamp = args.timestamp || Date.now();

		// Find the email message by Resend email ID
		const emailMessage = await ctx.db
			.query("emailMessages")
			.withIndex("by_resend_id", (q) => q.eq("resendEmailId", args.emailId))
			.first();

		if (!emailMessage) {
			// This can happen for outbound emails if the webhook arrives before we've saved the record,
			// or if this is an email sent from another source.
			// For inbound emails, this shouldn't happen as we create them when processing.
			logWebhookError(
				WEBHOOK_SERVICE,
				args.eventType,
				new Error("Email message not found"),
				args.emailId
			);
			return { success: false, message: "Email message not found" };
		}

		// Update email status based on event type
		switch (args.eventType) {
			case "email.delivered":
			case "email.delivered_delayed":
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

			case "email.opened":
				// Skip if already opened or if in invalid state (bounced/complained)
				if (
					emailMessage.openedAt ||
					emailMessage.status === "bounced" ||
					emailMessage.status === "complained"
				) {
					break;
				}

				// Perform atomic conditional patch
				// Re-fetch to ensure we have the latest state and can detect race conditions
				const currentState = await ctx.db.get(emailMessage._id);

				if (!currentState) {
					logWebhookError(
						WEBHOOK_SERVICE,
						args.eventType,
						new Error("Email message no longer exists"),
						String(emailMessage._id)
					);
					break;
				}

				// Double-check conditions: only update if openedAt is null and status is valid
				if (
					currentState.openedAt === undefined &&
					currentState.status !== "bounced" &&
					currentState.status !== "complained"
				) {
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
				}
				break;

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

			case "email.sent":
				// Update sent timestamp if needed
				if (!emailMessage.sentAt) {
					await ctx.db.patch(emailMessage._id, {
						sentAt: eventTimestamp,
					});
				}
				break;
		}

		logWebhookSuccess(WEBHOOK_SERVICE, args.eventType, args.emailId);
		return { success: true };
	},
});
