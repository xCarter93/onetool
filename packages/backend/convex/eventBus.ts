import {
	internalMutation,
	internalQuery,
	MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { systemMutation } from "./lib/factories";
import {
	triggerableObjectTypeValidator,
	type TriggerableObjectType,
} from "./lib/workflowTypes";
import { trackServerEvent, statusChangeEvent, createdEvent } from "./lib/posthog";

/**
 * Emitters accept any MutationCtx; when called from a userMutation the
 * enriched ctx carries the acting user, which is threaded into the event so
 * automations can resolve user.* globals on event-triggered runs.
 */
type EmitterCtx = MutationCtx & { user?: { _id: Id<"users"> } };

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
	// Entity lifecycle events
	ENTITY_RECORD_CREATED: "entity.record_created",
	ENTITY_RECORD_UPDATED: "entity.record_updated",
	// Automation events
	AUTOMATION_TRIGGERED: "automation.triggered",
	AUTOMATION_COMPLETED: "automation.completed",
	AUTOMATION_FAILED: "automation.failed",
} as const;

// Configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds
const BATCH_SIZE = 50; // Events to process per batch
const PER_ORG_BATCH = 10; // Fairness cap: max events one org gets from a batch's round-robin share
const ORG_DISCOVERY_LIMIT = 32; // Max distinct-org index probes per batch
const FIFO_RESERVE = 10; // Batch share always filled globally-oldest-first

/**
 * The entity types that emit domain events. Derived from AutomationObjectType
 * so the two enums can't drift — but fetch-only line items are excluded rather
 * than aliased in: they never emit events (their parent quote/invoice does),
 * and a bare alias would silently make emitStatusChangeEvent(…, "quote_line_item")
 * type-check.
 */
type EntityType = TriggerableObjectType;

/**
 * Publish an event to the event bus
 * This is the main entry point for event producers
 */
export const publishEvent = systemMutation({
	args: {
		eventType: v.string(),
		eventSource: v.string(),
		payload: v.object({
			entityType: triggerableObjectTypeValidator,
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
			orgId: ctx.orgId,
			eventType: args.eventType,
			eventSource: args.eventSource,
			payload: args.payload,
			status: "pending",
			correlationId: args.correlationId,
			causationId: args.causationId,
			createdAt: Date.now(),
			attemptCount: 0,
		});

		// Schedule immediate processing.
		// Skip the scheduler hop under Vitest — see emitStatusChangeEvent.
		if (!process.env.VITEST) {
			await ctx.scheduler.runAfter(0, internal.eventBus.processEvents, {});
		}

		return eventId;
	},
});

/**
 * Helper function to publish status change events from mutations
 * Use this in your entity update mutations
 */
export async function emitStatusChangeEvent(
	ctx: EmitterCtx,
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
			metadata: ctx.user ? { actorUserId: ctx.user._id } : undefined,
		},
		status: "pending",
		correlationId: correlationId || `${entityType}-${entityId}-${Date.now()}`,
		createdAt: Date.now(),
		attemptCount: 0,
	});

	const analyticsEvent = statusChangeEvent(entityType, newStatus);
	if (analyticsEvent) {
		await trackServerEvent(ctx, {
			event: analyticsEvent,
			orgId,
			actorUserId: ctx.user?._id,
			properties: {
				entity_id: entityId,
				entity_type: entityType,
				status: newStatus,
			},
		});
	}

	// Schedule immediate processing.
	// [Plan 14-02 Rule 3] Skip the scheduler hop under Vitest so the
	// processEvents mutation does not fire after the test's parent
	// transaction has ended (it would patch domainEvents and re-schedule
	// itself, surfacing as "Write outside of transaction" unhandled
	// rejections that fail the test process exit even though every
	// assertion passes). Same gating pattern as portal/otp.ts uses for
	// the Resend scheduler hop.
	if (!process.env.VITEST) {
		await ctx.scheduler.runAfter(0, internal.eventBus.processEvents, {});
	}

	return eventId;
}

/**
 * Helper function to publish record-created events from create mutations
 */
export async function emitRecordCreatedEvent(
	ctx: EmitterCtx,
	orgId: Id<"organizations">,
	entityType: EntityType,
	entityId: string,
	source: string,
	correlationId?: string
): Promise<Id<"domainEvents">> {
	const eventId = await ctx.db.insert("domainEvents", {
		orgId,
		eventType: EVENT_TYPES.ENTITY_RECORD_CREATED,
		eventSource: source,
		payload: {
			entityType,
			entityId,
			metadata: ctx.user ? { actorUserId: ctx.user._id } : undefined,
		},
		status: "pending",
		correlationId: correlationId || `${entityType}-${entityId}-${Date.now()}`,
		createdAt: Date.now(),
		attemptCount: 0,
	});

	const analyticsEvent = createdEvent(entityType);
	if (analyticsEvent) {
		await trackServerEvent(ctx, {
			event: analyticsEvent,
			orgId,
			actorUserId: ctx.user?._id,
			properties: { entity_id: entityId, entity_type: entityType },
		});
	}

	// Skip the scheduler hop under Vitest — see emitStatusChangeEvent.
	if (!process.env.VITEST) {
		await ctx.scheduler.runAfter(0, internal.eventBus.processEvents, {});
	}

	return eventId;
}

/**
 * Helper function to publish record-updated events from update mutations
 * changedFields lists the patch keys actually applied.
 */
export async function emitRecordUpdatedEvent(
	ctx: EmitterCtx,
	orgId: Id<"organizations">,
	entityType: EntityType,
	entityId: string,
	changedFields: string[],
	source: string,
	correlationId?: string
): Promise<Id<"domainEvents">> {
	const eventId = await ctx.db.insert("domainEvents", {
		orgId,
		eventType: EVENT_TYPES.ENTITY_RECORD_UPDATED,
		eventSource: source,
		payload: {
			entityType,
			entityId,
			metadata: {
				changedFields,
				...(ctx.user ? { actorUserId: ctx.user._id } : {}),
			},
		},
		status: "pending",
		correlationId: correlationId || `${entityType}-${entityId}-${Date.now()}`,
		createdAt: Date.now(),
		attemptCount: 0,
	});

	// Skip the scheduler hop under Vitest — see emitStatusChangeEvent.
	if (!process.env.VITEST) {
		await ctx.scheduler.runAfter(0, internal.eventBus.processEvents, {});
	}

	return eventId;
}

/**
 * Pick the next batch of pending events with per-org fairness.
 *
 * The old global oldest-first FIFO let one org's bulk import delay every other
 * org's triggers. Instead: skip-scan by_status_org for distinct orgIds that
 * have pending work (every probe lands on an org with a queued event), take
 * up to PER_ORG_BATCH pending events per org (oldest first within the org),
 * then top up the remainder from the global-oldest FIFO — so age-based
 * progress is still guaranteed when pending orgs outnumber the discovery
 * budget.
 */
async function selectFairBatch(
	ctx: MutationCtx
): Promise<Doc<"domainEvents">[]> {
	const selected: Doc<"domainEvents">[] = [];
	const selectedIds = new Set<string>();
	const roundRobinShare = BATCH_SIZE - FIFO_RESERVE;

	let orgCursor: Id<"organizations"> | null = null;
	for (
		let probes = 0;
		probes < ORG_DISCOVERY_LIMIT && selected.length < roundRobinShare;
		probes++
	) {
		const cursor: Id<"organizations"> | null = orgCursor;
		const nextOrgRow: Doc<"domainEvents"> | null =
			cursor === null
				? await ctx.db
						.query("domainEvents")
						.withIndex("by_status_org", (q) => q.eq("status", "pending"))
						.first()
				: await ctx.db
						.query("domainEvents")
						.withIndex("by_status_org", (q) =>
							q.eq("status", "pending").gt("orgId", cursor)
						)
						.first();
		if (!nextOrgRow) break;
		orgCursor = nextOrgRow.orgId;

		const pending = await ctx.db
			.query("domainEvents")
			.withIndex("by_org_status", (q) =>
				q.eq("orgId", nextOrgRow.orgId).eq("status", "pending")
			)
			.take(Math.min(PER_ORG_BATCH, roundRobinShare - selected.length));
		for (const event of pending) {
			selected.push(event);
			selectedIds.add(event._id);
		}
	}

	// Starvation guard / top-up: the globally oldest pending events fill the
	// rest of the batch, deduped against the round-robin picks.
	if (selected.length < BATCH_SIZE) {
		const oldest = await ctx.db
			.query("domainEvents")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.order("asc")
			.take(BATCH_SIZE);
		for (const event of oldest) {
			if (selected.length >= BATCH_SIZE) break;
			if (!selectedIds.has(event._id)) {
				selected.push(event);
			}
		}
	}

	return selected;
}

/**
 * Process pending events from the queue
 * This is the event loop that picks up and dispatches events
 */
export const processEvents = internalMutation({
	args: {},
	handler: async (ctx) => {
		const pendingEvents = await selectFairBatch(ctx);

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
			.withIndex("by_status", (q) => q.eq("status", "pending"))
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
						actorUserId?: string;
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
					actorUserId: metadata?.actorUserId,
				}
			);
			break;
		}

		case EVENT_TYPES.ENTITY_RECORD_CREATED:
		case EVENT_TYPES.ENTITY_RECORD_UPDATED: {
			// Route to the automation executor, mirroring the status_changed
			// dispatch above. Record events carry their own cascade context
			// (executionChain/recursionDepth) in payload.metadata, so only
			// eventId/orgId are needed here.
			await ctx.scheduler.runAfter(
				0,
				internal.automationExecutor.handleRecordEvent,
				{
					eventId: event._id,
					orgId: event.orgId,
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
// Raw internalQuery — no factory variant exists; if exposing user-scoped data, prefer userQuery.
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
				.withIndex("by_status", (q) => q.eq("status", "failed"))
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
			.withIndex("by_status", (q) =>
				q.eq("status", "completed").lt("createdAt", cutoffTime)
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
// Raw internalQuery — no factory variant exists; if exposing user-scoped data, prefer userQuery.
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
