import {
	internalMutation,
	internalQuery,
	MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { AggregateHelpers } from "./lib/aggregates";
import { ActivityHelpers } from "./lib/activities";
import { systemMutation } from "./lib/factories";
import { computeNextRunAt } from "./lib/schedule";
import { orgHasPremiumPlan } from "./lib/permissions";
import { getMembership, listMembershipsByOrg } from "./lib/memberships";
import { enqueuePush } from "./push";
import {
	evaluateConditionGroups,
	interpolateTemplate,
	resolveValueRef,
	type VariableScope,
} from "./lib/conditionEval";
import {
	RELATION_FIELD,
	getFieldDefinition,
	getStatusOptions,
	type FieldDefinition,
} from "./lib/fieldRegistry";
import {
	DEFAULT_FETCH_LIMIT,
	DELAY_UNIT_MS,
	MAX_DELAY_MS,
	MAX_FETCH_LIMIT,
	MAX_LOOP_ITERATIONS,
	type ActionTarget,
	type AutomationAction,
	type AutomationObjectType,
	type AutomationTrigger,
	type WorkflowNodeConfig,
} from "./lib/workflowTypes";

/**
 * Automation Execution Engine
 *
 * Handles finding matching automations and executing their workflows asynchronously.
 *
 * Event-Driven Architecture:
 * - Subscribes to "entity.status_changed" / "entity.record_created" /
 *   "entity.record_updated" events from the event bus
 * - Publishes "automation.triggered", "automation.completed", "automation.failed" events
 * - Decoupled from entity mutations for better maintainability
 *
 * See: https://stack.convex.dev/event-driven-programming
 */

// Type definitions
type ObjectType = AutomationObjectType;
type AutomationNode = Doc<"workflowAutomations">["nodes"][number];
type AutomationDoc = Doc<"workflowAutomations">;

/**
 * The definition a run executes: the published snapshot when present,
 * otherwise the working copy (unmigrated legacy rows).
 */
function executableDefinition(automation: AutomationDoc): {
	trigger: AutomationTrigger;
	nodes: AutomationNode[];
} {
	if (automation.publishedSnapshot) {
		return {
			trigger: automation.publishedSnapshot.trigger,
			nodes: automation.publishedSnapshot.nodes,
		};
	}
	return { trigger: automation.trigger, nodes: automation.nodes };
}

/** Lifecycle check tolerating unmigrated rows (status missing). */
function isEffectivelyActive(automation: AutomationDoc): boolean {
	if (automation.status) return automation.status === "active";
	return automation.isActive === true;
}

function isValidStatus(objectType: ObjectType, status: string): boolean {
	const options = getStatusOptions(objectType);
	return options.some((o) => o.value === status);
}

/**
 * Find all active automations that match a trigger event.
 *
 * Matching runs against the published snapshot's trigger when present, so
 * unpublished edits never change what fires in production.
 */
// Raw internalQuery — no factory variant exists; if exposing user-scoped data, prefer userQuery.
export const findMatchingAutomations = internalQuery({
	args: {
		orgId: v.id("organizations"),
		objectType: v.union(
			v.literal("client"),
			v.literal("project"),
			v.literal("quote"),
			v.literal("invoice"),
			v.literal("task")
		),
		triggerType: v.union(
			v.literal("status_changed"),
			v.literal("record_created"),
			v.literal("record_updated")
		),
		fromStatus: v.optional(v.string()),
		toStatus: v.optional(v.string()),
		changedFields: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args): Promise<AutomationDoc[]> => {
		// by_org_active still drives selection until legacy rows are migrated;
		// isActive is kept as a synced mirror of status === "active".
		const automations = await ctx.db
			.query("workflowAutomations")
			.withIndex("by_org_active", (q) =>
				q.eq("orgId", args.orgId).eq("isActive", true)
			)
			.collect();

		return automations.filter((automation) => {
			if (!isEffectivelyActive(automation)) {
				return false;
			}

			const { trigger } = executableDefinition(automation);
			const triggerType =
				"type" in trigger ? trigger.type : "status_changed";

			if (triggerType !== args.triggerType) {
				return false;
			}
			if (
				"objectType" in trigger &&
				trigger.objectType !== args.objectType
			) {
				return false;
			}

			switch (args.triggerType) {
				case "status_changed": {
					if (
						"toStatus" in trigger &&
						trigger.toStatus !== args.toStatus
					) {
						return false;
					}
					if (
						"fromStatus" in trigger &&
						trigger.fromStatus &&
						trigger.fromStatus !== args.fromStatus
					) {
						return false;
					}
					return true;
				}
				case "record_created":
					return true;
				case "record_updated": {
					// Field filter: legacy single `field` or v2 `fields` array;
					// no filter means any field change matches.
					const watched: string[] = [];
					if ("fields" in trigger && trigger.fields) {
						watched.push(...trigger.fields);
					}
					if ("field" in trigger && trigger.field) {
						watched.push(trigger.field);
					}
					if (watched.length === 0) {
						return true;
					}
					const changed = args.changedFields ?? [];
					return watched.some((f) => changed.includes(f));
				}
				default:
					return false;
			}
		});
	},
});

// Configuration constants for safety limits
const MAX_RECURSION_DEPTH = 5; // Max chain of automations triggering each other
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_EXECUTIONS_PER_WINDOW = 100; // Max executions per org per minute

type MatchAndScheduleResult = {
	triggered: number;
	recursionLimited?: boolean;
	rateLimited?: boolean;
};

type MatchAndScheduleParams = {
	eventId: Id<"domainEvents">;
	entityType: ObjectType;
	entityId: string;
	triggerType: "status_changed" | "record_created" | "record_updated";
	fromStatus?: string;
	toStatus?: string;
	changedFields?: string[];
	correlationId?: string;
	executionChain: Id<"workflowAutomations">[];
	recursionDepth: number;
	/** Preserves the original event-source label on the automation.triggered log. */
	eventSource: string;
};

/**
 * Shared core of the event-driven handlers: enforce recursion/rate limits,
 * find automations matching the trigger, then log + schedule execution for
 * each match. Used by both handleStatusChangeEvent and handleRecordEvent —
 * they differ only in how they derive trigger params from their event.
 */
async function matchAndScheduleAutomations(
	ctx: MutationCtx & { orgId: Id<"organizations"> },
	params: MatchAndScheduleParams
): Promise<MatchAndScheduleResult> {
	const orgId = ctx.orgId;

	// Check recursion depth limit
	if (params.recursionDepth >= MAX_RECURSION_DEPTH) {
		console.warn(
			`Automation recursion limit reached (depth: ${params.recursionDepth}) for org ${orgId}. ` +
				`Chain: ${params.executionChain.join(" → ")}`
		);
		return { triggered: 0, recursionLimited: true };
	}

	// Find matching automations
	const automations = await ctx.runQuery(
		internal.automationExecutor.findMatchingAutomations,
		{
			orgId,
			objectType: params.entityType,
			triggerType: params.triggerType,
			fromStatus: params.fromStatus,
			toStatus: params.toStatus,
			changedFields: params.changedFields,
		}
	);

	if (automations.length === 0) {
		return { triggered: 0 };
	}

	// Rate limiting check
	const oneMinuteAgo = Date.now() - RATE_LIMIT_WINDOW_MS;
	const recentExecutions = await ctx.db
		.query("workflowExecutions")
		.withIndex("by_org_triggeredAt", (q) =>
			q.eq("orgId", orgId).gte("triggeredAt", oneMinuteAgo)
		)
		.take(MAX_EXECUTIONS_PER_WINDOW);

	if (recentExecutions.length >= MAX_EXECUTIONS_PER_WINDOW) {
		console.warn(
			`Automation rate limit reached for org ${orgId}. ` +
				`${recentExecutions.length}+ executions in the last minute.`
		);
		return { triggered: 0, rateLimited: true };
	}

	let triggered = 0;

	// Schedule execution for each matching automation
	for (const automation of automations) {
		// Check if this automation is already in the chain (prevent loops)
		if (params.executionChain.includes(automation._id)) {
			console.warn(
				`Automation loop detected: ${automation._id} already in chain. Skipping.`
			);
			// Log as skipped
			await ctx.db.insert("workflowExecutions", {
				orgId,
				automationId: automation._id,
				triggeredBy: params.entityId,
				triggeredAt: Date.now(),
				status: "skipped",
				nodesExecuted: [],
				error: "Skipped: Automation loop detected",
				executionChain: params.executionChain,
				recursionDepth: params.recursionDepth,
			});
			continue;
		}

		// Build new execution chain
		const newChain = [...params.executionChain, automation._id];

		// Create execution log entry with event correlation
		const executionId = await ctx.db.insert("workflowExecutions", {
			orgId,
			automationId: automation._id,
			triggeredBy: params.entityId,
			triggeredAt: Date.now(),
			status: "running",
			nodesExecuted: [],
			executionChain: newChain,
			recursionDepth: params.recursionDepth,
		});

		// Publish automation.triggered event for monitoring
		await ctx.db.insert("domainEvents", {
			orgId,
			eventType: "automation.triggered",
			eventSource: params.eventSource,
			payload: {
				entityType: params.entityType,
				entityId: params.entityId,
				metadata: {
					automationId: automation._id,
					automationName: automation.name,
					executionId,
					isCascade: params.recursionDepth > 0,
				},
			},
			status: "completed", // Informational event, already processed
			processedAt: Date.now(),
			attemptCount: 0,
			correlationId: params.correlationId,
			causationId: params.eventId,
			createdAt: Date.now(),
		});

		// Schedule async execution with chain context
		await ctx.scheduler.runAfter(
			0,
			internal.automationExecutor.executeAutomation,
			{
				orgId,
				executionId,
				automationId: automation._id,
				objectType: params.entityType,
				objectId: params.entityId,
				// trigger.event.oldValue/newValue variable paths (status_changed).
				eventOldValue: params.fromStatus,
				eventNewValue: params.toStatus,
				executionChain: newChain,
				recursionDepth: params.recursionDepth + 1,
			}
		);

		triggered++;
	}

	return { triggered };
}

/**
 * EVENT-DRIVEN HANDLER
 *
 * This handler subscribes to "entity.status_changed" events from the event bus.
 * It's the primary way to trigger automations as it provides:
 * - Loose coupling from entity mutations
 * - Event tracing via correlationId
 * - Automatic retry handling
 * - Event sourcing support
 * - Recursion prevention for cascading automations
 */
export const handleStatusChangeEvent = systemMutation({
	args: {
		eventId: v.id("domainEvents"),
		entityType: v.union(
			v.literal("client"),
			v.literal("project"),
			v.literal("quote"),
			v.literal("invoice"),
			v.literal("task")
		),
		entityId: v.string(),
		fromStatus: v.string(),
		toStatus: v.string(),
		correlationId: v.optional(v.string()),
		// Execution chain context for cascading automations
		executionChain: v.optional(v.array(v.string())),
		recursionDepth: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<MatchAndScheduleResult> => {
		return matchAndScheduleAutomations(ctx, {
			eventId: args.eventId,
			entityType: args.entityType,
			entityId: args.entityId,
			triggerType: "status_changed",
			fromStatus: args.fromStatus,
			toStatus: args.toStatus,
			correlationId: args.correlationId,
			executionChain: (args.executionChain ??
				[]) as Id<"workflowAutomations">[],
			recursionDepth: args.recursionDepth ?? 0,
			eventSource: "automationExecutor.handleStatusChangeEvent",
		});
	},
});

/**
 * EVENT-DRIVEN HANDLER
 *
 * Subscribes to "entity.record_created" / "entity.record_updated" events.
 * Mirrors handleStatusChangeEvent but derives its trigger params from the
 * stored domain event (entityType/entityId/changedFields, plus any
 * cascade executionChain/recursionDepth in payload.metadata) instead of
 * from args, since record events don't carry a from/to status.
 */
export const handleRecordEvent = systemMutation({
	args: {
		eventId: v.id("domainEvents"),
	},
	handler: async (ctx, args): Promise<MatchAndScheduleResult> => {
		const event = await ctx.db.get(args.eventId);
		if (!event) {
			console.warn(
				`[AutomationExecutor] handleRecordEvent: event ${args.eventId} not found`
			);
			return { triggered: 0 };
		}
		if (event.orgId !== ctx.orgId) {
			console.warn(
				`[AutomationExecutor] Cross-org event access blocked: event ${args.eventId} does not belong to org ${ctx.orgId}`
			);
			return { triggered: 0 };
		}

		const triggerType =
			event.eventType === "entity.record_created"
				? ("record_created" as const)
				: event.eventType === "entity.record_updated"
					? ("record_updated" as const)
					: null;
		if (!triggerType) {
			console.warn(
				`[AutomationExecutor] handleRecordEvent: unexpected event type ${event.eventType}`
			);
			return { triggered: 0 };
		}

		const metadata = event.payload.metadata as
			| {
					changedFields?: string[];
					executionChain?: string[];
					recursionDepth?: number;
			  }
			| undefined;

		return matchAndScheduleAutomations(ctx, {
			eventId: args.eventId,
			entityType: event.payload.entityType,
			entityId: event.payload.entityId,
			triggerType,
			changedFields: metadata?.changedFields,
			correlationId: event.correlationId,
			executionChain: (metadata?.executionChain ??
				[]) as Id<"workflowAutomations">[],
			recursionDepth: metadata?.recursionDepth ?? 0,
			eventSource: "automationExecutor.handleRecordEvent",
		});
	},
});

/** Max scheduled automations dispatched per cron tick. */
const SCHEDULED_DISPATCH_BATCH = 50;

/**
 * SCHEDULED DISPATCHER (cron, every 15 minutes)
 *
 * Finds active automations whose nextRunAt is due and starts a production run
 * for each. Claim-first: nextRunAt is advanced before the run is scheduled so
 * a failure below can never cause a tight redispatch loop.
 *
 * Until fetch_records lands (Slice 3), scheduled runs execute once with no
 * trigger record; record-scoped per-item runs come with fetch/loop.
 */
// Raw internalMutation — spans orgs, so the org-scoped systemMutation factory doesn't apply.
export const dispatchScheduledAutomations = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ due: number; dispatched: number }> => {
		const now = Date.now();
		const due = await ctx.db
			.query("workflowAutomations")
			.withIndex("by_status_nextRunAt", (q) =>
				// gt(0) keeps rows with no nextRunAt (sorted first) out of the range.
				q.eq("status", "active").gt("nextRunAt", 0).lte("nextRunAt", now)
			)
			.take(SCHEDULED_DISPATCH_BATCH);

		let dispatched = 0;
		for (const automation of due) {
			// Per-automation isolation: one bad row must not block the batch.
			try {
				const { trigger } = executableDefinition(automation);
				if (!("type" in trigger) || trigger.type !== "scheduled") {
					// Stale pointer: the trigger changed without a lifecycle recompute.
					await ctx.db.patch(automation._id, { nextRunAt: undefined });
					continue;
				}

				await ctx.db.patch(automation._id, {
					nextRunAt: computeNextRunAt(trigger.schedule, now),
				});

				// Plan gate: the automations UI is premium-gated, but a downgraded
				// org's schedules keep coming due — skip visibly instead of running.
				const org = await ctx.db.get(automation.orgId);
				if (!orgHasPremiumPlan(org)) {
					await ctx.db.insert("workflowExecutions", {
						orgId: automation.orgId,
						automationId: automation._id,
						triggeredBy: "schedule",
						triggeredAt: now,
						status: "skipped",
						mode: "production",
						nodesExecuted: [],
						error: "Skipped: scheduled automations require a premium plan",
					});
					continue;
				}

				const oneMinuteAgo = now - RATE_LIMIT_WINDOW_MS;
				const recentExecutions = await ctx.db
					.query("workflowExecutions")
					.withIndex("by_org_triggeredAt", (q) =>
						q.eq("orgId", automation.orgId).gte("triggeredAt", oneMinuteAgo)
					)
					.take(MAX_EXECUTIONS_PER_WINDOW);
				if (recentExecutions.length >= MAX_EXECUTIONS_PER_WINDOW) {
					await ctx.db.insert("workflowExecutions", {
						orgId: automation.orgId,
						automationId: automation._id,
						triggeredBy: "schedule",
						triggeredAt: now,
						status: "skipped",
						mode: "production",
						nodesExecuted: [],
						error: "Skipped: automation rate limit reached",
					});
					continue;
				}

				const executionId = await ctx.db.insert("workflowExecutions", {
					orgId: automation.orgId,
					automationId: automation._id,
					triggeredBy: "schedule",
					triggeredAt: now,
					status: "running",
					mode: "production",
					snapshotVersion: automation.publishedSnapshot?.version,
					nodesExecuted: [],
					executionChain: [automation._id],
					recursionDepth: 0,
				});

				await ctx.scheduler.runAfter(
					0,
					internal.automationExecutor.executeAutomation,
					{
						orgId: automation.orgId,
						executionId,
						automationId: automation._id,
						executionChain: [automation._id],
						recursionDepth: 1,
					}
				);
				dispatched++;
			} catch (error) {
				console.error(
					`[AutomationExecutor] Scheduled dispatch failed for automation ${automation._id}`,
					error
				);
			}
		}

		return { due: due.length, dispatched };
	},
});

// ---------------------------------------------------------------------------
// Walk engine — shared by the initial run and delay resumes. A "walk" follows
// nextNodeId/elseNodeId links; loop bodies run as nested walks per item via
// bodyStartNodeId; delay nodes checkpoint the walk into resumeState and
// schedule resumeExecution.
// ---------------------------------------------------------------------------

/** The record a node operates on: the trigger record, or a loop item. */
type ScopeRecord = {
	type: ObjectType;
	id: string;
	record: Record<string, unknown>;
};

type FetchOutput = {
	objectType: ObjectType;
	records: Record<string, unknown>[];
	count: number;
};

type ExecEntry = Doc<"workflowExecutions">["nodesExecuted"][number];

type WalkEnv = {
	executionId: Id<"workflowExecutions">;
	automation: AutomationDoc;
	nodesById: Map<string, AutomationNode>;
	orgId: Id<"organizations">;
	executionChain: Id<"workflowAutomations">[];
	recursionDepth: number;
	scope: VariableScope;
	fetchOutputs: Record<string, FetchOutput>;
	nodesExecuted: ExecEntry[];
	logTruncated: boolean;
	/** Original trigger reference, persisted into resumeState for delays. */
	trigger: { objectType?: ObjectType; objectId?: string };
};

type WalkOutcome =
	| { kind: "chain_done" } // ran off the end of a chain
	| { kind: "ended" } // end node — terminate the whole run successfully
	| { kind: "waiting" } // delay checkpointed the run and scheduled a resume
	| { kind: "failed"; error: string };

/** Cap on stored per-node log entries (loops multiply them). */
const MAX_EXECUTED_ENTRIES = 400;

function pushEntry(env: WalkEnv, entry: ExecEntry): void {
	if (env.nodesExecuted.length >= MAX_EXECUTED_ENTRIES) {
		if (!env.logTruncated) {
			env.logTruncated = true;
			env.nodesExecuted.push({
				nodeId: entry.nodeId,
				result: "skipped",
				error: `Execution log truncated after ${MAX_EXECUTED_ENTRIES} entries`,
			});
		}
		return;
	}
	env.nodesExecuted.push(entry);
}

/**
 * Execute a single automation workflow
 */
export const executeAutomation = systemMutation({
	args: {
		executionId: v.id("workflowExecutions"),
		automationId: v.id("workflowAutomations"),
		// Omitted for scheduled runs, which have no trigger record; record
		// scope comes from fetch_records + loop steps instead.
		objectType: v.optional(
			v.union(
				v.literal("client"),
				v.literal("project"),
				v.literal("quote"),
				v.literal("invoice"),
				v.literal("task")
			)
		),
		objectId: v.optional(v.string()),
		// trigger.event.oldValue/newValue for variable resolution
		// (status_changed triggers).
		eventOldValue: v.optional(v.string()),
		eventNewValue: v.optional(v.string()),
		// Execution context for recursion tracking (passed to child automations)
		executionChain: v.optional(v.array(v.id("workflowAutomations"))),
		recursionDepth: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const automation = await ctx.db.get(args.automationId);
		if (!automation) {
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				error: "Automation not found",
			});
			return;
		}

		console.log(
			`[AutomationExecutor] Starting automation execution: ${automation.name}`,
			{
				automationId: args.automationId,
				executionId: args.executionId,
				totalNodes: automation.nodes.length,
				recursionDepth: args.recursionDepth,
			}
		);

		// Get the triggering object. Scheduled runs have none: conditions
		// evaluate against an empty record until a fetch/loop provides scope.
		let triggerObject: Record<string, unknown> = {};
		let scopeRecord: ScopeRecord | undefined;
		if (args.objectType && args.objectId) {
			const object = await getObject(
				ctx,
				args.objectType,
				args.objectId,
				automation.orgId
			);
			if (!object) {
				await ctx.db.patch(args.executionId, {
					status: "failed",
					completedAt: Date.now(),
					error: "Triggering object not found",
				});
				return;
			}
			triggerObject = object;
			scopeRecord = {
				type: args.objectType,
				id: args.objectId,
				record: object,
			};
		}

		const env: WalkEnv = {
			executionId: args.executionId,
			automation,
			nodesById: new Map(automation.nodes.map((n) => [n.id, n])),
			orgId: automation.orgId,
			executionChain: args.executionChain ?? [],
			recursionDepth: args.recursionDepth ?? 0,
			scope: {
				trigger: {
					record: triggerObject,
					event:
						args.eventOldValue !== undefined ||
						args.eventNewValue !== undefined
							? {
									oldValue: args.eventOldValue,
									newValue: args.eventNewValue,
								}
							: undefined,
				},
			},
			fetchOutputs: {},
			nodesExecuted: [],
			logTruncated: false,
			trigger: { objectType: args.objectType, objectId: args.objectId },
		};

		try {
			if (automation.nodes.length === 0) {
				await ctx.db.patch(args.executionId, {
					status: "completed",
					completedAt: Date.now(),
					nodesExecuted: [],
				});
				return;
			}

			const outcome = await runWalk(
				ctx,
				env,
				automation.nodes[0].id,
				scopeRecord
			);
			await finishWalk(ctx, env, outcome);
		} catch (error) {
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				nodesExecuted: env.nodesExecuted,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	},
});

/**
 * Resume a run parked by a delay/delay_until node. Scheduled by the walk
 * engine at checkpoint time; rebuilds scope from resumeState (fetch outputs
 * re-resolved by id, deleted records skipped) and continues the walk.
 */
export const resumeExecution = systemMutation({
	args: {
		executionId: v.id("workflowExecutions"),
		automationId: v.id("workflowAutomations"),
	},
	handler: async (ctx, args) => {
		const execution = await ctx.db.get(args.executionId);
		if (!execution || execution.orgId !== ctx.orgId) return;
		// Cancelled/completed while waiting, or already resumed.
		if (execution.status !== "running" || !execution.resumeState) return;

		const automation = await ctx.db.get(args.automationId);
		if (!automation || automation.orgId !== ctx.orgId) {
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				error: "Automation was deleted while the run was waiting",
				resumeState: undefined,
				currentNodeId: undefined,
			});
			return;
		}

		const resume = execution.resumeState;

		let triggerObject: Record<string, unknown> = {};
		let scopeRecord: ScopeRecord | undefined;
		if (resume.objectType && resume.objectId) {
			const object = await getObject(
				ctx,
				resume.objectType,
				resume.objectId,
				automation.orgId
			);
			if (!object) {
				await ctx.db.patch(args.executionId, {
					status: "failed",
					completedAt: Date.now(),
					error: "Trigger record was deleted while the run was waiting",
					resumeState: undefined,
					currentNodeId: undefined,
				});
				return;
			}
			triggerObject = object;
			scopeRecord = {
				type: resume.objectType,
				id: resume.objectId,
				record: object,
			};
		}

		const env: WalkEnv = {
			executionId: args.executionId,
			automation,
			nodesById: new Map(automation.nodes.map((n) => [n.id, n])),
			orgId: automation.orgId,
			executionChain: execution.executionChain ?? [],
			recursionDepth: execution.recursionDepth ?? 0,
			scope: {
				trigger: {
					record: triggerObject,
					event:
						resume.eventOldValue !== undefined ||
						resume.eventNewValue !== undefined
							? {
									oldValue: resume.eventOldValue,
									newValue: resume.eventNewValue,
								}
							: undefined,
				},
				nodes: {},
			},
			fetchOutputs: {},
			nodesExecuted: [...execution.nodesExecuted],
			logTruncated: false,
			trigger: { objectType: resume.objectType, objectId: resume.objectId },
		};

		for (const output of resume.fetchOutputs) {
			const records: Record<string, unknown>[] = [];
			for (const recordId of output.recordIds) {
				const doc = await getObject(
					ctx,
					output.objectType,
					recordId,
					automation.orgId
				);
				if (doc) records.push(doc);
			}
			env.fetchOutputs[output.nodeId] = {
				objectType: output.objectType,
				records,
				// Preserve the count observed at fetch time — it's what
				// node.<id>.count variables already resolved against.
				count: output.count,
			};
			env.scope.nodes![output.nodeId] = { count: output.count };
		}

		if (!env.nodesById.has(resume.resumeNodeId)) {
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				nodesExecuted: env.nodesExecuted,
				error: "Automation was edited while the run was waiting; the next step no longer exists",
				resumeState: undefined,
				currentNodeId: undefined,
			});
			return;
		}

		try {
			const outcome = await runWalk(ctx, env, resume.resumeNodeId, scopeRecord);
			await finishWalk(ctx, env, outcome);
		} catch (error) {
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				nodesExecuted: env.nodesExecuted,
				error: error instanceof Error ? error.message : "Unknown error",
				resumeState: undefined,
				currentNodeId: undefined,
			});
		}
	},
});

/** Apply a finished walk's outcome to the execution row. */
async function finishWalk(
	ctx: MutationCtx,
	env: WalkEnv,
	outcome: WalkOutcome
): Promise<void> {
	if (outcome.kind === "waiting") {
		// The delay handler already checkpointed the row.
		return;
	}
	if (outcome.kind === "failed") {
		await ctx.db.patch(env.executionId, {
			status: "failed",
			completedAt: Date.now(),
			nodesExecuted: env.nodesExecuted,
			error: outcome.error,
			resumeState: undefined,
			currentNodeId: undefined,
		});
		return;
	}

	await ctx.db.patch(env.automation._id, {
		lastTriggeredAt: Date.now(),
		triggerCount: (env.automation.triggerCount || 0) + 1,
	});
	await ctx.db.patch(env.executionId, {
		status: "completed",
		completedAt: Date.now(),
		nodesExecuted: env.nodesExecuted,
		resumeState: undefined,
		currentNodeId: undefined,
	});
}

/**
 * Walk a node chain from startNodeId. Loop bodies recurse with the loop item
 * as the scope record; delays checkpoint and return "waiting".
 */
async function runWalk(
	ctx: MutationCtx,
	env: WalkEnv,
	startNodeId: string | undefined,
	scopeRecord: ScopeRecord | undefined,
	inLoopNodeId?: string
): Promise<WalkOutcome> {
	let currentNodeId = startNodeId;
	// Guard against cyclic node graphs (writes reject them, but stored rows
	// may predate that validation) — the walk must terminate.
	const visitedNodeIds = new Set<string>();

	while (currentNodeId) {
		if (visitedNodeIds.has(currentNodeId)) {
			return {
				kind: "failed",
				error: `Workflow contains a cycle through node "${currentNodeId}"`,
			};
		}
		visitedNodeIds.add(currentNodeId);

		const node = env.nodesById.get(currentNodeId);
		if (!node) {
			console.warn(
				`[AutomationExecutor] Node ${currentNodeId} not found in automation ${env.automation._id}`
			);
			return { kind: "chain_done" };
		}

		const config = node.config;

		if (config?.kind === "fetch_records") {
			const fetched = await runFetchNode(ctx, env, node.id, config);
			if (!fetched.ok) {
				pushEntry(env, {
					nodeId: node.id,
					result: "failed",
					error: fetched.error,
				});
				return { kind: "failed", error: fetched.error };
			}
			pushEntry(env, {
				nodeId: node.id,
				result: "success",
				recordsProcessed: fetched.output.count,
			});
			currentNodeId = node.nextNodeId;
			continue;
		}

		if (config?.kind === "loop") {
			if (inLoopNodeId) {
				const error = "Nested loops are not supported";
				pushEntry(env, { nodeId: node.id, result: "failed", error });
				return { kind: "failed", error };
			}
			const outcome = await runLoopNode(ctx, env, node, config);
			if (outcome.kind !== "chain_done") return outcome;
			currentNodeId = node.nextNodeId;
			continue;
		}

		if (config?.kind === "delay" || config?.kind === "delay_until") {
			if (inLoopNodeId) {
				const error = "Delay steps are not supported inside loops";
				pushEntry(env, { nodeId: node.id, result: "failed", error });
				return { kind: "failed", error };
			}
			const resume = computeDelayResume(config, env.scope);
			if (!resume.ok) {
				pushEntry(env, {
					nodeId: node.id,
					result: "failed",
					error: resume.error,
				});
				return { kind: "failed", error: resume.error };
			}
			pushEntry(env, {
				nodeId: node.id,
				result: "success",
				output: { resumeAt: resume.resumeAt },
			});
			// Nothing to wait for: already due, or no downstream steps.
			if (resume.resumeAt <= Date.now() || !node.nextNodeId) {
				currentNodeId = node.nextNodeId;
				continue;
			}
			await ctx.db.patch(env.executionId, {
				nodesExecuted: env.nodesExecuted,
				currentNodeId: node.nextNodeId,
				resumeState: {
					resumeNodeId: node.nextNodeId,
					resumeAt: resume.resumeAt,
					eventOldValue: env.scope.trigger?.event?.oldValue as
						| string
						| undefined,
					eventNewValue: env.scope.trigger?.event?.newValue as
						| string
						| undefined,
					objectType: env.trigger.objectType,
					objectId: env.trigger.objectId,
					fetchOutputs: Object.entries(env.fetchOutputs).map(
						([nodeId, output]) => ({
							nodeId,
							objectType: output.objectType,
							recordIds: output.records.map((r) => String(r._id)),
							count: output.count,
						})
					),
				},
			});
			await ctx.scheduler.runAt(
				resume.resumeAt,
				internal.automationExecutor.resumeExecution,
				{
					orgId: env.orgId,
					executionId: env.executionId,
					automationId: env.automation._id,
				}
			);
			return { kind: "waiting" };
		}

		if (config?.kind === "end") {
			pushEntry(env, { nodeId: node.id, result: "success" });
			return { kind: "ended" };
		}

		// Per-record kinds: condition/action (v2 + legacy).
		const result = await executeNode(ctx, node, scopeRecord, env);

		pushEntry(env, {
			nodeId: node.id,
			result: result.success
				? "success"
				: result.skipped
					? "skipped"
					: "failed",
			error: result.error,
		});

		if (!result.success && !result.skipped) {
			return { kind: "failed", error: result.error ?? "Step failed" };
		}

		currentNodeId =
			node.type === "condition"
				? result.conditionMet
					? node.nextNodeId
					: node.elseNodeId
				: node.nextNodeId;
	}

	return { kind: "chain_done" };
}

/**
 * Run a loop node: iterate the source fetch output, walking the body chain
 * once per item with that item as the scope record and loop.<id>.item/.index
 * variables in scope.
 */
async function runLoopNode(
	ctx: MutationCtx,
	env: WalkEnv,
	node: AutomationNode,
	config: Extract<WorkflowNodeConfig, { kind: "loop" }>
): Promise<WalkOutcome> {
	const source = env.fetchOutputs[config.sourceNodeId];
	if (!source) {
		const error =
			'Loops need a "Find records" step to run earlier in the workflow';
		pushEntry(env, { nodeId: node.id, result: "failed", error });
		return { kind: "failed", error };
	}

	const cap = Math.min(
		config.maxIterations ?? MAX_LOOP_ITERATIONS,
		MAX_LOOP_ITERATIONS
	);
	const items = source.records.slice(0, Math.max(cap, 0));
	pushEntry(env, {
		nodeId: node.id,
		result: "success",
		recordsProcessed: items.length,
	});

	if (!node.bodyStartNodeId || items.length === 0) {
		return { kind: "chain_done" };
	}

	env.scope.loops ??= {};
	try {
		for (let index = 0; index < items.length; index++) {
			const item = items[index];
			env.scope.loops[node.id] = { item, index };
			const itemScope: ScopeRecord = {
				type: source.objectType,
				id: String(item._id),
				record: item,
			};
			const outcome = await runWalk(
				ctx,
				env,
				node.bodyStartNodeId,
				itemScope,
				node.id
			);
			if (outcome.kind === "failed" || outcome.kind === "ended") {
				return outcome;
			}
			if (outcome.kind === "waiting") {
				// Unreachable: delays are rejected inside loop bodies.
				return {
					kind: "failed",
					error: "Delay steps are not supported inside loops",
				};
			}
		}
	} finally {
		// Loop variables are only valid inside the body.
		delete env.scope.loops[node.id];
	}

	return { kind: "chain_done" };
}

/** Bounded scan applied before in-memory filtering in fetch_records. */
const FETCH_SCAN_CAP = 1000;

async function fetchOrgRows(
	ctx: MutationCtx,
	objectType: ObjectType,
	orgId: Id<"organizations">
): Promise<Record<string, unknown>[]> {
	switch (objectType) {
		case "client":
			return await ctx.db
				.query("clients")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.order("desc")
				.take(FETCH_SCAN_CAP);
		case "project":
			return await ctx.db
				.query("projects")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.order("desc")
				.take(FETCH_SCAN_CAP);
		case "quote":
			return await ctx.db
				.query("quotes")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.order("desc")
				.take(FETCH_SCAN_CAP);
		case "invoice":
			return await ctx.db
				.query("invoices")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.order("desc")
				.take(FETCH_SCAN_CAP);
		case "task":
			return await ctx.db
				.query("tasks")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.order("desc")
				.take(FETCH_SCAN_CAP);
		default: {
			const _exhaustive: never = objectType;
			return _exhaustive;
		}
	}
}

/**
 * Run a fetch_records node: org-scoped index scan (newest first, bounded),
 * filter groups combined with AND, optional sort, then limit. Output is
 * stored for downstream loops and exposed as node.<id>.count.
 */
async function runFetchNode(
	ctx: MutationCtx,
	env: WalkEnv,
	nodeId: string,
	config: Extract<WorkflowNodeConfig, { kind: "fetch_records" }>
): Promise<{ ok: true; output: FetchOutput } | { ok: false; error: string }> {
	try {
		const rows = await fetchOrgRows(ctx, config.objectType, env.orgId);
		let records = rows.filter((row) =>
			evaluateConditionGroups("and", config.filters, row, env.scope)
		);

		if (config.sortBy) {
			const { field, direction } = config.sortBy;
			const dir = direction === "asc" ? 1 : -1;
			records = [...records].sort((a, b) => {
				const av = a[field];
				const bv = b[field];
				if (av == null && bv == null) return 0;
				if (av == null) return 1; // nulls last regardless of direction
				if (bv == null) return -1;
				if (typeof av === "number" && typeof bv === "number") {
					return (av - bv) * dir;
				}
				return String(av).localeCompare(String(bv)) * dir;
			});
		}

		const limit = Math.min(
			Math.max(config.limit ?? DEFAULT_FETCH_LIMIT, 1),
			MAX_FETCH_LIMIT
		);
		records = records.slice(0, limit);

		const output: FetchOutput = {
			objectType: config.objectType,
			records,
			count: records.length,
		};
		env.fetchOutputs[nodeId] = output;
		env.scope.nodes ??= {};
		env.scope.nodes[nodeId] = { count: output.count };
		return { ok: true, output };
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error ? error.message : "Failed to fetch records",
		};
	}
}

function computeDelayResume(
	config: Extract<WorkflowNodeConfig, { kind: "delay" | "delay_until" }>,
	scope: VariableScope
): { ok: true; resumeAt: number } | { ok: false; error: string } {
	if (config.kind === "delay") {
		const ms = config.amount * DELAY_UNIT_MS[config.unit];
		if (!Number.isFinite(ms) || ms < 0) {
			return { ok: false, error: "Delay amount is invalid" };
		}
		if (ms > MAX_DELAY_MS) {
			return { ok: false, error: "Delays are capped at 90 days" };
		}
		return { ok: true, resumeAt: Date.now() + ms };
	}

	const raw = resolveValueRef(config.until, scope);
	const resumeAt =
		typeof raw === "number"
			? raw
			: typeof raw === "string"
				? Date.parse(raw)
				: NaN;
	if (Number.isNaN(resumeAt)) {
		return {
			ok: false,
			error: '"Delay until" did not resolve to a valid date',
		};
	}
	if (resumeAt - Date.now() > MAX_DELAY_MS) {
		return { ok: false, error: "Delays are capped at 90 days" };
	}
	return { ok: true, resumeAt };
}

/**
 * Get an object by type and ID, asserting it belongs to the given org.
 */
async function getObject(
	ctx: MutationCtx,
	objectType: ObjectType,
	objectId: string,
	orgId: Id<"organizations">
): Promise<
	| Doc<"clients">
	| Doc<"projects">
	| Doc<"quotes">
	| Doc<"invoices">
	| Doc<"tasks">
	| null
> {
	let doc:
		| Doc<"clients">
		| Doc<"projects">
		| Doc<"quotes">
		| Doc<"invoices">
		| Doc<"tasks">
		| null;
	switch (objectType) {
		case "client":
			doc = await ctx.db.get(objectId as Id<"clients">);
			break;
		case "project":
			doc = await ctx.db.get(objectId as Id<"projects">);
			break;
		case "quote":
			doc = await ctx.db.get(objectId as Id<"quotes">);
			break;
		case "invoice":
			doc = await ctx.db.get(objectId as Id<"invoices">);
			break;
		case "task":
			doc = await ctx.db.get(objectId as Id<"tasks">);
			break;
		default:
			return null;
	}
	if (doc && doc.orgId !== orgId) {
		console.warn(
			`[AutomationExecutor] Cross-org object access blocked: ${objectType} ${objectId} does not belong to org ${orgId}`
		);
		return null;
	}
	return doc;
}

/**
 * Execute a per-record node (condition/action, v2 + legacy). Structural
 * kinds (fetch/loop/delay/end) are handled by the walk engine before this
 * is reached.
 */
async function executeNode(
	ctx: MutationCtx,
	node: AutomationNode,
	scopeRecord: ScopeRecord | undefined,
	env: WalkEnv
): Promise<{
	success: boolean;
	skipped?: boolean;
	conditionMet?: boolean;
	error?: string;
}> {
	// v2 nodes carry a discriminated `config`; legacy rows (pre-migration)
	// only have `condition`/`action` and fall through below.
	if (node.config) {
		return executeNodeV2(ctx, node.config, scopeRecord, env);
	}

	if (node.type === "condition") {
		return executeConditionNode(node, scopeRecord?.record ?? {});
	} else if (node.type === "action") {
		if (!scopeRecord) {
			return { success: false, error: NO_SCOPE_RECORD_ERROR };
		}
		return executeActionNode(
			ctx,
			node,
			scopeRecord.type,
			scopeRecord.id,
			scopeRecord.record,
			env.orgId,
			env.executionChain,
			env.recursionDepth
		);
	}

	return { success: false, error: "Unknown node type" };
}

const NO_SCOPE_RECORD_ERROR =
	"This step needs a record to act on. Use a record trigger, or add " +
	'"Find records" and "Loop" steps before it.';

/** Execute a v2 node from its discriminated `config`. */
async function executeNodeV2(
	ctx: MutationCtx,
	config: WorkflowNodeConfig,
	scopeRecord: ScopeRecord | undefined,
	env: WalkEnv
): Promise<{
	success: boolean;
	skipped?: boolean;
	conditionMet?: boolean;
	error?: string;
}> {
	switch (config.kind) {
		case "condition": {
			let record: Record<string, unknown>;
			if (config.source && typeof config.source === "object") {
				const loopScope = env.scope.loops?.[config.source.loopNodeId];
				if (!loopScope) {
					return {
						success: false,
						error: "This condition reads a loop item but no loop is running",
					};
				}
				record = loopScope.item;
			} else {
				record = scopeRecord?.record ?? {};
			}
			const conditionMet = evaluateConditionGroups(
				config.logic,
				config.groups,
				record,
				env.scope
			);
			return { success: true, conditionMet };
		}
		case "action":
			return executeActionNodeV2(ctx, config.action, scopeRecord, env);
		case "fetch_records":
		case "loop":
		case "delay":
		case "delay_until":
		case "end":
			// Structural kinds are consumed by runWalk before executeNode.
			return {
				success: false,
				error: `Internal error: "${config.kind}" node reached the per-record executor`,
			};
		default: {
			const _exhaustive: never = config;
			return _exhaustive;
		}
	}
}

/**
 * Evaluate a condition node
 */
function executeConditionNode(
	node: AutomationNode,
	triggerObject: Record<string, unknown>
): { success: boolean; conditionMet: boolean } {
	if (!node.condition) {
		return { success: true, conditionMet: true };
	}

	const { field, operator, value } = node.condition;
	const fieldValue = triggerObject[field];

	let conditionMet = false;

	switch (operator) {
		case "equals":
			conditionMet = fieldValue === value;
			break;
		case "not_equals":
			conditionMet = fieldValue !== value;
			break;
		case "contains":
			if (typeof fieldValue === "string" && typeof value === "string") {
				conditionMet = fieldValue.includes(value);
			} else if (Array.isArray(fieldValue)) {
				conditionMet = fieldValue.includes(value);
			}
			break;
		case "exists":
			conditionMet = fieldValue !== undefined && fieldValue !== null;
			break;
		default:
			conditionMet = false;
	}

	return { success: true, conditionMet };
}

/**
 * Execute an action node
 */
async function executeActionNode(
	ctx: MutationCtx,
	node: AutomationNode,
	objectType: ObjectType,
	objectId: string,
	triggerObject: Record<string, unknown>,
	orgId: Id<"organizations">,
	executionChain: Id<"workflowAutomations">[],
	recursionDepth: number
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
	if (!node.action) {
		return { success: false, error: "Action node has no action defined" };
	}

	const { targetType, actionType, newStatus } = node.action;

	if (actionType !== "update_status") {
		return { success: false, error: `Unknown action type: ${actionType}` };
	}

	// Resolve the target object
	const targetInfo = await resolveTarget(
		ctx,
		targetType,
		objectType,
		objectId,
		triggerObject,
		orgId
	);

	if (!targetInfo) {
		// Target not found - skip this action (e.g., quote has no project)
		console.warn(
			`[AutomationExecutor] Target not found: targetType=${targetType}, objectType=${objectType}, objectId=${objectId}`,
			{ triggerObject: JSON.stringify(triggerObject) }
		);
		return { success: true, skipped: true };
	}

	// Validate that target type matches expected type
	if (targetInfo.type !== targetType) {
		return {
			success: false,
			error: `Target resolution returned ${targetInfo.type} but expected ${targetType}`,
		};
	}

	return applyStatusUpdate(
		ctx,
		targetInfo,
		newStatus,
		orgId,
		executionChain,
		recursionDepth
	);
}

/**
 * Apply a status update to a resolved target: validate the status, patch the
 * record (with completion/approval/paid timestamps), maintain aggregates in
 * the same transaction, and emit a cascading status_changed event carrying
 * the execution chain for recursion protection.
 *
 * Shared by the legacy update_status action and the v2 update_field action
 * when `field === "status"`.
 */
async function applyStatusUpdate(
	ctx: MutationCtx,
	targetInfo: {
		type: ObjectType;
		id:
			| Id<"clients">
			| Id<"projects">
			| Id<"quotes">
			| Id<"invoices">
			| Id<"tasks">;
	},
	newStatus: string,
	orgId: Id<"organizations">,
	executionChain: Id<"workflowAutomations">[],
	recursionDepth: number
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
	// Validate the new status is valid for the target type
	if (!isValidStatus(targetInfo.type, newStatus)) {
		return {
			success: false,
			error: `Invalid status "${newStatus}" for ${targetInfo.type}`,
		};
	}

	// Get the current status before update (for triggering cascading automations)
	const targetObject = await getObject(ctx, targetInfo.type, targetInfo.id, orgId);
	if (!targetObject) {
		return { success: false, error: "Target object not found" };
	}
	const oldStatus = (targetObject as Record<string, unknown>)?.status as
		| string
		| undefined;

	// Update the target object's status
	try {
		// Prepare update payload
		const updatePayload: Record<string, any> = { status: newStatus };

		// Special handling for completion timestamps
		if (newStatus === "completed") {
			const wasCompleted = oldStatus === "completed";
			if (!wasCompleted) {
				updatePayload.completedAt = Date.now();
			}
		} else if (newStatus === "approved" && targetInfo.type === "quote") {
			const wasApproved = oldStatus === "approved";
			if (!wasApproved) {
				updatePayload.approvedAt = Date.now();
			}
		} else if (newStatus === "paid" && targetInfo.type === "invoice") {
			const wasPaid = oldStatus === "paid";
			if (!wasPaid) {
				updatePayload.paidAt = Date.now();
			}
		}

		// Apply the update
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await ctx.db.patch(targetInfo.id, updatePayload as any);

		// IMPORTANT: Update aggregates atomically in the same transaction
		// This prevents "key not found" errors when entities are later deleted or updated
		if (oldStatus && oldStatus !== newStatus) {
			const updatedObject = await ctx.db.get(targetInfo.id);
			if (!updatedObject) {
				return {
					success: false,
					error: "Target object was deleted during update",
				};
			}

			if (targetObject) {
				switch (targetInfo.type) {
					case "project":
						await AggregateHelpers.updateProject(
							ctx,
							targetObject as Doc<"projects">,
							updatedObject as Doc<"projects">
						);
						break;
					case "quote":
						await AggregateHelpers.updateQuote(
							ctx,
							targetObject as Doc<"quotes">,
							updatedObject as Doc<"quotes">
						);
						break;
					case "invoice":
						await AggregateHelpers.updateInvoice(
							ctx,
							targetObject as Doc<"invoices">,
							updatedObject as Doc<"invoices">
						);
						break;
					// Clients and tasks don't have aggregate status tracking
				}
			}
		}

		// Emit cascading status change event with execution chain context
		// The event bus will handle dispatching to automation handler with recursion protection
		if (oldStatus && oldStatus !== newStatus) {
			// Create correlation ID that includes chain info for the event bus
			const correlationId = `cascade-${executionChain.join("-")}-${Date.now()}`;

			await ctx.db.insert("domainEvents", {
				orgId,
				eventType: "entity.status_changed",
				eventSource: "automationExecutor.applyStatusUpdate",
				payload: {
					entityType: targetInfo.type,
					entityId: targetInfo.id,
					field: "status",
					oldValue: oldStatus,
					newValue: newStatus,
					// Pass execution chain in metadata for recursion prevention
					metadata: {
						executionChain,
						recursionDepth,
						isCascade: true,
					},
				},
				status: "pending",
				correlationId,
				createdAt: Date.now(),
				attemptCount: 0,
			});

			// Trigger event processing
			await ctx.scheduler.runAfter(0, internal.eventBus.processEvents, {});
		}

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to update status",
		};
	}
}

/**
 * Resolve the target object for an action
 */
async function resolveTarget(
	ctx: MutationCtx,
	targetType: "self" | "project" | "client" | "quote" | "invoice",
	objectType: ObjectType,
	objectId: string,
	triggerObject: Record<string, unknown>,
	orgId: Id<"organizations">
): Promise<{
	type: ObjectType;
	id:
		| Id<"clients">
		| Id<"projects">
		| Id<"quotes">
		| Id<"invoices">
		| Id<"tasks">;
} | null> {
	if (targetType === "self") {
		return {
			type: objectType,
			id: objectId as
				| Id<"clients">
				| Id<"projects">
				| Id<"quotes">
				| Id<"invoices">
				| Id<"tasks">,
		};
	}

	// Resolve related objects based on the trigger object type
	switch (targetType) {
		case "project": {
			// Get project from trigger object
			const projectId = triggerObject.projectId as Id<"projects"> | undefined;
			if (!projectId) {
				return null;
			}
			const project = await ctx.db.get(projectId);
			if (!project || project.orgId !== orgId) {
				return null;
			}
			return { type: "project", id: projectId };
		}

		case "client": {
			// Get client - could be direct or via project
			let clientId = triggerObject.clientId as Id<"clients"> | undefined;

			console.log(`[AutomationExecutor] Resolving client target:`, {
				directClientId: clientId,
				projectId: triggerObject.projectId,
				triggerObjectKeys: Object.keys(triggerObject),
			});

			if (!clientId) {
				// Try to get via project
				const projectId = triggerObject.projectId as Id<"projects"> | undefined;
				if (projectId) {
					const project = await ctx.db.get(projectId);
					if (project) {
						clientId = project.clientId;
						console.log(`[AutomationExecutor] Found client via project:`, {
							projectId,
							clientId,
						});
					}
				}
			}

			if (!clientId) {
				console.warn(`[AutomationExecutor] Could not resolve client ID`, {
					triggerObject: JSON.stringify(triggerObject),
				});
				return null;
			}

			const client = await ctx.db.get(clientId);
			if (!client || client.orgId !== orgId) {
				console.warn(`[AutomationExecutor] Client not found or org mismatch`, {
					clientId,
					exists: !!client,
					orgMatch: client?.orgId === orgId,
				});
				return null;
			}
			return { type: "client", id: clientId };
		}

		case "quote": {
			// Only invoices have a quoteId reference
			const quoteId = triggerObject.quoteId as Id<"quotes"> | undefined;
			if (!quoteId) {
				return null;
			}
			const quote = await ctx.db.get(quoteId);
			if (!quote || quote.orgId !== orgId) {
				return null;
			}
			return { type: "quote", id: quoteId };
		}

		case "invoice": {
			// Quotes don't have direct invoice references
			// We'd need to search, which is expensive - skip for now
			return null;
		}

		default:
			return null;
	}
}

/**
 * Coerce a resolved ValueRef into the field's registry type before writing.
 * `select` values are validated against the field's option list (static
 * values are already checked at save time; this guards dynamic var refs).
 */
function coerceFieldValue(
	fieldDef: FieldDefinition,
	raw: unknown
): { ok: true; value: unknown } | { ok: false; error: string } {
	if (raw === undefined || raw === null) {
		return { ok: true, value: null };
	}

	switch (fieldDef.type) {
		case "text":
			return { ok: true, value: String(raw) };
		case "select": {
			const value = String(raw);
			if (
				fieldDef.options &&
				!fieldDef.options.some((option) => option.value === value)
			) {
				return {
					ok: false,
					error: `"${value}" is not a valid value for field "${fieldDef.key}"`,
				};
			}
			return { ok: true, value };
		}
		case "number":
		case "currency": {
			// Number("") === 0, so blank strings must be rejected explicitly.
			if (typeof raw === "string" && raw.trim() === "") {
				return {
					ok: false,
					error: `"${raw}" is not a valid number for field "${fieldDef.key}"`,
				};
			}
			const n = typeof raw === "number" ? raw : Number(raw);
			if (Number.isNaN(n)) {
				return {
					ok: false,
					error: `"${String(raw)}" is not a valid number for field "${fieldDef.key}"`,
				};
			}
			return { ok: true, value: n };
		}
		case "boolean": {
			if (typeof raw === "boolean") return { ok: true, value: raw };
			if (raw === "true") return { ok: true, value: true };
			if (raw === "false") return { ok: true, value: false };
			return {
				ok: false,
				error: `"${String(raw)}" is not a valid boolean for field "${fieldDef.key}"`,
			};
		}
		case "date": {
			const n = typeof raw === "number" ? raw : Date.parse(String(raw));
			if (Number.isNaN(n)) {
				return {
					ok: false,
					error: `"${String(raw)}" is not a valid date for field "${fieldDef.key}"`,
				};
			}
			return { ok: true, value: n };
		}
		case "id":
			return { ok: true, value: String(raw) };
		default: {
			const _exhaustive: never = fieldDef.type;
			return _exhaustive;
		}
	}
}

/** Execute a v2 action config. */
async function executeActionNodeV2(
	ctx: MutationCtx,
	action: AutomationAction,
	scopeRecord: ScopeRecord | undefined,
	env: WalkEnv
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
	switch (action.type) {
		case "update_field":
			break; // handled below
		case "create_task":
			return executeCreateTaskAction(ctx, action, scopeRecord, env);
		case "send_notification":
			return executeSendNotificationAction(ctx, action, scopeRecord, env);
		case "send_team_message":
			return executeSendTeamMessageAction(ctx, action, scopeRecord, env);
		default: {
			const _exhaustive: never = action;
			return _exhaustive;
		}
	}

	if (!scopeRecord) {
		return { success: false, error: NO_SCOPE_RECORD_ERROR };
	}
	const { type: objectType, id: objectId, record: triggerObject } = scopeRecord;
	const { orgId, executionChain, recursionDepth } = env;

	const targetInfo = await resolveTargetV2(
		ctx,
		action.target,
		objectType,
		objectId,
		triggerObject,
		orgId
	);

	if (!targetInfo) {
		// Target not found - skip this action (e.g., task has no client)
		console.warn(
			`[AutomationExecutor] Target not found: target=${JSON.stringify(action.target)}, objectType=${objectType}, objectId=${objectId}`
		);
		return { success: true, skipped: true };
	}

	const fieldDef = getFieldDefinition(targetInfo.type, action.field);
	if (!fieldDef) {
		return {
			success: false,
			error: `Unknown field "${action.field}" for ${targetInfo.type}`,
		};
	}
	if (!fieldDef.writable) {
		return {
			success: false,
			error: `Field "${action.field}" is not writable${
				fieldDef.writeExclusionReason ? `: ${fieldDef.writeExclusionReason}` : ""
			}`,
		};
	}

	const rawValue = resolveValueRef(action.value, env.scope);
	const coerced = coerceFieldValue(fieldDef, rawValue);
	if (!coerced.ok) {
		return { success: false, error: coerced.error };
	}

	// Status writes reuse the existing validation + aggregate + cascade flow.
	if (action.field === "status") {
		if (typeof coerced.value !== "string") {
			return {
				success: false,
				error: `Status value for ${targetInfo.type} must be a string`,
			};
		}
		return applyStatusUpdate(
			ctx,
			targetInfo,
			coerced.value,
			orgId,
			executionChain,
			recursionDepth
		);
	}

	const targetObject = await getObject(ctx, targetInfo.type, targetInfo.id, orgId);
	if (!targetObject) {
		return { success: false, error: "Target object not found" };
	}

	try {
		const updatePayload: Record<string, any> = {
			[action.field]: coerced.value,
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await ctx.db.patch(targetInfo.id, updatePayload as any);

		const updatedObject = await ctx.db.get(targetInfo.id);
		if (!updatedObject) {
			return {
				success: false,
				error: "Target object was deleted during update",
			};
		}

		// Keep aggregates in sync; each helper no-ops unless a field it
		// tracks (status/completedAt/approvedAt/paidAt/total) changed.
		switch (targetInfo.type) {
			case "project":
				await AggregateHelpers.updateProject(
					ctx,
					targetObject as Doc<"projects">,
					updatedObject as Doc<"projects">
				);
				break;
			case "quote":
				await AggregateHelpers.updateQuote(
					ctx,
					targetObject as Doc<"quotes">,
					updatedObject as Doc<"quotes">
				);
				break;
			case "invoice":
				await AggregateHelpers.updateInvoice(
					ctx,
					targetObject as Doc<"invoices">,
					updatedObject as Doc<"invoices">
				);
				break;
			// Clients and tasks don't have aggregate field tracking
		}

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to update field",
		};
	}
}

/**
 * Resolve a v2 action target: "self" is the record in scope; `{ related }`
 * follows the field-registry relation FK for the record's object type,
 * falling back to resolving a client indirectly via the record's project
 * when there's no direct clientId (mirrors legacy resolveTarget's "client"
 * case).
 */
async function resolveTargetV2(
	ctx: MutationCtx,
	target: ActionTarget,
	objectType: ObjectType,
	objectId: string,
	triggerObject: Record<string, unknown>,
	orgId: Id<"organizations">
): Promise<{
	type: ObjectType;
	id:
		| Id<"clients">
		| Id<"projects">
		| Id<"quotes">
		| Id<"invoices">
		| Id<"tasks">;
} | null> {
	if (target === "self") {
		return {
			type: objectType,
			id: objectId as
				| Id<"clients">
				| Id<"projects">
				| Id<"quotes">
				| Id<"invoices">
				| Id<"tasks">,
		};
	}

	const relatedType = target.related;
	const fkField = RELATION_FIELD[objectType]?.[relatedType];
	let relatedId = fkField
		? (triggerObject[fkField] as string | undefined)
		: undefined;

	// Legacy fallback: resolve client indirectly via the record's project when
	// there's no direct clientId (mirrors resolveTarget's "client" case).
	if (!relatedId && relatedType === "client") {
		const projectFk = RELATION_FIELD[objectType]?.project;
		const projectId = projectFk
			? (triggerObject[projectFk] as Id<"projects"> | undefined)
			: undefined;
		if (projectId) {
			const project = await ctx.db.get(projectId);
			if (project && project.orgId === orgId) {
				relatedId = project.clientId;
			}
		}
	}

	if (!relatedId) {
		return null;
	}

	const doc = await getObject(ctx, relatedType, relatedId, orgId);
	if (!doc) {
		return null;
	}

	return {
		type: relatedType,
		id: relatedId as
			| Id<"clients">
			| Id<"projects">
			| Id<"quotes">
			| Id<"invoices">
			| Id<"tasks">,
	};
}

// ---------------------------------------------------------------------------
// Slice 3 actions: create_task / send_notification / send_team_message
// ---------------------------------------------------------------------------

/**
 * Resolve a ValueRef to display text: variable refs resolve against the
 * scope, and static strings additionally support {{path}} interpolation.
 */
function resolveTextValue(
	ref: Extract<AutomationAction, { type: "create_task" }>["title"],
	scope: VariableScope
): string {
	const raw = resolveValueRef(ref, scope);
	if (raw === undefined || raw === null) return "";
	const text = typeof raw === "string" ? raw : String(raw);
	return interpolateTemplate(text, scope).trim();
}

async function executeCreateTaskAction(
	ctx: MutationCtx,
	action: Extract<AutomationAction, { type: "create_task" }>,
	scopeRecord: ScopeRecord | undefined,
	env: WalkEnv
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
	const title = resolveTextValue(action.title, env.scope);
	if (!title) {
		return { success: false, error: "Task title resolved to an empty value" };
	}
	const description = action.description
		? resolveTextValue(action.description, env.scope) || undefined
		: undefined;

	// Task dates are UTC-midnight normalized (see tasks.ts conventions).
	const dueInDays = action.dueInDays ?? 0;
	const base = new Date(Date.now() + dueInDays * 86_400_000);
	const date = Date.UTC(
		base.getUTCFullYear(),
		base.getUTCMonth(),
		base.getUTCDate()
	);

	let assigneeUserId: Id<"users"> | undefined;
	if (action.assigneeUserId) {
		const membership = await getMembership(
			ctx,
			action.assigneeUserId as Id<"users">,
			env.orgId
		);
		if (!membership) {
			return {
				success: false,
				error: "Task assignee is not a member of this organization",
			};
		}
		assigneeUserId = action.assigneeUserId as Id<"users">;
	}

	let projectId: Id<"projects"> | undefined;
	let clientId: Id<"clients"> | undefined;
	if (action.linkToRecord && scopeRecord) {
		const link = await resolveTaskLink(ctx, scopeRecord, env.orgId);
		projectId = link.projectId;
		clientId = link.clientId;
	}

	try {
		const taskId = await ctx.db.insert("tasks", {
			orgId: env.orgId,
			title,
			description,
			date,
			status: "pending",
			type: "internal",
			assigneeUserId,
			projectId,
			clientId,
		});

		const task = await ctx.db.get(taskId);
		if (task) {
			await ActivityHelpers.taskCreated(ctx, task);

			// Emit record_created with the execution chain in metadata so
			// cascading automations keep recursion protection (the plain
			// emitRecordCreatedEvent helper would drop the chain).
			await ctx.db.insert("domainEvents", {
				orgId: env.orgId,
				eventType: "entity.record_created",
				eventSource: "automationExecutor.executeCreateTaskAction",
				payload: {
					entityType: "task",
					entityId: taskId,
					metadata: {
						executionChain: env.executionChain,
						recursionDepth: env.recursionDepth,
						isCascade: true,
					},
				},
				status: "pending",
				correlationId: `cascade-${env.executionChain.join("-")}-${Date.now()}`,
				createdAt: Date.now(),
				attemptCount: 0,
			});
			await ctx.scheduler.runAfter(0, internal.eventBus.processEvents, {});
		}

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to create task",
		};
	}
}

/**
 * Derive the project/client links for a created task from the record in
 * scope, verifying org ownership before linking.
 */
async function resolveTaskLink(
	ctx: MutationCtx,
	scopeRecord: ScopeRecord,
	orgId: Id<"organizations">
): Promise<{ projectId?: Id<"projects">; clientId?: Id<"clients"> }> {
	let projectId: Id<"projects"> | undefined;
	let clientId: Id<"clients"> | undefined;

	if (scopeRecord.type === "project") {
		projectId = scopeRecord.id as Id<"projects">;
		clientId = scopeRecord.record.clientId as Id<"clients"> | undefined;
	} else if (scopeRecord.type === "client") {
		clientId = scopeRecord.id as Id<"clients">;
	} else {
		const projectFk = RELATION_FIELD[scopeRecord.type]?.project;
		const clientFk = RELATION_FIELD[scopeRecord.type]?.client;
		projectId = projectFk
			? (scopeRecord.record[projectFk] as Id<"projects"> | undefined)
			: undefined;
		clientId = clientFk
			? (scopeRecord.record[clientFk] as Id<"clients"> | undefined)
			: undefined;
	}

	// Fill the client via the project when only the project is known.
	if (projectId && !clientId) {
		const project = await ctx.db.get(projectId);
		if (project && project.orgId === orgId) {
			clientId = project.clientId;
		}
	}

	// Verify org ownership; drop links that don't check out.
	if (projectId) {
		const project = await ctx.db.get(projectId);
		if (!project || project.orgId !== orgId) projectId = undefined;
	}
	if (clientId) {
		const client = await ctx.db.get(clientId);
		if (!client || client.orgId !== orgId) clientId = undefined;
	}

	return { projectId, clientId };
}

/** List org member user ids, optionally restricted to admins. */
async function resolveMemberUserIds(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	adminsOnly: boolean
): Promise<Id<"users">[]> {
	const memberships = await listMembershipsByOrg(ctx, orgId);
	return memberships
		.filter((m) => (adminsOnly ? m.role === "admin" : true))
		.map((m) => m.userId);
}

/**
 * The user who "owns" the record in scope: a task's assignee, else the org
 * owner (no other entity carries an owner field).
 */
async function resolveRecordOwner(
	ctx: MutationCtx,
	scopeRecord: ScopeRecord | undefined,
	orgId: Id<"organizations">
): Promise<Id<"users"> | null> {
	if (scopeRecord?.type === "task") {
		const assignee = scopeRecord.record.assigneeUserId as
			| Id<"users">
			| undefined;
		if (assignee) return assignee;
	}
	const org = await ctx.db.get(orgId);
	return org?.ownerUserId ?? null;
}

function automationActionUrl(scopeRecord: ScopeRecord | undefined): string {
	return scopeRecord ? `/${scopeRecord.type}s/${scopeRecord.id}` : "/home";
}

async function executeSendNotificationAction(
	ctx: MutationCtx,
	action: Extract<AutomationAction, { type: "send_notification" }>,
	scopeRecord: ScopeRecord | undefined,
	env: WalkEnv
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
	let userIds: Id<"users">[];
	if (action.recipient === "org_admins") {
		userIds = await resolveMemberUserIds(ctx, env.orgId, true);
		if (userIds.length === 0) {
			return { success: true, skipped: true, error: "No admins to notify" };
		}
	} else if (action.recipient === "record_owner") {
		const owner = await resolveRecordOwner(ctx, scopeRecord, env.orgId);
		if (!owner) {
			return {
				success: true,
				skipped: true,
				error: "No owner found for the record in scope",
			};
		}
		userIds = [owner];
	} else {
		const userId = action.recipient.userId as Id<"users">;
		const membership = await getMembership(ctx, userId, env.orgId);
		if (!membership) {
			return {
				success: false,
				error: "Notification recipient is not a member of this organization",
			};
		}
		userIds = [userId];
	}

	const message = interpolateTemplate(action.message, env.scope).trim();
	if (!message) {
		return {
			success: false,
			error: "Notification message resolved to an empty value",
		};
	}

	try {
		for (const userId of userIds) {
			await ctx.db.insert("notifications", {
				orgId: env.orgId,
				userId,
				notificationType: "automation_message",
				title: env.automation.name,
				message,
				entityType: scopeRecord?.type,
				entityId: scopeRecord?.id,
				actionUrl: scopeRecord ? automationActionUrl(scopeRecord) : undefined,
				isRead: false,
				sentVia: "in_app",
				sentAt: Date.now(),
			});
		}
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to send notification",
		};
	}
}

async function executeSendTeamMessageAction(
	ctx: MutationCtx,
	action: Extract<AutomationAction, { type: "send_team_message" }>,
	scopeRecord: ScopeRecord | undefined,
	env: WalkEnv
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
	let userIds: Id<"users">[];
	if (action.recipients === "all_members") {
		userIds = await resolveMemberUserIds(ctx, env.orgId, false);
	} else if (action.recipients === "admins") {
		userIds = await resolveMemberUserIds(ctx, env.orgId, true);
	} else {
		const valid: Id<"users">[] = [];
		for (const raw of action.recipients.userIds) {
			const userId = raw as Id<"users">;
			const membership = await getMembership(ctx, userId, env.orgId);
			if (membership) valid.push(userId);
		}
		userIds = valid;
	}
	if (userIds.length === 0) {
		return { success: true, skipped: true, error: "No recipients to message" };
	}

	const title =
		interpolateTemplate(action.title, env.scope).trim() ||
		env.automation.name;
	const message = interpolateTemplate(action.message, env.scope).trim();
	if (!message) {
		return { success: false, error: "Message resolved to an empty value" };
	}

	const org = await ctx.db.get(env.orgId);
	const clerkOrgId = org?.clerkOrganizationId ?? "";
	const actionUrl = automationActionUrl(scopeRecord);

	try {
		for (const userId of userIds) {
			const notificationId = await ctx.db.insert("notifications", {
				orgId: env.orgId,
				userId,
				notificationType: "automation_message",
				title,
				message,
				entityType: scopeRecord?.type,
				entityId: scopeRecord?.id,
				actionUrl,
				isRead: false,
				sentVia: "in_app",
				sentAt: Date.now(),
			});
			await enqueuePush(ctx, {
				notificationType: "automation_message",
				taggedUserId: userId,
				title,
				body: message,
				url: actionUrl,
				notificationId,
				orgId: clerkOrgId,
			});
		}
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to send team message",
		};
	}
}

// Cleanup configuration
const EXECUTION_LOG_RETENTION_DAYS = 30;

/**
 * Clean up old execution logs to prevent unbounded table growth
 * Should be run periodically via cron job
 */
export const cleanupOldExecutions = internalMutation({
	args: {
		olderThanDays: v.optional(v.number()),
		batchSize: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const retentionDays = args.olderThanDays ?? EXECUTION_LOG_RETENTION_DAYS;
		const batchSize = args.batchSize ?? 500;

		const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

		// Get completed/failed executions older than retention period
		// We keep "running" ones in case they're still active
		let deleted = 0;
		let hasMore = true;

		while (hasMore && deleted < batchSize) {
			const oldExecutions = await ctx.db
				.query("workflowExecutions")
				.withIndex("by_triggeredAt", (q) => q.lt("triggeredAt", cutoffTime))
				.filter((q) => q.neq(q.field("status"), "running"))
				.take(100);

			if (oldExecutions.length === 0) {
				hasMore = false;
				break;
			}

			for (const execution of oldExecutions) {
				await ctx.db.delete(execution._id);
				deleted++;
			}
		}

		console.log(
			`Cleaned up ${deleted} old automation execution logs (older than ${retentionDays} days)`
		);

		return { deleted, hasMore };
	},
});

/**
 * Get automation execution statistics for an organization
 */
// Raw internalQuery — no factory variant exists; if exposing user-scoped data, prefer userQuery.
export const getExecutionStats = internalQuery({
	args: {
		orgId: v.id("organizations"),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const oneDayAgo = now - 24 * 60 * 60 * 1000;
		const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

		// Get executions from last 24 hours
		const recentExecutions = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_org_triggeredAt", (q) =>
				q.eq("orgId", args.orgId).gte("triggeredAt", oneDayAgo)
			)
			.collect();

		// Get executions from last week
		const weeklyExecutions = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_org_triggeredAt", (q) =>
				q.eq("orgId", args.orgId).gte("triggeredAt", oneWeekAgo)
			)
			.collect();

		const last24h = {
			total: recentExecutions.length,
			completed: recentExecutions.filter((e) => e.status === "completed")
				.length,
			failed: recentExecutions.filter((e) => e.status === "failed").length,
			skipped: recentExecutions.filter((e) => e.status === "skipped").length,
		};

		const lastWeek = {
			total: weeklyExecutions.length,
			completed: weeklyExecutions.filter((e) => e.status === "completed")
				.length,
			failed: weeklyExecutions.filter((e) => e.status === "failed").length,
			skipped: weeklyExecutions.filter((e) => e.status === "skipped").length,
		};

		return { last24h, lastWeek };
	},
});
