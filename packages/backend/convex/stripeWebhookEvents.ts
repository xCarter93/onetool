import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./lib/triggers";

/** Well past Stripe's 3-day webhook replay window, so a retry still dedupes. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DELETE_BATCH = 200;
/** Longer than any handler runs; a stuck attempt past this is reclaimable. */
const LEASE_MS = 5 * 60 * 1000;

/**
 * Claim a webhook event for processing. Processed events are duplicates; an
 * attempt still inside its lease is skipped (`inProgress`) rather than
 * reclaimed; failed, unresolved, and expired attempts are retried.
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
		inProgress: v.optional(v.boolean()),
	}),
	handler: async (ctx, args) => {
		const now = Date.now();
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
				claimedAt: now,
				attemptCount: 1,
			});
			return { proceed: true, eventDocId };
		}

		if (existing.status === "processed") {
			return { proceed: false };
		}
		if (
			existing.status === "processing" &&
			existing.claimedAt !== undefined &&
			now - existing.claimedAt < LEASE_MS
		) {
			return { proceed: false, inProgress: true };
		}

		await ctx.db.patch(existing._id, {
			status: "processing",
			claimedAt: now,
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
			paymentIntentId: undefined,
			payload: undefined,
		});
		return null;
	},
});

/**
 * Park an event whose payment has not settled yet. `payload` is the resolved
 * mutation input, so the paid cascade can replay it without calling Stripe.
 */
export const markEventUnresolved = internalMutation({
	args: {
		eventDocId: v.id("stripeWebhookEvents"),
		paymentIntentId: v.string(),
		payload: v.any(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.eventDocId, {
			status: "unresolved",
			paymentIntentId: args.paymentIntentId,
			payload: args.payload,
		});
		return null;
	},
});

/**
 * Record failure metadata while preserving the original error path.
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

/**
 * Daily retention sweep. Deletes processed events past the replay window in
 * bounded pages; failed and in-flight rows are kept for debugging. `after`
 * carries the last scanned creation time so retained rows aren't rescanned.
 */
export const cleanupProcessedEvents = internalMutation({
	args: { after: v.optional(v.number()) },
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const cutoff = Date.now() - RETENTION_MS;
		const rows = await ctx.db
			.query("stripeWebhookEvents")
			.withIndex("by_creation_time", (q) =>
				q.gt("_creationTime", args.after ?? 0).lt("_creationTime", cutoff)
			)
			.take(DELETE_BATCH);

		for (const row of rows) {
			if (row.status === "processed") {
				await ctx.db.delete(row._id);
			}
		}

		if (rows.length === DELETE_BATCH) {
			await ctx.scheduler.runAfter(
				0,
				internal.stripeWebhookEvents.cleanupProcessedEvents,
				{ after: rows[rows.length - 1]._creationTime }
			);
		}
		return null;
	},
});
