import {
	internalMutation,
	internalQuery,
	MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

/**
 * Event Bus - Event-Driven Architecture for Convex
 *
 * This module implements an event-driven architecture pattern that:
 * 1. Decouples event producers from consumers
 * 2. Enables event sourcing and replayability
 * 3. Provides reliable event processing with retries
 * 4. Supports multiple subscribers per event type
 *
 * Based on: https://stack.convex.dev/event-driven-programming
 */

// Event type constants
export const EVENT_TYPES = {
	// Entity status change events
	ENTITY_STATUS_CHANGED: "entity.status_changed",
	// Automation events
	AUTOMATION_TRIGGERED: "automation.triggered",
	AUTOMATION_COMPLETED: "automation.completed",
	AUTOMATION_FAILED: "automation.failed",
} as const;

// Configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds
const BATCH_SIZE = 50; // Events to process per batch

type EntityType = "client" | "project" | "quote" | "invoice" | "task";

/**
 * Publish an event to the event bus
 * This is the main entry point for event producers
 */
export const publishEvent = internalMutation({
	args: {
		orgId: v.id("organizations"),
		eventType: v.string(),
		eventSource: v.string(),
		payload: v.object({
			entityType: v.union(
				v.literal("client"),
				v.literal("project"),
				v.literal("quote"),
				v.literal("invoice"),
				v.literal("task")
			),
			entityId: v.string(),
			field: v.optional(v.string()),
			oldValue: v.optional(v.any()),
			newValue: v.optional(v.any()),
			metadata: v.optional(v.any()),
		}),
		// Optional correlation/causation for event tracing
		correlationId: v.optional(v.string()),
		causationId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const eventId = await ctx.db.insert("domainEvents", {
			orgId: args.orgId,
			eventType: args.eventType,
			eventSource: args.eventSource,
			payload: args.payload,
			status: "pending",
			correlationId: args.correlationId,
			causationId: args.causationId,
			createdAt: Date.now(),
			attemptCount: 0,
		});

		// Schedule immediate processing
		await ctx.scheduler.runAfter(0, internal.eventBus.processEvents, {});

		return eventId;
	},
});

/**
 * Helper function to publish status change events from mutations
 * Use this in your entity update mutations
 */
export async function emitStatusChangeEvent(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	entityType: EntityType,
	entityId: string,
	oldStatus: string,
	newStatus: string,
	source: string,
	correlationId?: string
): Promise<Id<"domainEvents">> {
	const eventId = await ctx.db.insert("domainEvents", {
		orgId,
		eventType: EVENT_TYPES.ENTITY_STATUS_CHANGED,
		eventSource: source,
		payload: {
			entityType,
			entityId,
			field: "status",
			oldValue: oldStatus,
			newValue: newStatus,
		},
		status: "pending",
		correlationId: correlationId || `${entityType}-${entityId}-${Date.now()}`,
		createdAt: Date.now(),
		attemptCount: 0,
	});

	// Schedule immediate processing
	await ctx.scheduler.runAfter(0, internal.eventBus.processEvents, {});

	return eventId;
}

/**
 * Process pending events from the queue
 * This is the event loop that picks up and dispatches events
 */
export const processEvents = internalMutation({
	args: {},
	handler: async (ctx) => {
		// Get pending events, oldest first
		// Note: Since by_org_status requires orgId, we query all pending events across orgs
		const pendingEvents = await ctx.db
			.query("domainEvents")
			.filter((q) => q.eq(q.field("status"), "pending"))
			.order("asc")
			.take(BATCH_SIZE);

		if (pendingEvents.length === 0) {
			return { processed: 0 };
		}

		let processed = 0;
		let failed = 0;

		for (const event of pendingEvents) {
			// Mark as processing
			await ctx.db.patch(event._id, {
				status: "processing",
				attemptCount: (event.attemptCount || 0) + 1,
			});

			try {
				// Dispatch to appropriate handler based on event type
				await dispatchEvent(ctx, event);

				// Mark as completed
				await ctx.db.patch(event._id, {
					status: "completed",
					processedAt: Date.now(),
				});
				processed++;
			} catch (error) {
				const attemptCount = (event.attemptCount || 0) + 1;
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";

				if (attemptCount >= MAX_RETRY_ATTEMPTS) {
					// Max retries exceeded, mark as failed
					await ctx.db.patch(event._id, {
						status: "failed",
						errorMessage: `Failed after ${attemptCount} attempts: ${errorMessage}`,
						failedAt: Date.now(),
					});
					failed++;
				} else {
					// Schedule retry
					await ctx.db.patch(event._id, {
						status: "pending",
						errorMessage: errorMessage,
					});
					// Schedule retry processing
					await ctx.scheduler.runAfter(
						RETRY_DELAY_MS,
						internal.eventBus.processEvents,
						{}
					);
				}
			}
		}

		// If there are more events, schedule another batch
		const remainingEvents = await ctx.db
			.query("domainEvents")
			.filter((q) => q.eq(q.field("status"), "pending"))
			.first();

		if (remainingEvents) {
			await ctx.scheduler.runAfter(0, internal.eventBus.processEvents, {});
		}

		return { processed, failed };
	},
});

/**
 * Dispatch an event to its registered handlers
 * This is the event router that maps event types to handlers
 */
async function dispatchEvent(
	ctx: MutationCtx,
	event: Doc<"domainEvents">
): Promise<void> {
	switch (event.eventType) {
		case EVENT_TYPES.ENTITY_STATUS_CHANGED: {
			// Extract execution chain context from metadata (for cascading automations)
			const metadata = event.payload.metadata as
				| {
						executionChain?: string[];
						recursionDepth?: number;
						isCascade?: boolean;
				  }
				| undefined;

			// Route to automation executor with chain context
			await ctx.scheduler.runAfter(
				0,
				internal.automationExecutor.handleStatusChangeEvent,
				{
					eventId: event._id,
					orgId: event.orgId,
					entityType: event.payload.entityType,
					entityId: event.payload.entityId,
					fromStatus: event.payload.oldValue as string,
					toStatus: event.payload.newValue as string,
					correlationId: event.correlationId,
					// Pass execution chain for cascading automations
					executionChain: metadata?.executionChain,
					recursionDepth: metadata?.recursionDepth,
				}
			);
			break;
		}

		case EVENT_TYPES.AUTOMATION_TRIGGERED:
		case EVENT_TYPES.AUTOMATION_COMPLETED:
		case EVENT_TYPES.AUTOMATION_FAILED:
			// These are informational events, no handler needed
			// They can be used for monitoring, analytics, webhooks, etc.
			break;

		default:
			console.warn(`No handler registered for event type: ${event.eventType}`);
	}
}

/**
 * Get events by correlation ID for debugging/tracing
 */
export const getEventsByCorrelation = internalQuery({
	args: {
		correlationId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("domainEvents")
			.withIndex("by_correlation", (q) =>
				q.eq("correlationId", args.correlationId)
			)
			.collect();
	},
});

/**
 * Replay failed events (for recovery)
 */
export const replayFailedEvents = internalMutation({
	args: {
		orgId: v.optional(v.id("organizations")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		let failedEvents;

		if (args.orgId) {
			// Use by_org_status index when orgId is provided
			const orgId = args.orgId;
			failedEvents = await ctx.db
				.query("domainEvents")
				.withIndex("by_org_status", (q) =>
					q.eq("orgId", orgId).eq("status", "failed"))
				.take(args.limit || 100);
		} else {
			// Query all failed events without org filter
			failedEvents = await ctx.db
				.query("domainEvents")
				.filter((q) => q.eq(q.field("status"), "failed"))
				.take(args.limit || 100);
		}

		let replayed = 0;
		for (const event of failedEvents) {
			await ctx.db.patch(event._id, {
				status: "pending",
				attemptCount: 0,
				errorMessage: undefined,
				failedAt: undefined,
			});
			replayed++;
		}

		// Trigger processing
		if (replayed > 0) {
			await ctx.scheduler.runAfter(0, internal.eventBus.processEvents, {});
		}

		return { replayed };
	},
});

/**
 * Cleanup old processed events (retention policy)
 */
export const cleanupOldEvents = internalMutation({
	args: {
		olderThanDays: v.optional(v.number()),
		batchSize: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const retentionDays = args.olderThanDays ?? 7; // Default: 7 days for processed events
		const batchSize = args.batchSize ?? 500;

		const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

		// Only delete completed events
		const oldEvents = await ctx.db
			.query("domainEvents")
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "completed"),
					q.lt(q.field("createdAt"), cutoffTime)
				)
			)
			.take(batchSize);

		let deleted = 0;
		for (const event of oldEvents) {
			await ctx.db.delete(event._id);
			deleted++;
		}

		console.log(
			`Cleaned up ${deleted} old domain events (older than ${retentionDays} days)`
		);

		return { deleted };
	},
});

/**
 * Get event processing statistics
 */
export const getEventStats = internalQuery({
	args: {
		orgId: v.optional(v.id("organizations")),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const oneDayAgo = now - 24 * 60 * 60 * 1000;

		// Get all events from last 24 hours
		let recentEvents = await ctx.db
			.query("domainEvents")
			.filter((q) => q.gte(q.field("createdAt"), oneDayAgo))
			.collect();

		if (args.orgId) {
			recentEvents = recentEvents.filter((e) => e.orgId === args.orgId);
		}

		return {
			total: recentEvents.length,
			pending: recentEvents.filter((e) => e.status === "pending").length,
			processing: recentEvents.filter((e) => e.status === "processing").length,
			completed: recentEvents.filter((e) => e.status === "completed").length,
			failed: recentEvents.filter((e) => e.status === "failed").length,
			byType: recentEvents.reduce(
				(acc, e) => {
					acc[e.eventType] = (acc[e.eventType] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			),
		};
	},
});

