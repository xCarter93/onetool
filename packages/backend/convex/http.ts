import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError } from "convex/values";
import {
	verifySvixWebhook,
	verifyBoldSignWebhook,
	webhookSuccess,
	webhookError,
	webhookUnauthorized,
	webhookBadRequest,
	logWebhookReceived,
	logWebhookSuccess,
	logWebhookError,
	secondsToMilliseconds,
	isoToMilliseconds,
} from "./lib/webhooks";

const http = httpRouter();

/**
 * Comprehensive Clerk Webhook Handler
 *
 * Handles all Clerk events for users and organizations with:
 * - Robust error handling and logging
 * - Data validation before processing
 * - Graceful handling of webhook timing issues
 * - Support for organization lifecycle (create, update, delete)
 * - User membership management
 *
 * Supported Events:
 * - user.created / user.updated: Sync user data to Convex
 * - user.deleted: Clean up user data
 * - session.created: Update last sign-in date
 * - organization.created: Create organization metadata in Convex
 * - organization.updated: Sync organization name changes
 * - organization.deleted: Clean up organization and remove all members
 * - organizationMembership.created: Add user to organization
 * - organizationMembership.deleted: Remove user from organization
 */
http.route({
	path: "/clerk-users-webhook",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const result = await verifySvixWebhook(
			request,
			process.env.CLERK_USER_WEBHOOK_SECRET!
		);

		if (!result.valid || !result.payload) {
			console.error("Clerk webhook verification failed:", result.error);
			return webhookBadRequest("Error occurred");
		}

		const event = result.payload;
		logWebhookReceived("Clerk", event.type);

		switch (event.type) {
			case "user.created": // intentional fallthrough
			case "user.updated":
				await ctx.runMutation(internal.users.upsertFromClerk, {
					data: event.data,
				});
				break;

			case "user.deleted": {
				const clerkUserId = event.data.id!;
				await ctx.runMutation(internal.users.deleteFromClerk, { clerkUserId });
				break;
			}

			case "session.created": {
				const clerkUserId = event.data.user_id!;
				await ctx.runMutation(internal.users.updateLastSignedInDate, {
					clerkUserId,
				});
				break;
			}

			// Organization events
			case "organization.created": {
				const orgData = event.data;
				logWebhookReceived("Clerk", "organization.created", orgData.id);

				if (!orgData.id || !orgData.name || !orgData.created_by) {
					console.error("Missing required organization data:", orgData);
					break;
				}

				try {
					await ctx.runMutation(internal.organizations.createFromClerk, {
						clerkOrganizationId: orgData.id,
						name: orgData.name,
						ownerClerkUserId: orgData.created_by,
						logoUrl: orgData.image_url || undefined,
					});
					logWebhookSuccess("Clerk", "organization.created", orgData.id);
				} catch (error) {
					logWebhookError("Clerk", "organization.created", error, orgData.id);
					// Don't throw - let webhook succeed but log the error
				}
				break;
			}

			case "organization.updated": {
				const orgData = event.data;
				logWebhookReceived("Clerk", "organization.updated", orgData.id);

				if (!orgData.id || !orgData.name) {
					console.error(
						"Missing required organization data for update:",
						orgData
					);
					break;
				}

				try {
					await ctx.runMutation(internal.organizations.updateFromClerk, {
						clerkOrganizationId: orgData.id,
						name: orgData.name,
						logoUrl: orgData.image_url || undefined,
					});
					logWebhookSuccess("Clerk", "organization.updated", orgData.id);
				} catch (error) {
					logWebhookError("Clerk", "organization.updated", error, orgData.id);
				}
				break;
			}

			case "organization.deleted": {
				const orgData = event.data;
				logWebhookReceived("Clerk", "organization.deleted", orgData.id);

				if (!orgData.id) {
					console.error("Missing organization ID for deletion:", orgData);
					break;
				}

				try {
					await ctx.runMutation(internal.organizations.deleteFromClerk, {
						clerkOrganizationId: orgData.id,
					});
					logWebhookSuccess("Clerk", "organization.deleted", orgData.id);
				} catch (error) {
					logWebhookError("Clerk", "organization.deleted", error, orgData.id);
				}
				break;
			}

			case "organizationMembership.created": {
				const membershipData = event.data;
				const userId = membershipData.public_user_data?.user_id;
				const orgId = membershipData.organization?.id;

				logWebhookReceived(
					"Clerk",
					"organizationMembership.created",
					`user:${userId} org:${orgId}`
				);

				if (!userId || !orgId) {
					console.error("Missing required membership data:", {
						userId,
						orgId,
						membershipData,
					});
					break;
				}

				try {
					await ctx.runMutation(internal.users.updateUserOrganization, {
						clerkUserId: userId,
						clerkOrganizationId: orgId,
						role: membershipData.role ?? undefined,
					});
					logWebhookSuccess(
						"Clerk",
						"organizationMembership.created",
						`user:${userId} org:${orgId}`
					);
				} catch (error) {
					logWebhookError(
						"Clerk",
						"organizationMembership.created",
						error,
						`user:${userId} org:${orgId}`
					);
				}
				break;
			}

			case "organizationMembership.updated": {
				const membershipData = event.data;
				const userId = membershipData.public_user_data?.user_id;
				const orgId = membershipData.organization?.id;

				logWebhookReceived(
					"Clerk",
					"organizationMembership.updated",
					`user:${userId} org:${orgId}`
				);

				if (!userId || !orgId) {
					console.error("Missing required membership data for update:", {
						userId,
						orgId,
						membershipData,
					});
					break;
				}

				try {
					await ctx.runMutation(internal.users.updateUserOrganization, {
						clerkUserId: userId,
						clerkOrganizationId: orgId,
						role: membershipData.role ?? undefined,
					});
					logWebhookSuccess(
						"Clerk",
						"organizationMembership.updated",
						`user:${userId} org:${orgId}`
					);
				} catch (error) {
					logWebhookError(
						"Clerk",
						"organizationMembership.updated",
						error,
						`user:${userId} org:${orgId}`
					);
				}
				break;
			}

			case "organizationMembership.deleted": {
				const membershipData = event.data;
				const userId = membershipData.public_user_data?.user_id;
				const orgId = membershipData.organization?.id;

				logWebhookReceived(
					"Clerk",
					"organizationMembership.deleted",
					`user:${userId} org:${orgId}`
				);

				if (!userId) {
					console.error(
						"Missing user ID for membership deletion:",
						membershipData
					);
					break;
				}

				if (!orgId) {
					console.error(
						"Missing organization ID for membership deletion:",
						membershipData
					);
					break;
				}

				try {
					await ctx.runMutation(internal.users.removeUserFromOrganization, {
						clerkUserId: userId,
						clerkOrganizationId: orgId,
					});
					logWebhookSuccess(
						"Clerk",
						"organizationMembership.deleted",
						`user:${userId}`
					);
				} catch (error) {
					logWebhookError(
						"Clerk",
						"organizationMembership.deleted",
						error,
						`user:${userId}`
					);
				}
				break;
			}

			default:
				console.log("Ignored Clerk webhook event", event.type);
		}

		return webhookSuccess();
	}),
});

/**
 * BoldSign Webhook Handler
 *
 * Handles BoldSign e-signature document events:
 * - Verification: Initial webhook URL verification during setup
 * - Completed: Document was signed by all parties
 * - Declined: Document was declined by a signer
 * - Revoked: Document was revoked by sender
 * - Expired: Document expired before completion
 */
http.route({
	path: "/boldsign-webhook",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		// BoldSign verification requests need special handling (no signature)
		// Clone the request so we can read the body twice if needed
		const clonedRequest = request.clone();
		const payloadString = await clonedRequest.text();

		// Handle BoldSign verification event (sent during webhook setup)
		const event = JSON.parse(payloadString);
		if (event.event?.eventType === "Verification") {
			logWebhookReceived("BoldSign", "Verification");
			return webhookSuccess("OK");
		}

		// Verify webhook signature for actual events (mandatory)
		const boldsignSecret = process.env.BOLDSIGN_WEBHOOK_SECRET;
		if (!boldsignSecret) {
			console.error("BOLDSIGN_WEBHOOK_SECRET not configured - rejecting webhook");
			return webhookError(500, "Webhook verification not configured");
		}

		const boldsignVerification = await verifyBoldSignWebhook(
			request,
			boldsignSecret
		);

		if (!boldsignVerification.valid) {
			console.error("BoldSign webhook verification failed:", boldsignVerification.error);
			return webhookUnauthorized();
		}
		console.log("BoldSign webhook signature verified successfully");

		const eventType = event.event?.eventType;
		const boldsignDocumentId = event.data?.documentId || event.documentId;

		logWebhookReceived("BoldSign", eventType, boldsignDocumentId);

		// BoldSign returns timestamps in seconds, convert to milliseconds
		const eventTimestamp = event.event?.created
			? secondsToMilliseconds(event.event.created)
			: undefined;

		// Handle all signature lifecycle events
		switch (eventType) {
			case "Sent":
			case "Viewed":
			case "Signed":
			case "Completed":
			case "Declined":
			case "Revoked":
			case "Expired":
				await ctx.runMutation(internal.boldsign.handleWebhook, {
					boldsignDocumentId,
					eventType,
					eventTimestamp,
				});
				logWebhookSuccess("BoldSign", eventType, boldsignDocumentId);
				break;
			default:
				console.log("Unhandled BoldSign event type:", eventType);
		}

		return webhookSuccess("OK");
	}),
});

/**
 * Clerk Billing Webhook Handler
 *
 * Handles Clerk billing events for subscriptions and payments:
 * - paymentAttempt.created: Log new payment attempts
 * - paymentAttempt.updated: Track payment status changes
 * - subscription.created: Initialize new subscriptions
 * - subscription.active: Activate premium features
 * - subscription.updated: Sync subscription changes
 * - subscription.pastDue: Handle payment failures
 */
http.route({
	path: "/clerk-billing-webhook",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const result = await verifySvixWebhook(
			request,
			process.env.CLERK_BILLING_WEBHOOK_SECRET!
		);

		if (!result.valid || !result.payload) {
			console.error("Clerk billing webhook verification failed:", result.error);
			return webhookBadRequest("Error validating webhook");
		}

		const event = result.payload;
		logWebhookReceived("ClerkBilling", event.type);

		// Type definitions for Clerk billing webhook data
		interface BillingWebhookData {
			id: string;
			organization_id?: string;
			user_id?: string;
			amount?: number;
			status?: string;
			plan_id?: string;
			plan?: { id: string };
			current_period_start?: number;
			payer?: {
				organization_id?: string;
				user_id?: string;
			};
		}

		switch (event.type) {
			case "paymentAttempt.created": {
				const data = event.data as BillingWebhookData;
				const organizationId =
					data.payer?.organization_id || data.organization_id;

				await ctx.runMutation(
					internal.billingWebhook.handlePaymentAttemptCreated,
					{
						paymentAttemptId: data.id,
						organizationId: organizationId,
						amount: data.amount,
					}
				);
				break;
			}

			case "paymentAttempt.updated": {
				const data = event.data as BillingWebhookData;
				const organizationId =
					data.payer?.organization_id || data.organization_id;

				await ctx.runMutation(
					internal.billingWebhook.handlePaymentAttemptUpdated,
					{
						paymentAttemptId: data.id,
						status: data.status,
						organizationId: organizationId,
					}
				);
				break;
			}

			case "subscription.created": {
				const data = event.data as BillingWebhookData;
				const organizationId =
					data.payer?.organization_id || data.organization_id;

				if (!organizationId) {
					console.error("No organization_id in subscription.created event");
					break;
				}
				await ctx.runMutation(
					internal.billingWebhook.handleSubscriptionCreated,
					{
						subscriptionId: data.id,
						organizationId: organizationId,
						planId: data.plan_id || data.plan?.id || "",
						status: data.status || "active",
						currentPeriodStart: data.current_period_start
							? secondsToMilliseconds(data.current_period_start)
							: undefined,
					}
				);
				break;
			}

			case "subscription.active": {
				const data = event.data as BillingWebhookData;
				const organizationId =
					data.payer?.organization_id || data.organization_id;

				if (!organizationId) {
					console.error("No organization_id in subscription.active event");
					break;
				}
				await ctx.runMutation(
					internal.billingWebhook.handleSubscriptionActive,
					{
						subscriptionId: data.id,
						organizationId: organizationId,
						planId: data.plan_id || data.plan?.id || "",
						currentPeriodStart: data.current_period_start
							? secondsToMilliseconds(data.current_period_start)
							: undefined,
					}
				);
				break;
			}

			case "subscription.updated": {
				const data = event.data as BillingWebhookData;
				console.log("subscription.updated event data:", data);

				const organizationId =
					data.payer?.organization_id || data.organization_id;

				if (!organizationId) {
					console.error("No organization_id in subscription.updated event");
					break;
				}
				await ctx.runMutation(
					internal.billingWebhook.handleSubscriptionUpdated,
					{
						subscriptionId: data.id,
						organizationId: organizationId,
						planId: data.plan_id || data.plan?.id || "",
						status: data.status || "active",
						currentPeriodStart: data.current_period_start
							? secondsToMilliseconds(data.current_period_start)
							: undefined,
					}
				);
				break;
			}

			case "subscription.pastDue": {
				const data = event.data as BillingWebhookData;
				const organizationId =
					data.payer?.organization_id || data.organization_id;

				if (!organizationId) {
					console.error("No organization_id in subscription.pastDue event");
					break;
				}
				await ctx.runMutation(
					internal.billingWebhook.handleSubscriptionPastDue,
					{
						subscriptionId: data.id,
						organizationId: organizationId,
					}
				);
				break;
			}

			default:
				console.log("Ignored billing webhook event:", event.type);
		}

		return webhookSuccess();
	}),
});

/**
 * Resend Email Webhook Handler
 *
 * Handles Resend email events for tracking:
 * - email.sent: Email was accepted by Resend
 * - email.delivered: Email was delivered to recipient
 * - email.opened: Email was opened by recipient
 * - email.bounced: Email bounced
 * - email.complained: Recipient marked as spam
 */
http.route({
	path: "/resend-webhook",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			// Resend uses Svix for webhooks - verify if secret is configured
			// Type matches the Resend webhook payload structure
			interface ResendAttachment {
				id: string;
				filename: string;
				content_type: string;
				content_disposition?: string;
				content_id?: string;
			}

			let event: {
				type: string;
				created_at?: string;
				data: {
					email_id?: string;
					from?: string;
					to?: string[];
					subject?: string;
					message_id?: string;
					in_reply_to?: string;
					references?: string[];
					attachments?: ResendAttachment[];
				};
			};

			const resendSecret = process.env.RESEND_WEBHOOK_SECRET;
			if (!resendSecret) {
				console.error("RESEND_WEBHOOK_SECRET not configured - rejecting webhook");
				return webhookError(500, "Webhook verification not configured");
			}

			const resendVerification = await verifySvixWebhook(
				request,
				resendSecret
			);

			if (!resendVerification.valid || !resendVerification.payload) {
				console.error("Resend webhook verification failed:", resendVerification.error);
				return webhookUnauthorized();
			}
			event = resendVerification.payload as typeof event;

			const eventType = event.type;
			const emailId = event.data?.email_id;

			logWebhookReceived("Resend", eventType, emailId);

			if (!emailId) {
				console.warn("No email_id in Resend webhook event");
				return webhookBadRequest("Missing email_id");
			}

			// Resend timestamps are in ISO format, convert to milliseconds
			const eventTimestamp = event.created_at
				? isoToMilliseconds(event.created_at)
				: Date.now();

			// Handle email events
			switch (eventType) {
				case "email.sent":
				case "email.delivered":
				case "email.delivered_delayed":
				case "email.opened":
				case "email.bounced":
				case "email.complained":
					await ctx.runMutation(internal.resendWebhook.handleWebhookEvent, {
						eventType,
						emailId,
						timestamp: eventTimestamp,
					});
					logWebhookSuccess("Resend", eventType, emailId);
					break;

				case "email.received":
					// Handle inbound email (use runAction instead of runMutation)
					// Note: Webhook payload does NOT include html/text content, only metadata
					// We need to fetch content separately using the Received emails API
					logWebhookReceived("Resend", "email.received (inbound)", emailId);
					try {
						await ctx.runAction(internal.resendReceiving.handleInboundEmail, {
							emailId,
							from: event.data.from || "",
							to: event.data.to || [],
							subject: event.data.subject || "(No subject)",
							messageId: event.data.message_id || emailId,
							inReplyTo: event.data.in_reply_to,
							references: event.data.references,
							attachments: event.data.attachments || [],
						});
						logWebhookSuccess("Resend", "email.received (inbound)", emailId);
					} catch (error) {
						logWebhookError("Resend", "email.received (inbound)", error, emailId);
						// Return 200 anyway to prevent Resend from retrying
					}
					break;

				default:
					console.log("Unhandled Resend event type:", eventType);
			}

			return webhookSuccess("OK");
		} catch (error) {
			console.error("Error processing Resend webhook:", error);
			return webhookError(500, "Internal Server Error");
		}
	}),
});

/**
 * [Review fix Greptile-P1] Portal OTP request endpoint.
 *
 * Trust model — server-to-server only:
 *  - This httpAction is publicly reachable at <deployment>.convex.site, but
 *    is gated by a shared `x-portal-secret` header (constant-time compared
 *    against PORTAL_OTP_REQUEST_SECRET on the deployment). Without the
 *    secret, all calls 401 and never reach the rate-limiter or DB.
 *  - Only the Next.js portal server holds the secret. It derives `ipHash`
 *    from CDN-trusted headers it can verify (CF-Connecting-IP,
 *    X-Vercel-Forwarded-For, …) — Convex deliberately does NOT re-derive IP
 *    here, because forwarding headers reaching Convex's HTTP edge cannot
 *    be trusted.
 *  - `internal.portal.otp.requestOtp` is unreachable from public Convex
 *    clients (it is `internalMutation`), so this httpAction is the only
 *    way to invoke it.
 *
 * Effect: the per-IP rate-limit bucket (`portalOtpSendPerIp`, 30/hr) keys
 * on a hash derived in a context the attacker cannot influence.
 */
// [Review fix Greptile-P2] No CORS headers: this endpoint is server-to-server
// only (Next.js portal → Convex), invoked via server-side fetch where CORS is
// irrelevant. No browser should ever reach it; omitting Access-Control-Allow-*
// causes browsers that try to be blocked by default — which is what we want.
// The OPTIONS preflight route was removed for the same reason.

function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

http.route({
	path: "/portal/otp/request",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const expected = process.env.PORTAL_OTP_REQUEST_SECRET;
		if (!expected) {
			// Misconfiguration: fail closed.
			return new Response(
				JSON.stringify({ error: "Portal misconfigured" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
		const presented = request.headers.get("x-portal-secret") ?? "";
		if (!constantTimeEqual(presented, expected)) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}

		let body: {
			clientPortalId?: unknown;
			email?: unknown;
			ipHash?: unknown;
		};
		try {
			body = (await request.json()) as typeof body;
		} catch {
			return new Response(
				JSON.stringify({ error: "Invalid JSON body" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const clientPortalId =
			typeof body.clientPortalId === "string" ? body.clientPortalId : "";
		const email = typeof body.email === "string" ? body.email : "";
		const ipHash = typeof body.ipHash === "string" ? body.ipHash : "";
		if (!clientPortalId || !email || !email.includes("@") || !ipHash) {
			return new Response(
				JSON.stringify({ error: "Enter a valid email address." }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		try {
			await ctx.runMutation(internal.portal.otp.requestOtp, {
				clientPortalId,
				email,
				ipHash,
			});
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (err) {
			if (err instanceof ConvexError) {
				const data = err.data as { code?: string; retryAfter?: number };
				if (data.code === "OTP_RATE_LIMITED") {
					return new Response(
						JSON.stringify({
							error: "Too many requests. Try again in a few minutes.",
							code: data.code,
							retryAfter: data.retryAfter,
						}),
						{
							status: 429,
							headers: {
								"Content-Type": "application/json",
							},
						},
					);
				}
			}
			// Pitfall #1 — uniform success on any other failure path.
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
	}),
});

export default http;
