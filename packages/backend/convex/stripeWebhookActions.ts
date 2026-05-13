import type Stripe from "stripe";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Stripe Connect webhook event handler. Invoked by the `/stripe-webhook`
 * httpAction in `convex/http.ts` AFTER signature verification.
 *
 * Trust boundary: the httpAction in `http.ts` MUST verify the Stripe
 * signature (`verifyStripeWebhook` in `lib/webhooks.ts`) before dispatching.
 * Internal-only — not reachable from clients.
 *
 * Outer flow (FINDINGS W-1 status-field lifecycle):
 *   startProcessingEvent → type-switch → markEventProcessed | markEventFailed
 *
 * On thrown errors this re-throws so the httpAction returns 5xx and Stripe
 * retries on its standard schedule (FINDINGS W-2). markEventFailed itself
 * never throws — bookkeeping only.
 */
export const handleEvent = internalAction({
	args: {
		eventId: v.string(),
		eventType: v.string(),
		account: v.union(v.string(), v.null()),
		created: v.number(),
		data: v.any(),
	},
	returns: v.object({
		duplicate: v.boolean(),
		orgFound: v.optional(v.boolean()),
	}),
	handler: async (ctx, args) => {
		// FINDINGS W-1: status-field lifecycle. startProcessingEvent atomically
		// transitions to "processing" (or short-circuits as duplicate when status
		// is "processed"). Failed/stuck events transition back to processing
		// and become retryable on Stripe replay.
		const { proceed, eventDocId } = await ctx.runMutation(
			internal.stripeWebhookEvents.startProcessingEvent,
			{
				stripeEventId: args.eventId,
				eventType: args.eventType,
				accountId: args.account ?? undefined,
				receivedAt: Date.now(),
			}
		);
		if (!proceed) return { duplicate: true };

		try {
			// FINDINGS L-3: account.updated may arrive with event.account === null
			// for some Stripe Connect topologies. Fall back to data.object.id
			// (the Stripe.Account's own id) before doing the org lookup.
			let resolvedAccount: string | null = args.account;
			if (
				!resolvedAccount &&
				args.eventType === "account.updated" &&
				typeof args.data?.object?.id === "string"
			) {
				resolvedAccount = args.data.object.id;
			}

			const org = resolvedAccount
				? await ctx.runQuery(
						internal.organizations.getByStripeConnectAccountIdInternal,
						{ accountId: resolvedAccount }
					)
				: null;

			if (!org && resolvedAccount) {
				console.warn(
					`Stripe event ${args.eventId} (${args.eventType}) for unknown account ${resolvedAccount}`
				);
				// Unknown account is terminal: mark processed so we don't retry endlessly.
				await ctx.runMutation(
					internal.stripeWebhookEvents.markEventProcessed,
					{ eventDocId: eventDocId! }
				);
				return { duplicate: false, orgFound: false };
			}

			// Type switch — five core events (CONTEXT.md "Webhook Event Coverage (Core 5)").
			switch (args.eventType) {
				case "checkout.session.completed": {
					const session = args.data.object as Stripe.Checkout.Session;
					await ctx.runMutation(
						internal.payments.markPaidFromWebhookInternal,
						{
							orgId: org!._id,
							sessionId: session.id,
							amountTotal: session.amount_total ?? 0,
							metadata: session.metadata ?? {},
							paymentIntentId:
								typeof session.payment_intent === "string"
									? session.payment_intent
									: (session.payment_intent?.id ?? null),
						}
					);
					break;
				}
				case "payment_intent.payment_failed": {
					const pi = args.data.object as Stripe.PaymentIntent;
					// FINDINGS W-3: look up payment by pi.id and pass paymentId to the
					// notification creator. Best-effort — if the PI failed before any
					// successful confirm persisted stripePaymentIntentId on the
					// payment row, the lookup returns null and we still emit the
					// notification (the message body carries pi.id for triage).
					// Payment row stays "pending" — buyer may retry checkout.
					const payment = await ctx.runQuery(
						internal.payments.getByPaymentIntentIdInternal,
						{ orgId: org!._id, paymentIntentId: pi.id }
					);
					await ctx.runMutation(
						internal.notifications.createWebhookNotificationInternal,
						{
							orgId: org!._id,
							type: "payment_failed",
							paymentId: payment?._id,
							priority: "normal",
							message:
								`Payment failed for payment_intent ${pi.id}: ` +
								(pi.last_payment_error?.message ?? "Unknown error"),
						}
					);
					break;
				}
				case "charge.refunded": {
					const charge = args.data.object as Stripe.Charge;
					const piId =
						typeof charge.payment_intent === "string"
							? charge.payment_intent
							: charge.payment_intent?.id;
					if (!piId) {
						console.warn(
							`charge.refunded missing payment_intent for charge ${charge.id}`
						);
						break;
					}
					await ctx.runMutation(
						internal.payments.markRefundedFromWebhookInternal,
						{
							orgId: org!._id,
							paymentIntentId: piId,
							refundedAt: Date.now(),
						}
					);
					break;
				}
				case "charge.dispute.created": {
					const dispute = args.data.object as Stripe.Dispute;
					const piId =
						typeof dispute.payment_intent === "string"
							? dispute.payment_intent
							: dispute.payment_intent?.id;
					if (!piId) {
						console.warn(
							`charge.dispute.created missing payment_intent for dispute ${dispute.id}`
						);
						break;
					}
					// flagDisputedFromWebhookInternal emits the W-3 notification internally
					// with the 7-day response window referenced in the message body.
					await ctx.runMutation(
						internal.payments.flagDisputedFromWebhookInternal,
						{
							orgId: org!._id,
							paymentIntentId: piId,
							disputeId: dispute.id,
						}
					);
					break;
				}
				case "account.updated": {
					const account = args.data.object as Stripe.Account;
					await ctx.runMutation(
						internal.organizations.updateStripeConnectStatusInternal,
						{
							orgId: org!._id,
							chargesEnabled: account.charges_enabled,
							payoutsEnabled: account.payouts_enabled,
							detailsSubmitted: account.details_submitted,
							requirementsCurrentlyDue:
								account.requirements?.currently_due ?? [],
							requirementsDisabledReason:
								account.requirements?.disabled_reason ?? undefined,
						}
					);
					break;
				}
				default:
					console.log(
						`Stripe webhook: unhandled event type ${args.eventType}`
					);
			}

			// FINDINGS W-1: success path → mark processed.
			await ctx.runMutation(internal.stripeWebhookEvents.markEventProcessed, {
				eventDocId: eventDocId!,
			});
			return { duplicate: false, orgFound: true };
		} catch (err) {
			// FINDINGS W-1: failure → bookkeeping mutation (does NOT throw) +
			// re-throw so the route returns 5xx and Stripe retries (W-2).
			await ctx.runMutation(internal.stripeWebhookEvents.markEventFailed, {
				eventDocId: eventDocId!,
				failureReason: err instanceof Error ? err.message : "unknown",
			});
			throw err;
		}
	},
});
