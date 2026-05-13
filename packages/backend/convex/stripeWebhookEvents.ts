import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Atomically transition a webhook event into "processing".
 *
 * Returns { proceed: true, eventDocId } when the caller should run the
 * type-switch. Returns { proceed: false } only when status === "processed"
 * (a true duplicate already handled successfully).
 *
 * On status === "failed" / "received" / "processing" the row is transitioned
 * back to "processing", attemptCount is incremented, prior failure metadata
 * is cleared, and proceed is true. This makes failed/stuck events retryable
 * when Stripe replays them via the Dashboard "Resend" button (FINDINGS W-1).
 */
export const startProcessingEvent = internalMutation({
	args: {
		stripeEventId: v.string(),
		eventType: v.string(),
		accountId: v.optional(v.string()),
		receivedAt: v.number(),
	},
	returns: v.object({
		proceed: v.boolean(),
		eventDocId: v.optional(v.id("stripeWebhookEvents")),
	}),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("stripeWebhookEvents")
			.withIndex("by_stripe_event_id", (q) =>
				q.eq("stripeEventId", args.stripeEventId)
			)
			.unique();

		if (!existing) {
			const eventDocId = await ctx.db.insert("stripeWebhookEvents", {
				stripeEventId: args.stripeEventId,
				eventType: args.eventType,
				accountId: args.accountId,
				status: "processing",
				receivedAt: args.receivedAt,
				attemptCount: 1,
			});
			return { proceed: true, eventDocId };
		}

		if (existing.status === "processed") {
			return { proceed: false };
		}

		// Retry path: failed / stuck-processing / received -> re-enter processing.
		await ctx.db.patch(existing._id, {
			status: "processing",
			attemptCount: existing.attemptCount + 1,
			failedAt: undefined,
			failureReason: undefined,
		});
		return { proceed: true, eventDocId: existing._id };
	},
});

export const markEventProcessed = internalMutation({
	args: { eventDocId: v.id("stripeWebhookEvents") },
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.eventDocId, {
			status: "processed",
			processedAt: Date.now(),
		});
		return null;
	},
});

/**
 * Bookkeeping for a failed event. Caller has already failed; this MUST NOT
 * throw so the route can propagate the original error and 5xx, letting
 * Stripe retry on its standard schedule.
 */
export const markEventFailed = internalMutation({
	args: {
		eventDocId: v.id("stripeWebhookEvents"),
		failureReason: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.eventDocId, {
			status: "failed",
			failedAt: Date.now(),
			failureReason: args.failureReason.slice(0, 1024),
		});
		return null;
	},
});
