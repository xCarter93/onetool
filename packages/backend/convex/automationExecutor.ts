import {
	internalMutation,
	internalQuery,
	MutationCtx,
	QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { AggregateHelpers } from "./lib/aggregates";
import { roundCents, sumMoney } from "./lib/money";
import { ActivityHelpers } from "./lib/activities";
import { ENTITY_PERMISSION_OBJECT } from "./activities";
import { systemMutation, userMutation, userQuery } from "./lib/factories";
import { computeNextRunAt } from "./lib/schedule";
import {
	isAdminRole,
	orgHasPremiumPlan,
	userHasPremiumOverride,
} from "./lib/permissions";
import { getMembership, listMembershipsByOrg } from "./lib/memberships";
import { enqueuePush } from "./push";
import { insertTeamMessage } from "./teamMessages";
import {
	evaluateConditionGroups,
	interpolateTemplate,
	resolveValueRef,
	type VariableScope,
} from "./lib/conditionEval";
import { calendarDayEpoch, toEpochMs } from "./lib/formula";
import {
	FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT,
	FREE_MAX_CLIENTS,
} from "./lib/planLimits";
import {
	RELATION_FIELD,
	getCreatableFields,
	getFieldDefinition,
	getRequiredCreateFields,
	getStatusOptions,
	isCreatableObjectType,
	type FieldDefinition,
} from "./lib/fieldRegistry";
import {
	ADJUST_TIME_UNIT_MS,
	DEFAULT_FETCH_LIMIT,
	DELAY_UNIT_MS,
	FETCH_SCAN_CEILING,
	MAX_DELAY_MS,
	MAX_FETCH_LIMIT,
	MAX_LOOP_ITEM_ERRORS,
	MAX_LOOP_ITERATIONS,
	objectTypeValidator,
	triggerRecordObjectType,
	type ActionTarget,
	type AutomationAction,
	type TeamMessageMention,
	type ValueRef,
	type AutomationObjectType,
	type AutomationTrigger,
	type ExecutedNode,
	type FormulaResource,
	type LoopSummary,
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
	formulas: FormulaResource[] | undefined;
} {
	if (automation.publishedSnapshot) {
		return {
			trigger: automation.publishedSnapshot.trigger,
			nodes: automation.publishedSnapshot.nodes,
			formulas: automation.publishedSnapshot.formulas,
		};
	}
	return {
		trigger: automation.trigger,
		nodes: automation.nodes,
		formulas: automation.formulas,
	};
}

/**
 * IANA timezone for formula date math. Scheduled automations use their schedule
 * timezone; everything else defaults to UTC (there is no per-org tz field).
 */
function automationFormulaTz(trigger: AutomationTrigger): string {
	if ("type" in trigger && trigger.type === "scheduled") {
		return trigger.schedule.timezone;
	}
	return "UTC";
}

/** Extract a user id from a "manual:"/"test:"/"actor:" triggeredBy marker. */
function parseActorUserId(
	ctx: MutationCtx,
	triggeredBy: string
): Id<"users"> | null {
	const match = /^(?:manual|test|actor):(.+)$/.exec(triggeredBy);
	if (!match) return null;
	return ctx.db.normalizeId("users", match[1]);
}

/**
 * Event values a status_changed trigger simulates: from/to statuses become
 * trigger.event.oldValue/newValue so conditions on the transition resolve.
 * Other trigger types carry no event values.
 */
function deriveTriggerEventValues(trigger: AutomationTrigger): {
	eventOldValue: string | undefined;
	eventNewValue: string | undefined;
} {
	if ("type" in trigger && trigger.type === "status_changed") {
		return {
			eventOldValue: trigger.fromStatus,
			eventNewValue: trigger.toStatus,
		};
	}
	return { eventOldValue: undefined, eventNewValue: undefined };
}

/**
 * Built-in globals available to every run: workflow.now (execution start),
 * org.id/name, the triggering user, and run.* metadata (this automation's
 * identity + how it fired). The user is parsed from triggeredBy for manual/test
 * runs and is empty for scheduled/event runs (no actor).
 */
async function buildGlobalsScope(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	nowMs: number,
	tz: string,
	triggeredBy: string,
	run: NonNullable<VariableScope["run"]>
): Promise<Pick<VariableScope, "workflow" | "org" | "user" | "run">> {
	const globals: Pick<VariableScope, "workflow" | "org" | "user" | "run"> = {
		workflow: { now: nowMs, tz },
		run,
	};
	const org = await ctx.db.get(orgId);
	if (org) globals.org = { id: orgId, name: org.name };

	const actorUserId = parseActorUserId(ctx, triggeredBy);
	if (actorUserId) {
		const user = await ctx.db.get(actorUserId);
		if (user) {
			globals.user = { id: user._id, name: user.name, email: user.email };
		}
	}
	return globals;
}

/** run.* metadata for a live execution — automation identity + how it fired. */
function runMetadata(
	automation: AutomationDoc,
	executionId: Id<"workflowExecutions">,
	trigger: AutomationTrigger
): NonNullable<VariableScope["run"]> {
	return {
		automationName: automation.name,
		automationId: automation._id,
		executionId,
		triggerType: "type" in trigger ? trigger.type : "status_changed",
	};
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
		// For entry-criteria evaluation (A5-2): the triggering record's id and
		// the acting user, resolved once and shared by every candidate.
		entityId: v.optional(v.string()),
		actorUserId: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<AutomationDoc[]> => {
		// Org-scoped active automations; org isolation is enforced by the
		// by_org_status index prefix (orgId + status === "active").
		const automations = await ctx.db
			.query("workflowAutomations")
			.withIndex("by_org_status", (q) =>
				q.eq("orgId", args.orgId).eq("status", "active")
			)
			.collect();

		// Entry-criteria inputs, fetched once per event: the actual triggering
		// record, plus org/actor for globals. Skipped entirely when no candidate
		// defines entry criteria. A non-matching event produces no execution row
		// at all (quiet and cheap).
		const anyEntryCriteria = automations.some((automation) => {
			const trigger = executableDefinition(automation).trigger;
			return (
				"entryCriteria" in trigger &&
				trigger.entryCriteria !== undefined &&
				trigger.entryCriteria.groups.length > 0
			);
		});
		const record =
			anyEntryCriteria && args.entityId
				? await getObject(ctx, args.objectType, args.entityId, args.orgId)
				: null;
		const org = anyEntryCriteria ? await ctx.db.get(args.orgId) : null;
		const actorId =
			anyEntryCriteria && args.actorUserId
				? ctx.db.normalizeId("users", args.actorUserId)
				: null;
		const actor = actorId ? await ctx.db.get(actorId) : null;

		return automations.filter((automation) => {
			const definition = executableDefinition(automation);
			const trigger = definition.trigger;
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

			const shapeMatches = ((): boolean => {
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
						// Field filter via v2 `fields`; no filter means any field
						// change matches. Kept alongside entryCriteria for
						// back-compat.
						const watched: string[] = [];
						if ("fields" in trigger && trigger.fields) {
							watched.push(...trigger.fields);
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
			})();
			if (!shapeMatches) return false;

			// Entry criteria (A5-2): evaluated against the actual record before
			// anything is scheduled, with condition-node semantics
			// (evaluateConditionGroups) scoped to trigger + globals.
			const criteria =
				"entryCriteria" in trigger ? trigger.entryCriteria : undefined;
			if (!criteria || criteria.groups.length === 0) return true;
			if (!record) return false;
			const scope: VariableScope = {
				trigger: {
					record,
					event:
						args.fromStatus !== undefined || args.toStatus !== undefined
							? { oldValue: args.fromStatus, newValue: args.toStatus }
							: undefined,
				},
				workflow: { now: Date.now(), tz: automationFormulaTz(trigger) },
				org: org ? { id: args.orgId, name: org.name } : undefined,
				user: actor
					? { id: actor._id, name: actor.name, email: actor.email }
					: undefined,
				formulas: definition.formulas,
			};
			return evaluateConditionGroups(
				criteria.logic,
				criteria.groups,
				record,
				scope
			);
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
	/** Internal user who caused the event; threads user.* globals into the run. */
	actorUserId?: string;
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
			entityId: params.entityId,
			actorUserId: params.actorUserId,
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

	// "actor:<userId>" lets buildGlobalsScope resolve user.* globals on
	// event-triggered runs; falls back to the entity id when no internal user
	// caused the event (webhooks, portal actions).
	const triggeredBy = params.actorUserId
		? `actor:${params.actorUserId}`
		: params.entityId;

	// Schedule execution for each matching automation
	for (const automation of automations) {
		// Check if this automation is already in the chain (prevent loops)
		if (params.executionChain.includes(automation._id)) {
			console.warn(
				`Automation loop detected: ${automation._id} already in chain. Skipping.`
			);
			// Log as skipped (zero-duration: completedAt == triggeredAt).
			const skippedAt = Date.now();
			await ctx.db.insert("workflowExecutions", {
				orgId,
				automationId: automation._id,
				triggeredBy,
				triggeredAt: skippedAt,
				completedAt: skippedAt,
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
			triggeredBy,
			triggeredAt: Date.now(),
			status: "running",
			snapshotVersion: automation.publishedSnapshot?.version,
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
		actorUserId: v.optional(v.string()),
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
			actorUserId: args.actorUserId,
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
					actorUserId?: string;
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
			actorUserId: metadata?.actorUserId,
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
				// Cron has no identity, so both premium overrides are read from the
				// webhook-synced doc mirrors: the org's, else the creator's (a user-level
				// override follows the automations that user built).
				const org = await ctx.db.get(automation.orgId);
				const premium =
					orgHasPremiumPlan(org) ||
					userHasPremiumOverride(await ctx.db.get(automation.createdBy));
				if (!premium) {
					await ctx.db.insert("workflowExecutions", {
						orgId: automation.orgId,
						automationId: automation._id,
						triggeredBy: "schedule",
						triggeredAt: now,
						completedAt: now,
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
						completedAt: now,
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
				// Surface the failure as a visible run row, and clear nextRunAt:
				// a row that fails before its claim patch would otherwise come
				// due again every tick, failing forever.
				try {
					await ctx.db.patch(automation._id, { nextRunAt: undefined });
					await ctx.db.insert("workflowExecutions", {
						orgId: automation.orgId,
						automationId: automation._id,
						triggeredBy: "schedule",
						triggeredAt: now,
						completedAt: now,
						status: "failed",
						mode: "production",
						snapshotVersion: automation.publishedSnapshot?.version,
						nodesExecuted: [],
						error:
							error instanceof Error
								? error.message
								: "Scheduled dispatch failed",
					});
				} catch {
					// Even the failure bookkeeping failed; the console error stands.
				}
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
	/** True when the scan stopped at its cap with org rows still unscanned. */
	truncated: boolean;
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
	/** True once any fetch in this run stopped before considering every row. */
	dataTruncated: boolean;
	/** Rows this walk may still scan across all its fetches (WALK_SCAN_BUDGET). */
	fetchScanBudget: number;
	/** Original trigger reference, persisted into resumeState for delays. */
	trigger: { objectType?: ObjectType; objectId?: string };
	/** Wall-clock start of the node currently executing; stamped onto each entry. */
	nodeStartedAt: number;
	/** True for real runs (not test/dry); gates failure notifications. */
	isProduction: boolean;
	/**
	 * Per-loop item tallies, keyed by loop node id and carried across chunk
	 * boundaries via workflowExecutions.loopSummary. Authoritative — the entry
	 * log truncates and compacts, these counts never do.
	 */
	loopSummaries: LoopSummary[];
	/** The loop iteration currently executing; stamps identity onto its entries. */
	currentLoop?: {
		nodeId: string;
		index: number;
		itemId: string;
		label?: string;
	};
};

type WalkOutcome =
	| { kind: "chain_done" } // ran off the end of a chain
	| { kind: "ended" } // end node — terminate the whole run successfully
	| { kind: "next_item" } // next_item node — continue with the loop's next record
	| { kind: "waiting" } // delay checkpointed the run and scheduled a resume
	| { kind: "failed"; error: string };

/** Cap on stored per-node log entries (loops multiply them). */
const MAX_EXECUTED_ENTRIES = 400;

function pushEntry(env: WalkEnv, entry: ExecEntry): void {
	// Stamp per-node timing: startedAt = when the walk began this node,
	// completedAt = now. Both feed the runs viewer's per-step durations.
	// Inside a loop body, also stamp which iteration and record produced it —
	// without that a mid-loop failure can't be traced back to a record.
	const loop = env.currentLoop;
	const stamped: ExecEntry = {
		...entry,
		startedAt: entry.startedAt ?? env.nodeStartedAt,
		completedAt: entry.completedAt ?? Date.now(),
		...(loop
			? {
					loopNodeId: loop.nodeId,
					loopIndex: loop.index,
					loopItemId: loop.itemId,
					loopItemLabel: loop.label,
				}
			: {}),
	};
	if (env.nodesExecuted.length >= MAX_EXECUTED_ENTRIES) {
		if (!env.logTruncated) {
			env.logTruncated = true;
			// Synthetic marker: no loop stamp, or it renders as a phantom
			// iteration of whichever node happened to overflow the log.
			env.nodesExecuted.push({
				nodeId: stamped.nodeId,
				result: "skipped",
				startedAt: stamped.startedAt,
				completedAt: stamped.completedAt,
				error: `Execution log truncated after ${MAX_EXECUTED_ENTRIES} entries`,
			});
		}
		return;
	}
	env.nodesExecuted.push(stamped);
}

/**
 * Iterations whose per-step entries are kept in full. Past this, successful
 * iterations are rolled back out of the log (their outcome is still counted in
 * loopSummary) so the 400-entry cap can't swallow the failures further down —
 * which are the entries anyone reading the log actually came for.
 */
const LOOP_LOG_FULL_ITERATIONS = 50;

/**
 * Consecutive failures, with no success anywhere, that mean the loop is
 * misconfigured rather than fed bad data (a renamed field, a status value that
 * matches nothing). Below LOOP_CHUNK_SIZE, so it always trips inside the first
 * chunk — before any of it commits.
 */
const LOOP_FAILURE_CIRCUIT_BREAK = 10;

/** Stored error strings are display copy; keep one item's error from bloating the row. */
const MAX_ITEM_ERROR_CHARS = 500;

/** Uniquifies cascade correlationIds within a transaction (Date.now() is frozen there). */
let cascadeEventSeq = 0;

/**
 * Correlation id for a cascade domain event. Date.now() is frozen inside a Convex
 * transaction, so the per-module counter is what keeps ids unique when one run
 * emits several cascade events (e.g. two sequential update_fields/create_record
 * nodes) — without it the event bus could dedupe the second event by correlationId.
 */
function nextCascadeCorrelationId(executionChain: string[]): string {
	cascadeEventSeq += 1;
	return `cascade-${executionChain.join("-")}-${Date.now()}-${cascadeEventSeq}`;
}

/**
 * A throw that means the transaction is already doomed — every remaining item
 * would hit it too, and calling it "item 13 failed" would be a lie. These are
 * rethrown even when the loop is set to continue; everything else (a schema
 * validation throw, a plan-limit throw, a ConvexError from a handler) is a
 * genuine per-item failure and is caught.
 */
export function isFatalExecutionError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	// Verbatim Convex limit errors (get-convex/convex-backend): "Too many
	// documents read / bytes read / bytes written / writes in a single function
	// execution", "Too many functions scheduled by this mutation", "Function
	// execution timed out (maximum duration: …)".
	return (
		/too many (reads|writes|bytes|documents|function calls|functions(?: being)? scheduled|scheduled functions)/i.test(
			message
		) ||
		/execution timed out/i.test(message) ||
		/transaction.*too large/i.test(message)
	);
}

function loopSummaryFor(env: WalkEnv, nodeId: string): LoopSummary {
	let summary = env.loopSummaries.find((s) => s.nodeId === nodeId);
	if (!summary) {
		summary = {
			nodeId,
			total: 0,
			succeeded: 0,
			failed: 0,
			skipped: 0,
			errors: [],
		};
		env.loopSummaries.push(summary);
	}
	return summary;
}

/** True when any loop in this run skipped past a failing item. */
function hasLoopItemFailures(env: WalkEnv): boolean {
	return env.loopSummaries.some((s) => s.failed > 0);
}

/** Loop tallies for an execution patch; undefined when the run had no loops. */
function loopSummaryPatch(env: WalkEnv): LoopSummary[] | undefined {
	return env.loopSummaries.length > 0 ? env.loopSummaries : undefined;
}

/**
 * Drop the entries a compacted iteration appended. The truncation marker may be
 * among them, so logTruncated is re-derived rather than left latched — a stale
 * true makes pushEntry drop everything afterwards with nothing in the log to
 * show for it.
 */
function rollbackEntries(env: WalkEnv, mark: number): void {
	env.nodesExecuted.length = mark;
	// > not >=: the marker lives past index MAX, so an exactly-full log has
	// no marker yet — latching true here would drop later entries unmarked.
	env.logTruncated = env.nodesExecuted.length > MAX_EXECUTED_ENTRIES;
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
		// Org isolation: reject rows belonging to a different org than the
		// caller passed (mirrors resumeExecution/executeTestStep).
		const execution = await ctx.db.get(args.executionId);
		if (!execution || execution.orgId !== ctx.orgId) return;

		// Claim guard: scheduled mutations are exactly-once, but a duplicate or
		// misdirected invocation must never restart a walk — only a fresh,
		// still-running row may start one (resumes go through resumeExecution).
		if (
			execution.status !== "running" ||
			execution.resumeState !== undefined ||
			execution.nodesExecuted.length > 0
		) {
			console.warn(
				`[AutomationExecutor] executeAutomation skipped: execution ${args.executionId} already started or finished`
			);
			return;
		}

		// executeAutomation only ever runs real production/manual/scheduled runs
		// (test runs go through executeTestStep). Derived defensively so failure
		// alerts never fire on a test/dry row that somehow reached here.
		const isProduction = execution.mode !== "test" && !execution.dryRun;

		const automation = await ctx.db.get(args.automationId);
		if (!automation || automation.orgId !== ctx.orgId) {
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				error: "Automation not found",
			});
			// No automation doc to name the alert; skip notifyAutomationFailure.
			return;
		}

		// Production runs execute the published snapshot (falling back to the
		// working copy for unmigrated legacy rows). Unpublished working-copy
		// edits never affect what fires — those are exercised only by dry test
		// runs (executeTestStep).
		const definition = executableDefinition(automation);

		console.log(
			`[AutomationExecutor] Starting automation execution: ${automation.name}`,
			{
				automationId: args.automationId,
				executionId: args.executionId,
				totalNodes: definition.nodes.length,
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
				if (isProduction) {
					await notifyAutomationFailure(
						ctx,
						automation,
						"Triggering object not found",
						args.executionId
					);
				}
				return;
			}
			triggerObject = object;
			scopeRecord = {
				type: args.objectType,
				id: args.objectId,
				record: object,
			};
		}

		const globals = await buildGlobalsScope(
			ctx,
			automation.orgId,
			execution.triggeredAt,
			automationFormulaTz(definition.trigger),
			execution.triggeredBy,
			runMetadata(automation, args.executionId, definition.trigger)
		);

		const env: WalkEnv = {
			executionId: args.executionId,
			automation,
			nodesById: new Map(definition.nodes.map((n) => [n.id, n])),
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
				formulas: definition.formulas,
				...globals,
			},
			fetchOutputs: {},
			nodesExecuted: [],
			logTruncated: false,
			dataTruncated: false,
			loopSummaries: [],
			fetchScanBudget: WALK_SCAN_BUDGET,
			trigger: { objectType: args.objectType, objectId: args.objectId },
			nodeStartedAt: Date.now(),
			isProduction,
		};

		try {
			if (definition.nodes.length === 0) {
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
				definition.nodes[0].id,
				scopeRecord
			);
			await finishWalk(ctx, env, outcome);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				nodesExecuted: env.nodesExecuted,
				dataTruncated: env.dataTruncated,
				loopSummary: loopSummaryPatch(env),
				error: message,
			});
			if (isProduction) {
				await notifyAutomationFailure(
					ctx,
					automation,
					message,
					args.executionId
				);
			}
		}
	},
});

/**
 * Resume a run parked by a delay/delay_until node or a loop chunk boundary.
 * Scheduled by the walk engine at checkpoint time; rebuilds scope from
 * resumeState (fetch outputs re-resolved by id, deleted records skipped) and
 * continues the walk.
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

		// Accumulate the parked (delay) wall time BEFORE anything else, so every
		// terminal below preserves it and the derived activeMs stays honest.
		// Multiple sequential delays accumulate: each resume adds its own gap.
		const resumedAt = Date.now();
		const accumulatedPausedMs =
			(execution.pausedMs ?? 0) +
			(resumedAt - (execution.resumeState.checkpointAt ?? resumedAt));
		await ctx.db.patch(args.executionId, { pausedMs: accumulatedPausedMs });

		// Resumes only ever continue real production runs (test runs never park
		// at a delay). Derived for the failure-alert gate on the terminals below.
		const isProduction = execution.mode !== "test" && !execution.dryRun;

		const automation = await ctx.db.get(args.automationId);
		if (!automation || automation.orgId !== ctx.orgId) {
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				error: "Automation was deleted while the run was waiting",
				resumeState: undefined,
				currentNodeId: undefined,
			});
			// No automation doc to name the alert; skip notifyAutomationFailure.
			return;
		}

		const resume = execution.resumeState;

		// Runs are pinned to the snapshot version they started on: resuming on
		// a republished definition would silently apply new node semantics to a
		// walk checkpointed under old assumptions. Legacy rows without a
		// snapshotVersion keep the old resume-on-current behavior.
		if (
			execution.snapshotVersion !== undefined &&
			automation.publishedSnapshot?.version !== execution.snapshotVersion
		) {
			const message =
				"Automation was republished while the run was waiting; the parked run cannot continue on the new version";
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				error: message,
				resumeState: undefined,
				currentNodeId: undefined,
			});
			if (isProduction) {
				await notifyAutomationFailure(
					ctx,
					automation,
					message,
					args.executionId
				);
			}
			return;
		}

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
				if (isProduction) {
					await notifyAutomationFailure(
						ctx,
						automation,
						"Trigger record was deleted while the run was waiting",
						args.executionId
					);
				}
				return;
			}
			triggerObject = object;
			scopeRecord = {
				type: resume.objectType,
				id: resume.objectId,
				record: object,
			};
		}

		// The snapshotVersion guard above pins this to the version the run
		// started on; legacy rows (no snapshotVersion) still resume on the
		// current snapshot, protected only by the missing-node check below.
		const definition = executableDefinition(automation);

		// workflow.now stays pinned to the original start time so date math is
		// deterministic across the delay.
		const globals = await buildGlobalsScope(
			ctx,
			automation.orgId,
			execution.triggeredAt,
			automationFormulaTz(definition.trigger),
			execution.triggeredBy,
			runMetadata(automation, args.executionId, definition.trigger)
		);

		const env: WalkEnv = {
			executionId: args.executionId,
			automation,
			nodesById: new Map(definition.nodes.map((n) => [n.id, n])),
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
				formulas: definition.formulas,
				...globals,
			},
			fetchOutputs: {},
			nodesExecuted: [...execution.nodesExecuted],
			// Derived, not reset: the log carries over from the previous chunk, so
			// a false here makes every later chunk append its own truncation marker.
			logTruncated: execution.nodesExecuted.length > MAX_EXECUTED_ENTRIES,
			dataTruncated: execution.dataTruncated ?? false,
			loopSummaries: (execution.loopSummary ?? []).map((l) => ({
				...l,
				errors: [...l.errors],
			})),
			fetchScanBudget: WALK_SCAN_BUDGET,
			trigger: { objectType: resume.objectType, objectId: resume.objectId },
			nodeStartedAt: Date.now(),
			isProduction,
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
				// resumeState doesn't persist per-fetch truncation; the top-level
				// env.dataTruncated (restored from execution.dataTruncated above)
				// already carries any pre-delay truncation forward.
				truncated: false,
			};
			env.scope.nodes![output.nodeId] = { count: output.count };
		}

		// Restore aggregate/adjust_time results computed before the delay.
		for (const { nodeId, result } of resume.nodeResults ?? []) {
			env.scope.nodes![nodeId] = { ...env.scope.nodes![nodeId], result };
		}

		if (!env.nodesById.has(resume.resumeNodeId)) {
			const message =
				"Automation was edited while the run was waiting; the next step no longer exists";
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				nodesExecuted: env.nodesExecuted,
				loopSummary: loopSummaryPatch(env),
				error: message,
				resumeState: undefined,
				currentNodeId: undefined,
			});
			if (isProduction) {
				await notifyAutomationFailure(
					ctx,
					automation,
					message,
					args.executionId
				);
			}
			return;
		}

		try {
			let outcome: WalkOutcome;
			if (resume.loop) {
				// Parked at a loop chunk boundary: finish the remaining
				// iterations, then continue the walk after the loop.
				const loopNode = env.nodesById.get(resume.loop.nodeId);
				if (!loopNode || loopNode.config?.kind !== "loop") {
					const message =
						"Automation was edited while the run was waiting; the loop step no longer exists";
					await ctx.db.patch(args.executionId, {
						status: "failed",
						completedAt: Date.now(),
						nodesExecuted: env.nodesExecuted,
						loopSummary: loopSummaryPatch(env),
						error: message,
						resumeState: undefined,
						currentNodeId: undefined,
					});
					if (isProduction) {
						await notifyAutomationFailure(
							ctx,
							automation,
							message,
							args.executionId
						);
					}
					return;
				}
				outcome = await runLoopNode(ctx, env, loopNode, loopNode.config, {
					nextIndex: resume.loop.nextIndex,
					remainingItemIds: resume.loop.remainingItemIds,
				});
				if (outcome.kind === "chain_done") {
					outcome = await runWalk(
						ctx,
						env,
						loopNode.nextNodeId ??
							mergeContinuationFor(env.nodesById, loopNode.id),
						scopeRecord
					);
				}
			} else {
				outcome = await runWalk(ctx, env, resume.resumeNodeId, scopeRecord);
			}
			await finishWalk(ctx, env, outcome);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				nodesExecuted: env.nodesExecuted,
				dataTruncated: env.dataTruncated,
				loopSummary: loopSummaryPatch(env),
				error: message,
				resumeState: undefined,
				currentNodeId: undefined,
			});
			if (isProduction) {
				await notifyAutomationFailure(
					ctx,
					automation,
					message,
					args.executionId
				);
			}
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
			dataTruncated: env.dataTruncated,
			// Earlier chunks already committed their writes — say how many items
			// got through rather than implying the run did nothing.
			loopSummary: loopSummaryPatch(env),
			error: outcome.error,
			resumeState: undefined,
			currentNodeId: undefined,
		});
		// finishWalk is reached by production runs only (test runs stream via
		// executeTestStep), but gate defensively so a test/dry row never alerts.
		if (env.isProduction) {
			await notifyAutomationFailure(
				ctx,
				env.automation,
				outcome.error,
				env.executionId
			);
		}
		return;
	}

	await ctx.db.patch(env.automation._id, {
		lastTriggeredAt: Date.now(),
		triggerCount: (env.automation.triggerCount || 0) + 1,
	});

	// The walk reached the end, but a loop may have skipped past failing items.
	// This has to be checked on every non-failed outcome — an End step inside a
	// loop body lands here too, and would otherwise report a clean run.
	const itemFailures = hasLoopItemFailures(env);
	await ctx.db.patch(env.executionId, {
		status: itemFailures ? "completed_with_errors" : "completed",
		completedAt: Date.now(),
		nodesExecuted: env.nodesExecuted,
		dataTruncated: env.dataTruncated,
		loopSummary: loopSummaryPatch(env),
		resumeState: undefined,
		currentNodeId: undefined,
	});

	if (itemFailures && env.isProduction) {
		const failed = env.loopSummaries.reduce((n, l) => n + l.failed, 0);
		const total = env.loopSummaries.reduce((n, l) => n + l.total, 0);
		const first = env.loopSummaries.find((l) => l.errors.length > 0)?.errors[0];
		await notifyAutomationFailure(
			ctx,
			env.automation,
			`${failed} of ${total} items failed${
				first ? ` — ${first.label ?? "an item"}: ${first.error}` : ""
			}`,
			env.executionId
		);
	}
}

/**
 * Continuation for a dangling chain tail: the nearest enclosing condition's
 * mergeNodeId ("after the branches converge"). Ascends the static parent
 * tree. Boundaries: never escapes a loop body (a dangling body leaf still
 * means "next item"), and a dangle inside a condition's own merge chain
 * continues at the ANCESTORS' merges, not back at that condition.
 */
type ParentLink = {
	parent: AutomationNode;
	via: "branch" | "merge" | "body" | "next";
};

/**
 * Reverse parent index (child id -> parent + the pointer that reaches it),
 * cached per node map. A definition's nodesById is built once per execution
 * and never mutated, so the index stays valid for the whole walk; without it
 * every ancestor hop rescans all nodes.
 */
const parentIndexCache = new WeakMap<
	Map<string, AutomationNode>,
	Map<string, ParentLink>
>();

function parentIndexFor(
	nodesById: Map<string, AutomationNode>
): Map<string, ParentLink> {
	const cached = parentIndexCache.get(nodesById);
	if (cached) return cached;

	const index = new Map<string, ParentLink>();
	// First writer wins, matching the linear scan this replaces: a malformed
	// stored graph with a multi-parented node resolves to the same parent it
	// did before (writes reject those, but legacy rows may predate the check).
	const link = (childId: string | undefined, parent: AutomationNode, via: ParentLink["via"]) => {
		if (childId && !index.has(childId)) index.set(childId, { parent, via });
	};
	for (const candidate of nodesById.values()) {
		link(candidate.bodyStartNodeId, candidate, "body");
		link(candidate.mergeNodeId, candidate, "merge");
		link(candidate.elseNodeId, candidate, "branch");
		// A condition's nextNodeId IS its true branch; every other node's
		// nextNodeId is a plain chain link.
		link(
			candidate.nextNodeId,
			candidate,
			candidate.type === "condition" ? "branch" : "next"
		);
	}

	parentIndexCache.set(nodesById, index);
	return index;
}

function mergeContinuationFor(
	nodesById: Map<string, AutomationNode>,
	nodeId: string
): string | undefined {
	const parents = parentIndexFor(nodesById);
	let currentId = nodeId;
	const seen = new Set<string>();
	while (!seen.has(currentId)) {
		seen.add(currentId);
		const link = parents.get(currentId);
		if (!link) return undefined;
		const { parent, via } = link;
		if (via === "body") return undefined;
		if (via === "branch" && parent.type === "condition" && parent.mergeNodeId) {
			return parent.mergeNodeId;
		}
		currentId = parent.id;
	}
	return undefined;
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

		// Mark the start of this node so pushEntry can stamp its duration.
		env.nodeStartedAt = Date.now();
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
			if (fetched.output.truncated) env.dataTruncated = true;
			pushEntry(env, {
				nodeId: node.id,
				result: "success",
				recordsProcessed: fetched.output.count,
				truncated: fetched.output.truncated,
			});
			currentNodeId =
				node.nextNodeId ?? mergeContinuationFor(env.nodesById, node.id);
			continue;
		}

		if (config?.kind === "aggregate") {
			const result = runAggregateNode(env, node.id, config);
			if (!result.ok) {
				pushEntry(env, {
					nodeId: node.id,
					result: "failed",
					error: result.error,
				});
				return { kind: "failed", error: result.error };
			}
			if (result.truncated) env.dataTruncated = true;
			pushEntry(env, {
				nodeId: node.id,
				result: "success",
				output: { result: result.value },
				truncated: result.truncated,
			});
			currentNodeId =
				node.nextNodeId ?? mergeContinuationFor(env.nodesById, node.id);
			continue;
		}

		if (config?.kind === "adjust_time") {
			const result = runAdjustTimeNode(env.scope, node.id, config);
			if (!result.ok) {
				pushEntry(env, {
					nodeId: node.id,
					result: "failed",
					error: result.error,
				});
				return { kind: "failed", error: result.error };
			}
			pushEntry(env, {
				nodeId: node.id,
				result: "success",
				output: { result: result.value },
			});
			currentNodeId =
				node.nextNodeId ?? mergeContinuationFor(env.nodesById, node.id);
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
			currentNodeId =
				node.nextNodeId ?? mergeContinuationFor(env.nodesById, node.id);
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
			const delayNextNodeId =
				node.nextNodeId ?? mergeContinuationFor(env.nodesById, node.id);
			// Nothing to wait for: already due, or no downstream steps.
			if (resume.resumeAt <= Date.now() || !delayNextNodeId) {
				currentNodeId = delayNextNodeId;
				continue;
			}
			await ctx.db.patch(env.executionId, {
				nodesExecuted: env.nodesExecuted,
				dataTruncated: env.dataTruncated,
				loopSummary: loopSummaryPatch(env),
				currentNodeId: delayNextNodeId,
				resumeState: {
					resumeNodeId: delayNextNodeId,
					resumeAt: resume.resumeAt,
					// Parked-at timestamp; resume adds (now - checkpointAt) to pausedMs.
					checkpointAt: Date.now(),
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
					nodeResults: collectNodeResults(env.scope),
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

		if (config?.kind === "next_item") {
			// Save-time validation rejects next_item outside loops; guard anyway
			// for legacy/direct-API rows.
			if (!inLoopNodeId) {
				const error = '"Next item" only works inside a loop';
				pushEntry(env, { nodeId: node.id, result: "failed", error });
				return { kind: "failed", error };
			}
			pushEntry(env, { nodeId: node.id, result: "success" });
			return { kind: "next_item" };
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
				? ((result.conditionMet ? node.nextNodeId : node.elseNodeId) ??
					node.mergeNodeId ??
					mergeContinuationFor(env.nodesById, node.id))
				: (node.nextNodeId ?? mergeContinuationFor(env.nodesById, node.id));
	}

	return { kind: "chain_done" };
}

/**
 * Run a loop node: iterate the source fetch output, walking the body chain
 * once per item with that item as the scope record and loop.<id>.item/.index
 * variables in scope.
 */
/**
 * Iterations executed per mutation. Longer loops checkpoint into resumeState
 * and continue in a scheduled follow-up mutation: each chunk's writes commit
 * with its own transaction (commit-per-chunk), so a failure in a later chunk
 * keeps earlier chunks' effects.
 */
const LOOP_CHUNK_SIZE = 25;

type LoopResumeState = { nextIndex: number; remainingItemIds: string[] };

async function runLoopNode(
	ctx: MutationCtx,
	env: WalkEnv,
	node: AutomationNode,
	config: Extract<WorkflowNodeConfig, { kind: "loop" }>,
	resumeFrom?: LoopResumeState
): Promise<WalkOutcome> {
	const source = env.fetchOutputs[config.sourceNodeId];
	if (!source) {
		const error =
			'Loops need a "Find records" step to run earlier in the workflow';
		pushEntry(env, { nodeId: node.id, result: "failed", error });
		return { kind: "failed", error };
	}

	const summary = loopSummaryFor(env, node.id);

	let queue: { item: Record<string, unknown>; index: number }[];
	if (resumeFrom) {
		// Continue a chunked run. Items are matched by id so records deleted
		// between chunks are skipped without shifting which items remain, and
		// indexes keep their original positions so loop.<id>.index is stable.
		const byId = new Map(source.records.map((r) => [String(r._id), r]));
		queue = resumeFrom.remainingItemIds.flatMap((id, offset) => {
			const item = byId.get(id);
			return item ? [{ item, index: resumeFrom.nextIndex + offset }] : [];
		});
		// Records deleted since the last chunk. They count against `total`, so
		// without this succeeded + failed + skipped wouldn't add up and
		// "updated 12 of 50" would be a lie.
		summary.skipped += resumeFrom.remainingItemIds.length - queue.length;
	} else {
		const cap = Math.min(
			config.maxIterations ?? MAX_LOOP_ITERATIONS,
			MAX_LOOP_ITERATIONS
		);
		const items = source.records.slice(0, Math.max(cap, 0));
		if (source.truncated) env.dataTruncated = true;
		summary.total = items.length;
		// Logged once for the whole loop; continuation chunks don't re-log it.
		pushEntry(env, {
			nodeId: node.id,
			result: "success",
			recordsProcessed: items.length,
			truncated: source.truncated,
		});
		queue = items.map((item, index) => ({ item, index }));
	}

	if (!node.bodyStartNodeId || queue.length === 0) {
		return { kind: "chain_done" };
	}

	// Absent means "abort": every snapshot published before onItemError existed
	// stopped the whole run at the first failing item, and republishing an
	// untouched loop must not quietly change that.
	const continueOnItemError = config.onItemError === "continue";

	env.scope.loops ??= {};
	try {
		for (let qi = 0; qi < queue.length; qi++) {
			if (qi >= LOOP_CHUNK_SIZE) {
				const remaining = queue.slice(qi);
				await checkpointLoopChunk(ctx, env, node, {
					nextIndex: remaining[0].index,
					remainingItemIds: remaining.map((q) => String(q.item._id)),
				});
				return { kind: "waiting" };
			}
			const { item, index } = queue[qi];
			const itemId = String(item._id);
			const label = sampleRecordLabel(source.objectType, item);
			// summary.total is the authoritative loop size (set on the first chunk,
			// restored on resume) so loop.<id>.count is stable across chunk boundaries.
			env.scope.loops[node.id] = { item, index, count: summary.total };
			env.currentLoop = { nodeId: node.id, index, itemId, label };
			const itemScope: ScopeRecord = {
				type: source.objectType,
				id: itemId,
				record: item,
			};

			// Items processed across every chunk so far — the log window and the
			// compaction boundary are global to the loop, not per chunk.
			const processedBefore = summary.succeeded + summary.failed;
			const withinLogWindow = processedBefore < LOOP_LOG_FULL_ITERATIONS;
			const entryMark = env.nodesExecuted.length;

			let outcome: WalkOutcome;
			try {
				outcome = await runWalk(
					ctx,
					env,
					node.bodyStartNodeId,
					itemScope,
					node.id
				);
			} catch (error) {
				// An unexpected throw (a schema-validation reject, a plan-limit
				// throw) is this item's failure, not the run's — unless the
				// transaction itself is spent, in which case every remaining item
				// would hit it too.
				if (!continueOnItemError || isFatalExecutionError(error)) throw error;
				outcome = {
					kind: "failed",
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}

			if (outcome.kind === "waiting") {
				// Unreachable: delays are rejected inside loop bodies.
				return {
					kind: "failed",
					error: "Delay steps are not supported inside loops",
				};
			}

			if (outcome.kind === "failed") {
				summary.failed += 1;
				if (!continueOnItemError) {
					// Record the item that stopped the run before bailing: the failed
					// patch persists this, so the run can name the record it died on.
					summary.errors.push({
						index,
						itemId,
						label,
						error: outcome.error.slice(0, MAX_ITEM_ERROR_CHARS),
					});
					return outcome;
				}

				if (summary.errors.length < MAX_LOOP_ITEM_ERRORS) {
					summary.errors.push({
						index,
						itemId,
						label,
						error: outcome.error.slice(0, MAX_ITEM_ERROR_CHARS),
						// Convex has no sub-transaction: body steps that already ran
						// for this item are committed and stay applied. Only actions
						// write, so a condition that passed before the failure doesn't
						// make the item partially applied.
						partial: env.nodesExecuted
							.slice(entryMark)
							.some(
								(e) =>
									e.result === "success" &&
									env.nodesById.get(e.nodeId)?.config?.kind === "action"
							),
					});
				}

				// Nothing has succeeded and the first N items all failed: this is a
				// broken configuration, not bad data. Stop before it burns through
				// the rest of the records.
				if (
					summary.succeeded === 0 &&
					summary.failed >= LOOP_FAILURE_CIRCUIT_BREAK
				) {
					return {
						kind: "failed",
						error:
							`The first ${summary.failed} items all failed, so this looks like a ` +
							`configuration problem rather than bad data. First error: ` +
							`${summary.errors[0]?.error ?? outcome.error}`,
					};
				}
				continue;
			}

			// "next_item" and "chain_done" both mean this item is done with.
			summary.succeeded += 1;

			// An End step inside the body stops the whole run, by design. Keep its
			// entries whatever the log window says — they're where the run stopped.
			if (outcome.kind === "ended") return outcome;

			// Past the log window a successful iteration leaves no per-step trace —
			// its outcome is already counted above, and keeping it would push the
			// failures that follow out past MAX_EXECUTED_ENTRIES.
			if (!withinLogWindow) {
				rollbackEntries(env, entryMark);
			}
		}
	} finally {
		// Loop variables are only valid inside the body.
		delete env.scope.loops[node.id];
		env.currentLoop = undefined;
	}

	// Reached only when the last chunk drains the queue, so this lands once per
	// loop however many chunks it took — and regardless of whether the item that
	// crossed the boundary succeeded. Says why the log stops short of the tally,
	// which otherwise just looks like missing steps.
	if (summary.succeeded + summary.failed > LOOP_LOG_FULL_ITERATIONS) {
		pushEntry(env, {
			nodeId: node.id,
			result: "success",
			output: {
				note:
					`Step-by-step log covers the first ${LOOP_LOG_FULL_ITERATIONS} items. ` +
					`Later items are counted in this loop's totals; failures are logged in full.`,
			},
		});
	}

	return { kind: "chain_done" };
}

/**
 * Park a chunked loop mid-run and schedule the next chunk immediately.
 * Mirrors the delay checkpoint: fetch outputs persist as record ids and are
 * re-resolved on resume.
 */
async function checkpointLoopChunk(
	ctx: MutationCtx,
	env: WalkEnv,
	node: AutomationNode,
	loop: LoopResumeState
): Promise<void> {
	const now = Date.now();
	await ctx.db.patch(env.executionId, {
		nodesExecuted: env.nodesExecuted,
		dataTruncated: env.dataTruncated,
		loopSummary: loopSummaryPatch(env),
		currentNodeId: node.id,
		resumeState: {
			resumeNodeId: node.id,
			resumeAt: now,
			checkpointAt: now,
			eventOldValue: env.scope.trigger?.event?.oldValue as string | undefined,
			eventNewValue: env.scope.trigger?.event?.newValue as string | undefined,
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
			nodeResults: collectNodeResults(env.scope),
			loop: { nodeId: node.id, ...loop },
		},
	});
	await ctx.scheduler.runAfter(
		0,
		internal.automationExecutor.resumeExecution,
		{
			orgId: env.orgId,
			executionId: env.executionId,
			automationId: env.automation._id,
		}
	);
}

/** Rows fetched per index page while scanning for matches. */
const FETCH_SCAN_BATCH = 500;
/**
 * Shared scan budget across every fetch in one walk, so multi-fetch workflows
 * stay under Convex's per-transaction read limits (32k docs / 16 MiB).
 */
const WALK_SCAN_BUDGET = 10_000;

type OrgRow = Record<string, unknown> & { _creationTime: number };

/**
 * One page of an org's rows from the by_org index, newest first, starting
 * strictly after the `before` cursor (a _creationTime; Convex appends
 * _creationTime to every index as the unique final tiebreaker, so it is a
 * stable pagination cursor).
 */
async function takeOrgPage(
	ctx: { db: QueryCtx["db"] },
	objectType: ObjectType,
	orgId: Id<"organizations">,
	before: number | undefined,
	count: number
): Promise<OrgRow[]> {
	switch (objectType) {
		case "client":
			return await ctx.db
				.query("clients")
				.withIndex("by_org", (q) => {
					const r = q.eq("orgId", orgId);
					return before === undefined ? r : r.lt("_creationTime", before);
				})
				.order("desc")
				.take(count);
		case "project":
			return await ctx.db
				.query("projects")
				.withIndex("by_org", (q) => {
					const r = q.eq("orgId", orgId);
					return before === undefined ? r : r.lt("_creationTime", before);
				})
				.order("desc")
				.take(count);
		case "quote":
			return await ctx.db
				.query("quotes")
				.withIndex("by_org", (q) => {
					const r = q.eq("orgId", orgId);
					return before === undefined ? r : r.lt("_creationTime", before);
				})
				.order("desc")
				.take(count);
		case "invoice":
			return await ctx.db
				.query("invoices")
				.withIndex("by_org", (q) => {
					const r = q.eq("orgId", orgId);
					return before === undefined ? r : r.lt("_creationTime", before);
				})
				.order("desc")
				.take(count);
		case "task":
			return await ctx.db
				.query("tasks")
				.withIndex("by_org", (q) => {
					const r = q.eq("orgId", orgId);
					return before === undefined ? r : r.lt("_creationTime", before);
				})
				.order("desc")
				.take(count);
		default: {
			const _exhaustive: never = objectType;
			return _exhaustive;
		}
	}
}

/**
 * Paginated org-scoped index scan (newest first) with in-scan filtering.
 * Stops when `stopAfterMatches` rows pass `predicate` (early exit, not
 * truncation), when the index is exhausted (not truncation), or at `maxScan`
 * scanned rows. `truncated` is true only in the last case and only when rows
 * genuinely remain past the cursor — an org with exactly `maxScan` rows is
 * not truncated.
 *
 * Exported for tests.
 */
export async function scanOrgRows(
	ctx: { db: QueryCtx["db"] },
	objectType: ObjectType,
	orgId: Id<"organizations">,
	opts: {
		predicate?: (row: Record<string, unknown>) => boolean;
		stopAfterMatches?: number;
		maxScan?: number;
		batchSize?: number;
	} = {}
): Promise<{
	matches: Record<string, unknown>[];
	scanned: number;
	truncated: boolean;
}> {
	const predicate = opts.predicate ?? (() => true);
	const maxScan = opts.maxScan ?? FETCH_SCAN_CEILING;
	const batchSize = Math.max(opts.batchSize ?? FETCH_SCAN_BATCH, 1);
	const matches: Record<string, unknown>[] = [];
	let scanned = 0;
	let cursor: number | undefined;

	while (scanned < maxScan) {
		const pageSize = Math.min(batchSize, maxScan - scanned);
		const page = await takeOrgPage(ctx, objectType, orgId, cursor, pageSize);
		if (page.length > 0) cursor = page[page.length - 1]._creationTime;
		scanned += page.length;
		for (const row of page) {
			if (!predicate(row)) continue;
			matches.push(row);
			if (
				opts.stopAfterMatches !== undefined &&
				matches.length >= opts.stopAfterMatches
			) {
				return { matches, scanned, truncated: false };
			}
		}
		if (page.length < pageSize) {
			// Index exhausted — every org row was considered.
			return { matches, scanned, truncated: false };
		}
	}

	// Hit the scan cap. Truncated only if rows actually remain past it.
	const probe = await takeOrgPage(ctx, objectType, orgId, cursor, 1);
	return { matches, scanned, truncated: probe.length > 0 };
}

/** The subset of walk state fetch_records needs; shared by real + dry walks. */
type FetchEnv = Pick<
	WalkEnv,
	"orgId" | "scope" | "fetchOutputs" | "fetchScanBudget"
>;

/**
 * Run a fetch_records node: paginated org-scoped index scan (newest first),
 * filter groups combined with AND applied per page, optional sort, then
 * limit. Output is stored for downstream loops and exposed as node.<id>.count.
 */
async function runFetchNode(
	ctx: MutationCtx,
	env: FetchEnv,
	nodeId: string,
	config: Extract<WorkflowNodeConfig, { kind: "fetch_records" }>
): Promise<{ ok: true; output: FetchOutput } | { ok: false; error: string }> {
	try {
		const limit = Math.min(
			Math.max(config.limit ?? DEFAULT_FETCH_LIMIT, 1),
			MAX_FETCH_LIMIT
		);
		const { matches, scanned, truncated } = await scanOrgRows(
			ctx,
			config.objectType,
			env.orgId,
			{
				predicate: (row) =>
					evaluateConditionGroups("and", config.filters, row, env.scope),
				// Sorting needs every match in range; without one, rows already
				// arrive newest-first so the scan can stop at the node's limit.
				stopAfterMatches: config.sortBy ? undefined : limit,
				maxScan: Math.min(FETCH_SCAN_CEILING, Math.max(env.fetchScanBudget, 0)),
			}
		);
		env.fetchScanBudget -= scanned;
		let records = matches;

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

		records = records.slice(0, limit);

		const output: FetchOutput = {
			objectType: config.objectType,
			records,
			count: records.length,
			truncated,
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

/**
 * Aggregate a fetched collection's numeric field. Sums/averages are computed in
 * integer cents to keep currency math exact. Writes node.<id>.result. Read-only
 * (shared by the real walk and the dry test run).
 */
function runAggregateNode(
	env: Pick<WalkEnv, "scope" | "fetchOutputs">,
	nodeId: string,
	config: Extract<WorkflowNodeConfig, { kind: "aggregate" }>
):
	| { ok: true; value: number | null; truncated: boolean }
	| { ok: false; error: string } {
	const source = env.fetchOutputs[config.sourceNodeId];
	if (!source) {
		return {
			ok: false,
			error: 'Aggregate needs a "Find records" step earlier in the workflow',
		};
	}
	const nums: number[] = [];
	for (const record of source.records) {
		// Exclude missing data uniformly: Number(null)/Number("") are 0, which
		// would skew min/avg/max — treat null/"" like an absent field.
		const raw = record[config.field];
		if (raw == null || raw === "") continue;
		const n = Number(raw);
		if (!Number.isNaN(n)) nums.push(n);
	}
	let value: number | null;
	if (nums.length === 0) {
		// No matching records: an empty sum is genuinely 0, but min/max/avg have
		// no value to report — return null ("no data") so it stays distinct from
		// a real 0.
		value = config.op === "sum" ? 0 : null;
	} else if (config.op === "sum" || config.op === "avg") {
		const sum = sumMoney(nums);
		value = config.op === "sum" ? sum : roundCents(sum / nums.length);
	} else if (config.op === "min") {
		value = Math.min(...nums);
	} else {
		value = Math.max(...nums);
	}
	env.scope.nodes ??= {};
	env.scope.nodes[nodeId] = { ...env.scope.nodes[nodeId], result: value };
	return { ok: true, value, truncated: source.truncated };
}

/**
 * Shift a base timestamp by a fixed offset. Writes node.<id>.result (epoch ms).
 * Read-only; shared by the real walk and the dry test run.
 */
function runAdjustTimeNode(
	scope: VariableScope,
	nodeId: string,
	config: Extract<WorkflowNodeConfig, { kind: "adjust_time" }>
): { ok: true; value: number } | { ok: false; error: string } {
	const baseMs = toEpochMs(resolveValueRef(config.base, scope));
	if (Number.isNaN(baseMs)) {
		return {
			ok: false,
			error: "Adjust time: the base value isn't a valid date",
		};
	}
	const sign = config.direction === "subtract" ? -1 : 1;
	const value =
		baseMs + sign * config.amount * ADJUST_TIME_UNIT_MS[config.unit];
	scope.nodes ??= {};
	scope.nodes[nodeId] = { ...scope.nodes[nodeId], result: value };
	return { ok: true, value };
}

/** Numeric node.<id>.result outputs, persisted so they survive a delay resume. */
function collectNodeResults(
	scope: VariableScope
): { nodeId: string; result: number }[] {
	const out: { nodeId: string; result: number }[] = [];
	for (const [nodeId, val] of Object.entries(scope.nodes ?? {})) {
		if (typeof val.result === "number") {
			out.push({ nodeId, result: val.result });
		}
	}
	return out;
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

	const resumeAt = toEpochMs(resolveValueRef(config.until, scope));
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
	ctx: { db: QueryCtx["db"] },
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
 * Execute a per-record node (condition/action) via its v2 `config`.
 * Structural kinds (fetch/loop/delay/end) are handled by the walk engine
 * before this is reached.
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
	return executeNodeV2(ctx, node.config, scopeRecord, env);
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
		case "aggregate":
		case "adjust_time":
		case "delay":
		case "delay_until":
		case "end":
		case "next_item":
			// Structural/compute kinds are consumed by runWalk before executeNode.
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
 * Apply a status update to a resolved target: validate the status, patch the
 * record (with completion/approval/paid timestamps), maintain aggregates in
 * the same transaction, and emit a cascading status_changed event carrying
 * the execution chain for recursion protection.
 *
 * Used by the v2 update_field action when `field === "status"`.
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
			// Create correlation ID that includes chain info for the event bus.
			// Date.now() is frozen within a Convex transaction, so a per-module
			// counter keeps IDs unique when one run emits several cascade events.
			const correlationId = nextCascadeCorrelationId(executionChain);

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
 * Coerce a resolved ValueRef into the field's registry type before writing.
 * `select` values are validated against the field's option list (static
 * values are already checked at save time; this guards dynamic var refs).
 */
function coerceFieldValue(
	fieldDef: FieldDefinition,
	raw: unknown,
	/** Run timezone — decides which calendar day an instant falls on. */
	tz: string
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
			const n =
				raw instanceof Date
					? raw.getTime()
					: typeof raw === "number"
						? raw
						: Date.parse(String(raw));
			if (Number.isNaN(n)) {
				return {
					ok: false,
					error: `"${String(raw)}" is not a valid date for field "${fieldDef.key}"`,
				};
			}
			// Every WRITABLE date field is a calendar date (the instants — paidAt,
			// sentAt, approvedAt, ... — are all writable:false), and calendar dates
			// are stored at UTC midnight. Normalizing here is the chokepoint that
			// keeps a formula which produced an instant (e.g. ADDDAYS(NOW(), 3))
			// from writing one into a date field, where it would be misread as an
			// instant from then on.
			return { ok: true, value: calendarDayEpoch(n, tz) };
		}
		case "id": {
			// An array-valued source (project.assignedUserIds) feeding a
			// single-id destination (task.assigneeUserId) takes the first
			// element; empty means "not supplied", not the string "".
			// Without this, String(raw) yields "u1,u2" and FK resolution fails.
			if (Array.isArray(raw)) {
				if (raw.length === 0) return { ok: true, value: null };
				const [first] = raw;
				if (first === undefined || first === null) {
					return { ok: true, value: null };
				}
				return { ok: true, value: String(first) };
			}
			return { ok: true, value: String(raw) };
		}
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
			// Legacy single-field variant: same engine as update_fields, one row.
			return executeUpdateFieldsAction(
				ctx,
				action.target,
				[{ field: action.field, value: action.value }],
				scopeRecord,
				env
			);
		case "update_fields":
			return executeUpdateFieldsAction(
				ctx,
				action.target,
				action.fields,
				scopeRecord,
				env
			);
		case "create_task":
			return executeCreateTaskAction(ctx, action, scopeRecord, env);
		case "create_record":
			return executeCreateRecordAction(ctx, action, scopeRecord, env);
		case "send_notification":
			return executeSendNotificationAction(ctx, action, scopeRecord, env);
		case "send_team_message":
			return executeSendTeamMessageAction(ctx, action, scopeRecord, env);
		default: {
			const _exhaustive: never = action;
			return _exhaustive;
		}
	}
}

/**
 * Shared engine behind update_field / update_fields. Every row is validated
 * and coerced BEFORE the first write so a bad row can't leave a half-updated
 * record. Non-status fields land in one ctx.db.patch and emit one
 * record_updated — changedFields carries the full set, and field/oldValue/
 * newValue are included only when exactly one field changed, so a one-row
 * action emits the same event a legacy update_field always did. A status row
 * goes through applyStatusUpdate's validation + aggregate + cascade flow,
 * exactly once, after the field patch.
 */
async function executeUpdateFieldsAction(
	ctx: MutationCtx,
	target: ActionTarget,
	fields: Array<{ field: string; value: ValueRef }>,
	scopeRecord: ScopeRecord | undefined,
	env: WalkEnv
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
	if (!scopeRecord) {
		return { success: false, error: NO_SCOPE_RECORD_ERROR };
	}
	const { type: objectType, id: objectId, record: triggerObject } = scopeRecord;
	const { orgId, executionChain, recursionDepth } = env;

	const targetInfo = await resolveTargetV2(
		ctx,
		target,
		objectType,
		objectId,
		triggerObject,
		orgId
	);

	if (!targetInfo) {
		// Target not found - skip this action (e.g., task has no client)
		console.warn(
			`[AutomationExecutor] Target not found: target=${JSON.stringify(target)}, objectType=${objectType}, objectId=${objectId}`
		);
		return { success: true, skipped: true };
	}

	if (fields.length === 0) {
		return { success: false, error: "No fields to update" };
	}

	const writes: Array<{ field: string; value: unknown }> = [];
	const seen = new Set<string>();
	for (const { field, value } of fields) {
		if (seen.has(field)) {
			return {
				success: false,
				error: `Field "${field}" appears more than once`,
			};
		}
		seen.add(field);

		const fieldDef = getFieldDefinition(targetInfo.type, field);
		if (!fieldDef) {
			return {
				success: false,
				error: `Unknown field "${field}" for ${targetInfo.type}`,
			};
		}
		if (!fieldDef.writable) {
			return {
				success: false,
				error: `Field "${field}" is not writable${
					fieldDef.writeExclusionReason ? `: ${fieldDef.writeExclusionReason}` : ""
				}`,
			};
		}

		const rawValue = resolveValueRef(value, env.scope);
		const coerced = coerceFieldValue(
			fieldDef,
			rawValue,
			env.scope.workflow?.tz ?? "UTC"
		);
		if (!coerced.ok) {
			return { success: false, error: coerced.error };
		}
		writes.push({ field, value: coerced.value });
	}

	// Status is fully special-cased below; validate it up front — after the
	// non-status patch commits it would be too late to fail atomically.
	const statusWrite = writes.find((w) => w.field === "status");
	if (statusWrite) {
		if (typeof statusWrite.value !== "string") {
			return {
				success: false,
				error: `Status value for ${targetInfo.type} must be a string`,
			};
		}
		if (!isValidStatus(targetInfo.type, statusWrite.value)) {
			return {
				success: false,
				error: `Invalid status "${statusWrite.value}" for ${targetInfo.type}`,
			};
		}
	}
	const fieldWrites = writes.filter((w) => w.field !== "status");

	if (fieldWrites.length > 0) {
		const targetObject = await getObject(
			ctx,
			targetInfo.type,
			targetInfo.id,
			orgId
		);
		if (!targetObject) {
			return { success: false, error: "Target object not found" };
		}

		try {
			const updatePayload: Record<string, any> = {};
			const changed: Array<{
				field: string;
				oldValue: unknown;
				newValue: unknown;
			}> = [];
			for (const write of fieldWrites) {
				updatePayload[write.field] = write.value;
				const previousValue = (targetObject as Record<string, unknown>)[
					write.field
				];
				if (previousValue !== write.value) {
					changed.push({
						field: write.field,
						oldValue: previousValue,
						newValue: write.value,
					});
				}
			}
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

			// Emit record_updated so automations chained on these fields actually
			// fire (a status row emits its own event via applyStatusUpdate below).
			// The chain rides in metadata — the emitRecordUpdatedEvent helper would
			// drop it and defeat the recursion guard. One event per action, so a
			// trigger watching any of the changed fields fires exactly once.
			if (changed.length > 0) {
				const single = changed.length === 1 ? changed[0] : undefined;
				await ctx.db.insert("domainEvents", {
					orgId,
					eventType: "entity.record_updated",
					eventSource: "automationExecutor.executeActionNodeV2",
					payload: {
						entityType: targetInfo.type,
						entityId: targetInfo.id,
						...(single
							? {
									field: single.field,
									oldValue: single.oldValue,
									newValue: single.newValue,
								}
							: {}),
						metadata: {
							changedFields: changed.map((c) => c.field),
							executionChain,
							recursionDepth,
							isCascade: true,
						},
					},
					status: "pending",
					correlationId: nextCascadeCorrelationId(executionChain),
					createdAt: Date.now(),
					attemptCount: 0,
				});
				await ctx.scheduler.runAfter(0, internal.eventBus.processEvents, {});
			}
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to update field",
			};
		}
	}

	// Status writes reuse the existing validation + aggregate + cascade flow.
	if (statusWrite) {
		return applyStatusUpdate(
			ctx,
			targetInfo,
			statusWrite.value as string,
			orgId,
			executionChain,
			recursionDepth
		);
	}

	return { success: true };
}

/**
 * Resolve a v2 action target: "self" is the record in scope; `{ related }`
 * follows the field-registry relation FK for the record's object type,
 * falling back to resolving a client indirectly via the record's project
 * when there's no direct clientId.
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

	// Resolve client indirectly via the record's project when there's no
	// direct clientId.
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
		// No acting user — createdByUserId left unset (automation-created).
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
				correlationId: nextCascadeCorrelationId(env.executionChain),
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

// ---------------------------------------------------------------------------
// create_record: generic record creation (client / project / task)
// ---------------------------------------------------------------------------

/**
 * Resolve a supplied FK value on a create_record field against the org. The
 * executor runs unscoped, so an arbitrary id string must be checked before it
 * becomes a stored relationship (cross-tenant or garbage ids are rejected).
 */
async function resolveCreateFk(
	ctx: MutationCtx,
	refType: NonNullable<FieldDefinition["refType"]>,
	rawId: unknown,
	orgId: Id<"organizations">
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	const raw = String(rawId);
	const table = {
		user: "users",
		client: "clients",
		project: "projects",
		quote: "quotes",
	}[refType] as "users" | "clients" | "projects" | "quotes";
	const normalized = ctx.db.normalizeId(table, raw);
	if (!normalized) {
		return { ok: false, error: `Referenced ${refType} is not a valid id` };
	}
	if (refType === "user") {
		const membership = await getMembership(
			ctx,
			normalized as Id<"users">,
			orgId
		);
		if (!membership) {
			return {
				ok: false,
				error: "Assignee is not a member of this organization",
			};
		}
		return { ok: true, id: normalized };
	}
	const doc = await ctx.db.get(
		normalized as Id<"clients"> | Id<"projects"> | Id<"quotes">
	);
	if (!doc || doc.orgId !== orgId) {
		return { ok: false, error: `Referenced ${refType} was not found` };
	}
	return { ok: true, id: normalized };
}

/**
 * Schema-required fields that have a sensible code default (so they are NOT
 * requiredOnCreate). Applied only when the user didn't supply the field.
 */
function applyCreateDefaults(
	objectType: AutomationObjectType,
	payload: Record<string, unknown>,
	supplied: Set<string>,
	tz: string
): void {
	const setDefault = (key: string, value: unknown) => {
		if (!supplied.has(key)) {
			payload[key] = value;
			supplied.add(key);
		}
	};
	switch (objectType) {
		case "client":
			setDefault("status", "lead");
			break;
		case "project":
			setDefault("status", "planned");
			setDefault("projectType", "one-off");
			break;
		case "task":
			setDefault("status", "pending");
			setDefault("type", "internal");
			setDefault("date", calendarDayEpoch(Date.now(), tz));
			break;
	}
}

/**
 * Free-plan cap check for a create_record. Returns an error string when the
 * insert would exceed a ceiling, or null when it's allowed. Reads only.
 */
async function checkCreateRecordPlanCap(
	ctx: MutationCtx,
	objectType: AutomationObjectType,
	payload: Record<string, unknown>,
	orgId: Id<"organizations">
): Promise<string | null> {
	if (objectType === "client" && (payload.status as string | undefined) !== "archived") {
		const clients = await ctx.db
			.query("clients")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		const active = clients.filter((c) => c.status !== "archived").length;
		if (active >= FREE_MAX_CLIENTS) {
			return `Your plan is limited to ${FREE_MAX_CLIENTS} clients — upgrade to add more.`;
		}
	}
	if (objectType === "project") {
		// Only an active candidate (planned/in-progress) consumes a per-client slot.
		const status = payload.status as string | undefined;
		const projectActive = status === "planned" || status === "in-progress";
		const clientId = payload.clientId as Id<"clients"> | undefined;
		if (clientId && projectActive) {
			const projects = await ctx.db
				.query("projects")
				.withIndex("by_client", (q) => q.eq("clientId", clientId))
				.collect();
			const active = projects.filter(
				(p) => p.status === "planned" || p.status === "in-progress"
			).length;
			if (active >= FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT) {
				return `Your plan allows ${FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT} active projects per client — upgrade to add more.`;
			}
		}
	}
	return null;
}

/**
 * Validate + assemble the insert payload for a create_record action. Shared by
 * the real executor and the dry mirror, so a test run surfaces the exact same
 * failures (missing required field, bad FK, unsupported field) the run would.
 * Reads only — never writes. `orgId` is included; `portalAccessId` is added at
 * insert time (it's generated, not a user field).
 */
async function buildCreateRecordPayload(
	ctx: MutationCtx,
	action: Extract<AutomationAction, { type: "create_record" }>,
	scopeRecord: ScopeRecord | undefined,
	env: { orgId: Id<"organizations">; scope: VariableScope }
): Promise<
	| { ok: true; payload: Record<string, unknown> }
	| { ok: false; error: string }
> {
	const objectType = action.objectType;
	const tz = env.scope.workflow?.tz ?? "UTC";
	const payload: Record<string, unknown> = { orgId: env.orgId };
	const supplied = new Set<string>();

	// linkToScope: set the new record's FK to the record in scope via the
	// registry relation map (e.g. a project created off a client gets clientId).
	let linkedFk: string | undefined;
	if (action.linkToScope) {
		if (!scopeRecord) {
			return {
				ok: false,
				error: `There is no record in scope to link this new ${objectType} to`,
			};
		}
		linkedFk = RELATION_FIELD[objectType]?.[scopeRecord.type];
		if (!linkedFk) {
			return {
				ok: false,
				error: `A new ${objectType} can't be linked to a ${scopeRecord.type}`,
			};
		}
		payload[linkedFk] = scopeRecord.id;
		supplied.add(linkedFk);
	}

	const seen = new Set<string>();
	for (const { field, value } of action.fields) {
		if (seen.has(field)) {
			return { ok: false, error: `Field "${field}" appears more than once` };
		}
		seen.add(field);
		if (field === linkedFk) {
			return {
				ok: false,
				error: `Field "${field}" is already set by linking to the record in scope`,
			};
		}
		const def = getFieldDefinition(objectType, field);
		if (!def || !def.creatable) {
			return {
				ok: false,
				error: `Field "${field}" can't be set when creating a ${objectType}`,
			};
		}
		const raw = resolveValueRef(value, env.scope);
		const coerced = coerceFieldValue(def, raw, tz);
		if (!coerced.ok) {
			return { ok: false, error: coerced.error };
		}
		// null means "resolved to nothing" — leave it out so requiredOnCreate and
		// defaults still apply (a supplied-but-empty row shouldn't defeat them).
		if (coerced.value === null) continue;
		// A required text field set to a blank/whitespace value doesn't satisfy the
		// requirement — reject instead of marking it supplied.
		if (
			def.requiredOnCreate &&
			def.type === "text" &&
			typeof coerced.value === "string" &&
			coerced.value.trim() === ""
		) {
			return {
				ok: false,
				error: `${def.label} is required to create a ${objectType}`,
			};
		}
		if (def.refType) {
			const fk = await resolveCreateFk(ctx, def.refType, coerced.value, env.orgId);
			if (!fk.ok) return { ok: false, error: fk.error };
			payload[field] = fk.id;
		} else {
			payload[field] = coerced.value;
		}
		supplied.add(field);
	}

	applyCreateDefaults(objectType, payload, supplied, tz);

	for (const def of getRequiredCreateFields(objectType)) {
		if (!supplied.has(def.key)) {
			return {
				ok: false,
				error: `${def.label} is required to create a ${objectType}`,
			};
		}
	}

	// Domain rule mirrored from tasks.ts: an external task must name a client.
	if (
		objectType === "task" &&
		payload.type === "external" &&
		!payload.clientId
	) {
		return { ok: false, error: "External tasks require a client" };
	}

	return { ok: true, payload };
}

async function executeCreateRecordAction(
	ctx: MutationCtx,
	action: Extract<AutomationAction, { type: "create_record" }>,
	scopeRecord: ScopeRecord | undefined,
	env: WalkEnv
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
	const objectType = action.objectType;
	if (!isCreatableObjectType(objectType)) {
		return {
			success: false,
			error: `Creating ${objectType} records from automations isn't supported`,
		};
	}

	const built = await buildCreateRecordPayload(ctx, action, scopeRecord, env);
	if (!built.ok) return { success: false, error: built.error };
	const { payload } = built;

	const org = await ctx.db.get(env.orgId);
	if (!orgHasPremiumPlan(org)) {
		const capError = await checkCreateRecordPlanCap(
			ctx,
			objectType,
			payload,
			env.orgId
		);
		if (capError) return { success: false, error: capError };
	}

	try {
		let newId: Id<"clients"> | Id<"projects"> | Id<"tasks">;
		// No acting user — createdByUserId left unset (automation-created).
		switch (objectType) {
			case "client":
				// Portal links need an access id; the create mutation takes a
				// caller-supplied one for retry-determinism, harmless to mint here.
				payload.portalAccessId = crypto.randomUUID();
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				newId = await ctx.db.insert("clients", payload as any);
				break;
			case "project":
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				newId = await ctx.db.insert("projects", payload as any);
				break;
			case "task":
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				newId = await ctx.db.insert("tasks", payload as any);
				break;
			default:
				return {
					success: false,
					error: `Creating ${objectType} records from automations isn't supported`,
				};
		}

		const doc = await ctx.db.get(newId);
		if (doc) {
			// Attribute the activity to the automation's creator — a scheduled (cron)
			// run has no ambient authenticated user, so createActivity's default
			// getCurrentUserOrThrow would throw and fail the create. If that creator
			// has since left the org, fall back to the org owner.
			const creatorId = env.automation.createdBy;
			const creatorMembership = await getMembership(ctx, creatorId, env.orgId);
			const actor = {
				userId: creatorMembership ? creatorId : (org?.ownerUserId ?? creatorId),
				orgId: env.orgId,
			};
			switch (objectType) {
				case "client":
					await ActivityHelpers.clientCreated(ctx, doc as Doc<"clients">, actor);
					await AggregateHelpers.addClient(ctx, doc as Doc<"clients">);
					break;
				case "project":
					await ActivityHelpers.projectCreated(
						ctx,
						doc as Doc<"projects">,
						actor
					);
					await AggregateHelpers.addProject(ctx, doc as Doc<"projects">);
					break;
				case "task":
					// Tasks have no aggregate.
					await ActivityHelpers.taskCreated(ctx, doc as Doc<"tasks">, actor);
					break;
			}

			// Emit record_created with the execution chain in metadata so cascading
			// automations keep recursion protection (mirrors executeCreateTaskAction).
			await ctx.db.insert("domainEvents", {
				orgId: env.orgId,
				eventType: "entity.record_created",
				eventSource: "automationExecutor.executeCreateRecordAction",
				payload: {
					entityType: objectType,
					entityId: newId,
					metadata: {
						executionChain: env.executionChain,
						recursionDepth: env.recursionDepth,
						isCascade: true,
					},
				},
				status: "pending",
				correlationId: nextCascadeCorrelationId(env.executionChain),
				createdAt: Date.now(),
				attemptCount: 0,
			});
			await ctx.scheduler.runAfter(0, internal.eventBus.processEvents, {});
		}

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to create record",
		};
	}
}

/** List org member user ids, optionally restricted to admins. */
async function resolveMemberUserIds(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	adminsOnly: boolean
): Promise<Id<"users">[]> {
	const memberships = await listMembershipsByOrg(ctx, orgId);
	return memberships
		.filter((m) => (adminsOnly ? isAdminRole(m.role) : true))
		.map((m) => m.userId);
}

/** Window in which an unread failure alert suppresses a duplicate (per admin). */
const AUTOMATION_FAILURE_DEDUPE_MS = 60 * 60 * 1000; // 1 hour
/** Cap on the error text surfaced in a failure notification. */
const FAILURE_MESSAGE_CAP = 1000;

/**
 * Notify each org admin (in-app only) that a PRODUCTION automation run failed.
 * Callers MUST gate on isProduction (mode !== "test" && !dryRun) — this helper
 * does not re-check mode. Never fires for test/dry/skipped/cancelled runs.
 *
 * Light per-recipient dedupe: skip inserting if the admin already has an UNREAD
 * automation_failed alert for this automation within the recent window, so a
 * flapping automation can't spam admins. The automationId rides in entityId as
 * the dedupe key (entityType is left unset — automation isn't an entity-union
 * member — so clicks fall back to actionUrl).
 *
 * Never throws: a notification hiccup must not roll back the caller's terminal
 * failure patch (Convex mutations are all-or-nothing).
 */
async function notifyAutomationFailure(
	ctx: MutationCtx,
	automation: AutomationDoc,
	error: string,
	// Reserved for future per-run deep-linking; the alert links to /automations.
	executionId: Id<"workflowExecutions">
): Promise<void> {
	void executionId;
	try {
		const adminIds = await resolveMemberUserIds(ctx, automation.orgId, true);
		if (adminIds.length === 0) return;

		const body = ((error && error.trim()) || "The automation run failed.").slice(
			0,
			FAILURE_MESSAGE_CAP
		);
		const windowStart = Date.now() - AUTOMATION_FAILURE_DEDUPE_MS;
		const automationIdStr = automation._id as string;

		for (const userId of adminIds) {
			const recentDup = await ctx.db
				.query("notifications")
				.withIndex("by_user_read", (q) =>
					q.eq("userId", userId).eq("isRead", false)
				)
				.order("desc")
				.filter((q) =>
					q.and(
						q.eq(q.field("notificationType"), "automation_failed"),
						q.eq(q.field("entityId"), automationIdStr)
					)
				)
				.first();
			if (recentDup && recentDup._creationTime >= windowStart) continue;

			await ctx.db.insert("notifications", {
				orgId: automation.orgId,
				userId,
				notificationType: "automation_failed",
				title: automation.name,
				message: body,
				entityId: automationIdStr,
				actionUrl: "/automations",
				isRead: false,
				sentVia: "in_app",
				sentAt: Date.now(),
				priority: "high",
			});
		}
	} catch (err) {
		console.error(
			`[AutomationExecutor] notifyAutomationFailure failed for automation ${automation._id}`,
			err
		);
	}
}

function automationActionUrl(scopeRecord: ScopeRecord | undefined): string {
	return scopeRecord ? `/${scopeRecord.type}s/${scopeRecord.id}` : "/home";
}

/** Keep only org members from a list of candidate user ids, deduped. */
async function validOrgMembers(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	ids: (Id<"users"> | undefined)[]
): Promise<Id<"users">[]> {
	const out: Id<"users">[] = [];
	for (const id of ids) {
		if (!id) continue;
		const membership = await getMembership(ctx, id, orgId);
		if (membership) out.push(id);
	}
	return Array.from(new Set(out));
}

/**
 * Resolve a `recordField` recipient: follow the action target (self | related)
 * to a record, then read its user-reference field. `resolved` is false when no
 * target record exists (distinguishes "no record" from "field empty").
 */
async function resolveRecordFieldUsers(
	ctx: MutationCtx,
	target: ActionTarget,
	field: string,
	scopeRecord: ScopeRecord | undefined,
	orgId: Id<"organizations">
): Promise<{
	resolved: boolean;
	users: Id<"users">[];
	targetType: ObjectType | null;
}> {
	if (!scopeRecord) return { resolved: false, users: [], targetType: null };
	const targetInfo = await resolveTargetV2(
		ctx,
		target,
		scopeRecord.type,
		scopeRecord.id,
		scopeRecord.record,
		orgId
	);
	if (!targetInfo) return { resolved: false, users: [], targetType: null };
	const doc = await getObject(ctx, targetInfo.type, targetInfo.id, orgId);
	if (!doc) {
		return { resolved: false, users: [], targetType: targetInfo.type };
	}
	const raw = (doc as Record<string, unknown>)[field];
	const ids: (Id<"users"> | undefined)[] = Array.isArray(raw)
		? (raw as Id<"users">[])
		: typeof raw === "string"
			? [raw as Id<"users">]
			: [];
	return {
		resolved: true,
		users: await validOrgMembers(ctx, orgId, ids),
		targetType: targetInfo.type,
	};
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
	} else if (action.recipient === "all_members") {
		// Org-wide broadcast — same member resolution send_team_message uses.
		userIds = await resolveMemberUserIds(ctx, env.orgId, false);
		if (userIds.length === 0) {
			return { success: true, skipped: true, error: "No members to notify" };
		}
	} else if (typeof action.recipient === "string") {
		// Unknown string recipient (e.g. a legacy "record_owner" config predating
		// its removal) — skip gracefully rather than crash or notify the wrong user.
		return {
			success: true,
			skipped: true,
			error: "Unknown recipient — reconfigure this notification",
		};
	} else if ("recordField" in action.recipient) {
		const { target, field } = action.recipient.recordField;
		const res = await resolveRecordFieldUsers(
			ctx,
			target,
			field,
			scopeRecord,
			env.orgId
		);
		if (!res.resolved) {
			return {
				success: true,
				skipped: true,
				error: "No record in scope for the selected field",
			};
		}
		if (res.users.length === 0) {
			return {
				success: true,
				skipped: true,
				error: "No user found for the selected field",
			};
		}
		userIds = res.users;
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

	// Undefined = legacy in-app-only (bell, no push). Push rides on the persisted
	// bell row, so push-only (no in_app) has no row to reference and the popover
	// can't hide it — skip it until a product decision (see B6-6 report).
	const channels = action.channels ?? ["in_app"];
	if (channels.length === 0) {
		return {
			success: true,
			skipped: true,
			error: "No delivery channels configured",
		};
	}
	const wantInApp = channels.includes("in_app");
	const wantPush = channels.includes("push");
	if (wantPush && !wantInApp) {
		return {
			success: true,
			skipped: true,
			error: "Push-only delivery is not supported yet (needs a bell row)",
		};
	}

	const pushUrl = automationActionUrl(scopeRecord);
	const clerkOrgId = wantPush
		? ((await ctx.db.get(env.orgId))?.clerkOrganizationId ?? "")
		: "";

	try {
		for (const userId of userIds) {
			const notificationId = await ctx.db.insert("notifications", {
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
			if (wantPush) {
				await enqueuePush(ctx, {
					notificationType: "automation_message",
					taggedUserId: userId,
					title: env.automation.name,
					body: message,
					url: pushUrl,
					notificationId,
					orgId: clerkOrgId,
				});
			}
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

/**
 * Resolve a send_team_message mention config to concrete member userIds against
 * the RESOLVED target record. All ids are org-membership-checked and deduped.
 * `none` -> nobody; `user` -> an explicit member; `created_by` -> the target's
 * creator (unset on historical/system rows -> nobody); `assigned_team` -> a
 * project's assigned team (a project target directly, a quote target via its
 * linked project; clients/anything else have no team -> nobody).
 */
async function resolveTeamMessageMention(
	ctx: MutationCtx,
	mention: TeamMessageMention | undefined,
	targetType: ObjectType,
	targetId: string,
	orgId: Id<"organizations">
): Promise<Id<"users">[]> {
	if (!mention || mention.kind === "none") return [];

	if (mention.kind === "user") {
		return validOrgMembers(ctx, orgId, [mention.userId]);
	}

	const doc = await getObject(ctx, targetType, targetId, orgId);
	if (!doc) return [];

	if (mention.kind === "created_by") {
		const creator = (doc as { createdByUserId?: Id<"users"> }).createdByUserId;
		return validOrgMembers(ctx, orgId, [creator]);
	}

	// assigned_team
	if (targetType === "project") {
		const team = (doc as Doc<"projects">).assignedUserIds ?? [];
		return validOrgMembers(ctx, orgId, team);
	}
	if (targetType === "quote") {
		const projectId = (doc as Doc<"quotes">).projectId;
		if (!projectId) return [];
		const project = await getObject(ctx, "project", projectId, orgId);
		if (!project) return [];
		const team = (project as Doc<"projects">).assignedUserIds ?? [];
		return validOrgMembers(ctx, orgId, team);
	}
	// client / anything else has no team.
	return [];
}

/**
 * Resolve send_team_message's legacy `recipients` union (all_members/admins/
 * explicit userIds) to concrete, org-membership-checked userIds. Shared by
 * the production executor and the dry-run preview.
 */
async function resolveTeamMessageRecipients(
	ctx: MutationCtx,
	recipients: Extract<AutomationAction, { type: "send_team_message" }>["recipients"],
	orgId: Id<"organizations">
): Promise<Id<"users">[]> {
	if (recipients === "all_members") {
		return resolveMemberUserIds(ctx, orgId, false);
	}
	if (recipients === "admins") {
		return resolveMemberUserIds(ctx, orgId, true);
	}
	const valid: Id<"users">[] = [];
	for (const raw of recipients.userIds) {
		const userId = raw as Id<"users">;
		const membership = await getMembership(ctx, userId, orgId);
		if (membership) valid.push(userId);
	}
	return valid;
}

async function executeSendTeamMessageAction(
	ctx: MutationCtx,
	action: Extract<AutomationAction, { type: "send_team_message" }>,
	scopeRecord: ScopeRecord | undefined,
	env: WalkEnv
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
	// Broadcast recipients (bell + push), unchanged from the legacy behavior.
	const recipientIds = await resolveTeamMessageRecipients(
		ctx,
		action.recipients,
		env.orgId
	);

	const title =
		interpolateTemplate(action.title, env.scope).trim() ||
		env.automation.name;
	const message = interpolateTemplate(action.message, env.scope).trim();
	if (!message) {
		return { success: false, error: "Message resolved to an empty value" };
	}

	// Resolve the target (default self). Mentions resolve for ANY resolved target
	// so tagged users are notified even on feedless targets (task/invoice) — only
	// the feed POST is limited to client/project/quote.
	let post: { entityType: "client" | "project" | "quote"; entityId: string } | null =
		null;
	let mentionIds: Id<"users">[] = [];
	if (scopeRecord) {
		const targetInfo = await resolveTargetV2(
			ctx,
			action.target ?? "self",
			scopeRecord.type,
			scopeRecord.id,
			scopeRecord.record,
			env.orgId
		);
		if (targetInfo) {
			if (
				targetInfo.type === "client" ||
				targetInfo.type === "project" ||
				targetInfo.type === "quote"
			) {
				post = { entityType: targetInfo.type, entityId: targetInfo.id };
			}
			mentionIds = await resolveTeamMessageMention(
				ctx,
				action.mention,
				targetInfo.type,
				targetInfo.id,
				env.orgId
			);
		}
	}

	// Bell recipients = broadcast recipients ∪ resolved mentions (deduped).
	const bellIds = Array.from(
		new Set<Id<"users">>([...recipientIds, ...mentionIds])
	);

	if (!post && bellIds.length === 0) {
		return { success: true, skipped: true, error: "No recipients to message" };
	}

	const org = await ctx.db.get(env.orgId);
	const clerkOrgId = org?.clerkOrganizationId ?? "";
	const actionUrl = post
		? `/${post.entityType}s/${post.entityId}`
		: automationActionUrl(scopeRecord);

	try {
		if (post) {
			await insertTeamMessage(ctx, {
				orgId: env.orgId,
				entityType: post.entityType,
				entityId: post.entityId,
				message,
				authorType: "automation",
				automationId: env.automation._id,
				mentionedUserIds: mentionIds,
			});
		}
		for (const userId of bellIds) {
			const notificationId = await ctx.db.insert("notifications", {
				orgId: env.orgId,
				userId,
				notificationType: "automation_message",
				title,
				message,
				entityType: post?.entityType ?? scopeRecord?.type,
				entityId: post?.entityId ?? scopeRecord?.id,
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
			// Ran to the end with some loop items skipped — counted apart from
			// `completed` so the buckets still sum to `total`.
			withErrors: recentExecutions.filter(
				(e) => e.status === "completed_with_errors"
			).length,
			failed: recentExecutions.filter((e) => e.status === "failed").length,
			skipped: recentExecutions.filter((e) => e.status === "skipped").length,
		};

		const lastWeek = {
			total: weeklyExecutions.length,
			completed: weeklyExecutions.filter((e) => e.status === "completed")
				.length,
			withErrors: weeklyExecutions.filter(
				(e) => e.status === "completed_with_errors"
			).length,
			failed: weeklyExecutions.filter((e) => e.status === "failed").length,
			skipped: weeklyExecutions.filter((e) => e.status === "skipped").length,
		};

		return { last24h, lastWeek };
	},
});

// ---------------------------------------------------------------------------
// Slice 4: dry-run test mode + manual run
//
// Test runs never write. To stream per-node status to the editor, the whole
// walk is computed up front (reads only) into an ordered `plan`, then revealed
// one entry per transaction via executeTestStep + scheduler.runAfter — a single
// mutation would commit every status at once, so the getExecution subscription
// would never see intermediate states.
// ---------------------------------------------------------------------------

/** Delay between revealed test-run steps (ms) — paces the live per-node chips. */
const TEST_STEP_INTERVAL_MS = 150;
/** Loop iterations sampled per loop in a dry run (keeps the reveal snappy). */
const DRY_LOOP_SAMPLE = 3;

type DryWalkOutcome = "chain_done" | "ended" | "next_item" | "failed";
/** A test run stuck "running" past this is presumed dropped and marked failed. */
const STALE_TEST_RUN_MS = 5 * 60 * 1000;

type DryEnv = {
	orgId: Id<"organizations">;
	automationName: string;
	nodesById: Map<string, AutomationNode>;
	scope: VariableScope;
	fetchOutputs: Record<string, FetchOutput>;
	entries: ExecutedNode[];
	truncated: boolean;
	/** True once any fetch in this dry run stopped before considering every row. */
	dataTruncated: boolean;
	/** Rows this dry run may still scan across all its fetches. */
	fetchScanBudget: number;
	/** Wall-clock start of the node currently executing; stamped onto each entry. */
	nodeStartedAt: number;
	/** Per-loop item tallies, same shape production records. */
	loopSummaries: LoopSummary[];
	/** The loop iteration currently executing; stamps identity onto its entries. */
	currentLoop?: {
		nodeId: string;
		index: number;
		itemId: string;
		label?: string;
	};
};

/** Char ceiling (~4KB) for a stored input/output snapshot. */
const SNAPSHOT_MAX_CHARS = 4096;

/**
 * Bound an input/output snapshot to ~4KB for the runs viewer. Oversized or
 * unserializable values collapse to a truncated marker. Never throws.
 */
function boundSnapshot(value: unknown): unknown {
	if (value === undefined) return undefined;
	try {
		const json = JSON.stringify(value);
		if (json === undefined) return undefined; // bare function/symbol/etc.
		if (json.length <= SNAPSHOT_MAX_CHARS) return value;
		return { _truncated: true, preview: json.slice(0, SNAPSHOT_MAX_CHARS) };
	} catch {
		return { _truncated: true, preview: "[unserializable]" };
	}
}

function pushDry(env: DryEnv, entry: ExecutedNode): void {
	const loop = env.currentLoop;
	const stamped: ExecutedNode = {
		...entry,
		input: boundSnapshot(entry.input),
		output: boundSnapshot(entry.output),
		startedAt: entry.startedAt ?? env.nodeStartedAt,
		completedAt: entry.completedAt ?? Date.now(),
		...(loop
			? {
					loopNodeId: loop.nodeId,
					loopIndex: loop.index,
					loopItemId: loop.itemId,
					loopItemLabel: loop.label,
				}
			: {}),
	};
	if (env.entries.length >= MAX_EXECUTED_ENTRIES) {
		if (!env.truncated) {
			env.truncated = true;
			env.entries.push({
				nodeId: stamped.nodeId,
				result: "skipped",
				startedAt: stamped.startedAt,
				completedAt: stamped.completedAt,
				error: `Preview truncated after ${MAX_EXECUTED_ENTRIES} steps`,
			});
		}
		return;
	}
	env.entries.push(stamped);
}

/** Human label for a record, used in the run's triggerRecord + sample picker. */
function sampleRecordLabel(
	objectType: ObjectType,
	record: Record<string, unknown>
): string {
	switch (objectType) {
		case "client":
			return String(record.companyName ?? "Client");
		case "project":
			return String(record.title ?? "Project");
		case "quote":
			return record.quoteNumber
				? `Quote ${record.quoteNumber}`
				: String(record.title ?? "Quote");
		case "invoice":
			return record.invoiceNumber
				? `Invoice ${record.invoiceNumber}`
				: "Invoice";
		case "task":
			return String(record.title ?? "Task");
		default: {
			const _exhaustive: never = objectType;
			return _exhaustive;
		}
	}
}

type DryNodeResult = {
	success: boolean;
	skipped?: boolean;
	conditionMet?: boolean;
	error?: string;
	output?: unknown;
	/** Best-effort snapshot of what the node consumed (bounded by pushDry). */
	input?: unknown;
};

/**
 * Dry mirror of executeUpdateFieldsAction: same per-row validation and
 * coercion, no writes. A one-row action previews with the exact summary and
 * input shape legacy update_field test runs always produced.
 */
async function dryUpdateFieldsAction(
	ctx: MutationCtx,
	target: ActionTarget,
	fields: Array<{ field: string; value: ValueRef }>,
	scopeRecord: ScopeRecord | undefined,
	env: DryEnv
): Promise<DryNodeResult> {
	if (!scopeRecord) {
		return { success: false, error: NO_SCOPE_RECORD_ERROR };
	}
	const targetInfo = await resolveTargetV2(
		ctx,
		target,
		scopeRecord.type,
		scopeRecord.id,
		scopeRecord.record,
		env.orgId
	);
	if (!targetInfo) {
		return {
			success: true,
			skipped: true,
			output: { note: "Related record not found — would skip" },
		};
	}
	if (fields.length === 0) {
		return { success: false, error: "No fields to update" };
	}

	const writes: Array<{ field: string; value: unknown }> = [];
	const seen = new Set<string>();
	for (const { field, value } of fields) {
		if (seen.has(field)) {
			return {
				success: false,
				error: `Field "${field}" appears more than once`,
			};
		}
		seen.add(field);

		const fieldDef = getFieldDefinition(targetInfo.type, field);
		if (!fieldDef) {
			return {
				success: false,
				error: `Unknown field "${field}" for ${targetInfo.type}`,
			};
		}
		if (!fieldDef.writable) {
			return {
				success: false,
				error: `Field "${field}" is not writable${
					fieldDef.writeExclusionReason
						? `: ${fieldDef.writeExclusionReason}`
						: ""
				}`,
			};
		}
		const raw = resolveValueRef(value, env.scope);
		const coerced = coerceFieldValue(
			fieldDef,
			raw,
			env.scope.workflow?.tz ?? "UTC"
		);
		if (!coerced.ok) {
			return { success: false, error: coerced.error };
		}
		if (field === "status") {
				if (typeof coerced.value !== "string") {
					return {
						success: false,
						error: `Status value for ${targetInfo.type} must be a string`,
					};
				}
				if (!isValidStatus(targetInfo.type, coerced.value)) {
					return {
						success: false,
						error: `Invalid status "${coerced.value}" for ${targetInfo.type}`,
					};
				}
			}
		writes.push({ field, value: coerced.value });
	}

	return {
		success: true,
		output: {
			summary: `Would set ${writes
				.map((w) => `${w.field} to ${JSON.stringify(w.value)}`)
				.join(", ")} on the ${targetInfo.type}`,
		},
		input:
			writes.length === 1
				? { target, field: writes[0].field, value: writes[0].value }
				: { target, fields: writes },
	};
}

/**
 * Dry mirror of executeCreateRecordAction: same validation and cap checks (all
 * reads), no insert/emit. Previews the assembled field set.
 */
async function dryCreateRecordAction(
	ctx: MutationCtx,
	action: Extract<AutomationAction, { type: "create_record" }>,
	scopeRecord: ScopeRecord | undefined,
	env: DryEnv
): Promise<DryNodeResult> {
	const objectType = action.objectType;
	if (!isCreatableObjectType(objectType)) {
		return {
			success: false,
			error: `Creating ${objectType} records from automations isn't supported`,
		};
	}
	const built = await buildCreateRecordPayload(ctx, action, scopeRecord, env);
	if (!built.ok) return { success: false, error: built.error };

	const org = await ctx.db.get(env.orgId);
	if (!orgHasPremiumPlan(org)) {
		const capError = await checkCreateRecordPlanCap(
			ctx,
			objectType,
			built.payload,
			env.orgId
		);
		if (capError) return { success: false, error: capError };
	}

	// Preview the field set without orgId (internal) — portalAccessId isn't set
	// until insert.
	const { orgId: _orgId, ...preview } = built.payload;
	return {
		success: true,
		output: { summary: `Would create a ${objectType}` },
		input: { objectType, fields: preview },
	};
}

/**
 * Describe (without executing) what an action would do. Mirrors the real
 * executors' validation so a test surfaces the same failures/skips, but never
 * writes, emits events, or touches aggregates.
 */
async function dryExecuteAction(
	ctx: MutationCtx,
	action: AutomationAction,
	scopeRecord: ScopeRecord | undefined,
	env: DryEnv
): Promise<DryNodeResult> {
	switch (action.type) {
		case "update_field":
			// Legacy single-field variant: same dry engine, one row.
			return dryUpdateFieldsAction(
				ctx,
				action.target,
				[{ field: action.field, value: action.value }],
				scopeRecord,
				env
			);
		case "update_fields":
			return dryUpdateFieldsAction(
				ctx,
				action.target,
				action.fields,
				scopeRecord,
				env
			);
		case "create_task": {
			const title = resolveTextValue(action.title, env.scope);
			if (!title) {
				return { success: false, error: "Task title resolved to an empty value" };
			}
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
			}
			return {
				success: true,
				output: { summary: `Would create task "${title}"` },
				input: { title, assigneeUserId: action.assigneeUserId },
			};
		}
		case "create_record":
			return dryCreateRecordAction(ctx, action, scopeRecord, env);
		case "send_notification": {
			let count: number;
			if (action.recipient === "org_admins") {
				const ids = await resolveMemberUserIds(ctx, env.orgId, true);
				if (ids.length === 0) {
					return { success: true, skipped: true, output: { note: "No admins to notify" } };
				}
				count = ids.length;
			} else if (action.recipient === "all_members") {
				const ids = await resolveMemberUserIds(ctx, env.orgId, false);
				if (ids.length === 0) {
					return { success: true, skipped: true, output: { note: "No members to notify" } };
				}
				count = ids.length;
			} else if (typeof action.recipient === "string") {
				// Unknown string (e.g. legacy "record_owner") — preview as skipped.
				return {
					success: true,
					skipped: true,
					output: { note: "Unknown recipient — reconfigure this notification" },
				};
			} else if ("recordField" in action.recipient) {
				const { target, field } = action.recipient.recordField;
				const res = await resolveRecordFieldUsers(
					ctx,
					target,
					field,
					scopeRecord,
					env.orgId
				);
				if (!res.resolved) {
					return {
						success: true,
						skipped: true,
						output: { note: "No record in scope for the selected field" },
					};
				}
				if (res.users.length === 0) {
					return {
						success: true,
						skipped: true,
						output: { note: "No user found for the selected field" },
					};
				}
				count = res.users.length;
			} else {
				const membership = await getMembership(
					ctx,
					action.recipient.userId as Id<"users">,
					env.orgId
				);
				if (!membership) {
					return {
						success: false,
						error: "Notification recipient is not a member of this organization",
					};
				}
				count = 1;
			}
			const message = interpolateTemplate(action.message, env.scope).trim();
			if (!message) {
				return {
					success: false,
					error: "Notification message resolved to an empty value",
				};
			}
			const channels = action.channels ?? ["in_app"];
			if (channels.length === 0) {
				return {
					success: true,
					skipped: true,
					output: { note: "No delivery channels configured" },
				};
			}
			if (channels.includes("push") && !channels.includes("in_app")) {
				return {
					success: true,
					skipped: true,
					output: { note: "Push-only delivery is not supported yet" },
				};
			}
			const channelLabel = channels
				.map((c) => (c === "in_app" ? "in-app" : "push"))
				.join(" + ");
			return {
				success: true,
				output: {
					summary: `Would notify ${count} recipient(s) via ${channelLabel}: "${message}"`,
				},
				input: {
					recipient: action.recipient,
					channels,
					message,
					recipientCount: count,
				},
			};
		}
		case "send_team_message": {
			const message = interpolateTemplate(action.message, env.scope).trim();
			if (!message) {
				return { success: false, error: "Message resolved to an empty value" };
			}
			const recipientIds = await resolveTeamMessageRecipients(
				ctx,
				action.recipients,
				env.orgId
			);
			// Mirror the real action: resolve target (default self) + mentions.
			let post: {
				entityType: "client" | "project" | "quote";
				entityId: string;
			} | null = null;
			let mentionIds: Id<"users">[] = [];
			if (scopeRecord) {
				const targetInfo = await resolveTargetV2(
					ctx,
					action.target ?? "self",
					scopeRecord.type,
					scopeRecord.id,
					scopeRecord.record,
					env.orgId
				);
				if (targetInfo) {
					if (
						targetInfo.type === "client" ||
						targetInfo.type === "project" ||
						targetInfo.type === "quote"
					) {
						post = { entityType: targetInfo.type, entityId: targetInfo.id };
					}
					mentionIds = await resolveTeamMessageMention(
						ctx,
						action.mention,
						targetInfo.type,
						targetInfo.id,
						env.orgId
					);
				}
			}
			// Bell recipients = broadcast recipients ∪ resolved mentions (deduped),
			// mirroring the production executor exactly.
			const bellIds = Array.from(
				new Set<Id<"users">>([...recipientIds, ...mentionIds])
			);
			if (!post && bellIds.length === 0) {
				return {
					success: true,
					skipped: true,
					output: { note: "No recipients to message" },
				};
			}
			const summary = post
				? `Would post to ${post.entityType} ${post.entityId}'s Team Communication feed, notifying ${bellIds.length} member(s)`
				: `No feed for this target — would notify ${bellIds.length} member(s)`;
			return {
				success: true,
				output: { summary },
				input: {
					target: action.target ?? "self",
					mention: action.mention ?? { kind: "none" },
					message,
					posted: post !== null,
					recipientCount: recipientIds.length,
					mentionCount: mentionIds.length,
					bellCount: bellIds.length,
				},
			};
		}
		default: {
			const _exhaustive: never = action;
			return _exhaustive;
		}
	}
}

/** Dry evaluation of a per-record node (condition/action). */
async function dryExecuteNode(
	ctx: MutationCtx,
	node: AutomationNode,
	scopeRecord: ScopeRecord | undefined,
	env: DryEnv
): Promise<DryNodeResult> {
	const config = node.config;
	if (config?.kind === "condition") {
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
		return {
			success: true,
			conditionMet,
			output: { conditionMet },
			input: { record, logic: config.logic, groups: config.groups },
		};
	}
	if (config?.kind === "action") {
		return dryExecuteAction(ctx, config.action, scopeRecord, env);
	}
	// Legacy (config-less) rows aren't produced by the v2 editor; skip in preview.
	return {
		success: true,
		skipped: true,
		output: { note: "Legacy step — not simulated" },
	};
}

/** Dry variant of runLoopNode: samples items and walks the body per item. */
async function dryRunLoopNode(
	ctx: MutationCtx,
	env: DryEnv,
	node: AutomationNode,
	config: Extract<WorkflowNodeConfig, { kind: "loop" }>
): Promise<"chain_done" | "ended" | "failed"> {
	const source = env.fetchOutputs[config.sourceNodeId];
	if (!source) {
		const error =
			'Loops need a "Find records" step to run earlier in the workflow';
		pushDry(env, { nodeId: node.id, result: "failed", error });
		return "failed";
	}

	const total = Math.min(
		source.records.length,
		config.maxIterations ?? MAX_LOOP_ITERATIONS,
		MAX_LOOP_ITERATIONS
	);
	const sampled = Math.min(total, DRY_LOOP_SAMPLE);
	if (source.truncated) env.dataTruncated = true;
	pushDry(env, {
		nodeId: node.id,
		result: "success",
		recordsProcessed: total,
		truncated: source.truncated,
		input: {
			sourceNodeId: config.sourceNodeId,
			maxIterations: config.maxIterations,
			total,
			sampled,
		},
		output:
			total > sampled
				? { total, sampled, note: `Previewing first ${sampled} of ${total}` }
				: { total },
	});

	if (!node.bodyStartNodeId || total === 0) {
		return "chain_done";
	}

	// Absent means "abort" — the same reading production uses.
	const continueOnItemError = config.onItemError === "continue";
	// `sampled`, not `total`: a preview only walks the first few items, and a
	// summary claiming the full match count would have the test run reporting
	// items it never attempted.
	const summary: LoopSummary = {
		nodeId: node.id,
		total: sampled,
		succeeded: 0,
		failed: 0,
		skipped: 0,
		errors: [],
	};
	env.loopSummaries.push(summary);

	env.scope.loops ??= {};
	try {
		for (let index = 0; index < sampled; index++) {
			const item = source.records[index];
			const itemId = String(item._id);
			const label = sampleRecordLabel(source.objectType, item);
			// `total` (full match), not `sampled`: loop.<id>.count is a data value —
			// the count production would iterate, matching the real loop.index shown.
			env.scope.loops[node.id] = { item, index, count: total };
			env.currentLoop = { nodeId: node.id, index, itemId, label };
			const itemScope: ScopeRecord = {
				type: source.objectType,
				id: itemId,
				record: item,
			};
			const outcome = await dryRunWalk(
				ctx,
				env,
				node.bodyStartNodeId,
				itemScope,
				true
			);

			if (outcome === "failed") {
				summary.failed += 1;
				if (summary.errors.length < MAX_LOOP_ITEM_ERRORS) {
					const error =
						[...env.entries]
							.reverse()
							.find((e) => e.result === "failed" && e.loopIndex === index)
							?.error ?? "Step failed";
					summary.errors.push({
						index,
						itemId,
						label,
						error: error.slice(0, MAX_ITEM_ERROR_CHARS),
					});
				}
				if (!continueOnItemError) return "failed";
				continue;
			}

			// "next_item"/"chain_done" continue with the next sampled record.
			summary.succeeded += 1;
			if (outcome === "ended") return outcome;
		}
	} finally {
		delete env.scope.loops[node.id];
		env.currentLoop = undefined;
	}

	return "chain_done";
}

/**
 * Dry counterpart of runWalk: same control flow, but never writes, never
 * checkpoints delays (records "would wait until" and continues), and appends
 * to env.entries instead of patching the execution row.
 */
async function dryRunWalk(
	ctx: MutationCtx,
	env: DryEnv,
	startNodeId: string | undefined,
	scopeRecord: ScopeRecord | undefined,
	inLoop: boolean
): Promise<DryWalkOutcome> {
	let currentNodeId = startNodeId;
	const visited = new Set<string>();

	while (currentNodeId) {
		if (visited.has(currentNodeId)) {
			pushDry(env, {
				nodeId: currentNodeId,
				result: "failed",
				error: `Workflow contains a cycle through node "${currentNodeId}"`,
			});
			return "failed";
		}
		visited.add(currentNodeId);

		const node = env.nodesById.get(currentNodeId);
		if (!node) return "chain_done";
		// Mark the start of this node so pushDry can stamp its duration.
		env.nodeStartedAt = Date.now();
		const config = node.config;

		if (config?.kind === "fetch_records") {
			const fetched = await runFetchNode(ctx, env, node.id, config);
			if (!fetched.ok) {
				pushDry(env, { nodeId: node.id, result: "failed", error: fetched.error });
				return "failed";
			}
			if (fetched.output.truncated) env.dataTruncated = true;
			pushDry(env, {
				nodeId: node.id,
				result: "success",
				recordsProcessed: fetched.output.count,
				truncated: fetched.output.truncated,
				input: {
					objectType: config.objectType,
					filters: config.filters,
					limit: config.limit,
					sortBy: config.sortBy,
				},
				output: { count: fetched.output.count },
			});
			currentNodeId =
				node.nextNodeId ?? mergeContinuationFor(env.nodesById, node.id);
			continue;
		}

		if (config?.kind === "aggregate") {
			const result = runAggregateNode(env, node.id, config);
			if (!result.ok) {
				pushDry(env, {
					nodeId: node.id,
					result: "failed",
					error: result.error,
				});
				return "failed";
			}
			if (result.truncated) env.dataTruncated = true;
			pushDry(env, {
				nodeId: node.id,
				result: "success",
				truncated: result.truncated,
				input: {
					sourceNodeId: config.sourceNodeId,
					field: config.field,
					op: config.op,
					sourceCount: env.fetchOutputs[config.sourceNodeId]?.count,
				},
				output: { result: result.value },
			});
			currentNodeId =
				node.nextNodeId ?? mergeContinuationFor(env.nodesById, node.id);
			continue;
		}

		if (config?.kind === "adjust_time") {
			const result = runAdjustTimeNode(env.scope, node.id, config);
			if (!result.ok) {
				pushDry(env, {
					nodeId: node.id,
					result: "failed",
					error: result.error,
				});
				return "failed";
			}
			pushDry(env, {
				nodeId: node.id,
				result: "success",
				input: {
					base: config.base,
					amount: config.amount,
					unit: config.unit,
					direction: config.direction,
				},
				output: { result: result.value },
			});
			currentNodeId =
				node.nextNodeId ?? mergeContinuationFor(env.nodesById, node.id);
			continue;
		}

		if (config?.kind === "loop") {
			if (inLoop) {
				const error = "Nested loops are not supported";
				pushDry(env, { nodeId: node.id, result: "failed", error });
				return "failed";
			}
			const outcome = await dryRunLoopNode(ctx, env, node, config);
			if (outcome !== "chain_done") return outcome;
			currentNodeId =
				node.nextNodeId ?? mergeContinuationFor(env.nodesById, node.id);
			continue;
		}

		if (config?.kind === "delay" || config?.kind === "delay_until") {
			if (inLoop) {
				const error = "Delay steps are not supported inside loops";
				pushDry(env, { nodeId: node.id, result: "failed", error });
				return "failed";
			}
			const resume = computeDelayResume(config, env.scope);
			if (!resume.ok) {
				pushDry(env, { nodeId: node.id, result: "failed", error: resume.error });
				return "failed";
			}
			// Dry runs don't actually wait — record the intent and continue.
			pushDry(env, {
				nodeId: node.id,
				result: "success",
				input:
					config.kind === "delay"
						? { amount: config.amount, unit: config.unit }
						: { until: config.until },
				output: { wouldWaitUntil: resume.resumeAt, dryRunSkipped: true },
			});
			currentNodeId =
				node.nextNodeId ?? mergeContinuationFor(env.nodesById, node.id);
			continue;
		}

		if (config?.kind === "next_item") {
			if (!inLoop) {
				const error = '"Next item" only works inside a loop';
				pushDry(env, { nodeId: node.id, result: "failed", error });
				return "failed";
			}
			pushDry(env, { nodeId: node.id, result: "success" });
			return "next_item";
		}

		if (config?.kind === "end") {
			pushDry(env, { nodeId: node.id, result: "success" });
			return "ended";
		}

		const result = await dryExecuteNode(ctx, node, scopeRecord, env);
		pushDry(env, {
			nodeId: node.id,
			result: result.success
				? "success"
				: result.skipped
					? "skipped"
					: "failed",
			error: result.error,
			input: result.input,
			output: result.output,
		});
		if (!result.success && !result.skipped) return "failed";

		currentNodeId =
			node.type === "condition"
				? ((result.conditionMet ? node.nextNodeId : node.elseNodeId) ??
					node.mergeNodeId ??
					mergeContinuationFor(env.nodesById, node.id))
				: (node.nextNodeId ?? mergeContinuationFor(env.nodesById, node.id));
	}

	return "chain_done";
}

/**
 * Precompute the full dry-run plan for the WORKING copy (what the editor is
 * testing). Reads only; produces the ordered per-node entries revealed live.
 */
async function buildDryPlan(
	ctx: MutationCtx,
	automation: AutomationDoc,
	scopeRecord: ScopeRecord | undefined,
	triggerObject: Record<string, unknown>,
	eventOldValue: string | undefined,
	eventNewValue: string | undefined,
	globals: Pick<VariableScope, "workflow" | "org" | "user" | "run">
): Promise<{
	plan: ExecutedNode[];
	/** The walk stopped on a failure, rather than running past skipped items. */
	aborted: boolean;
	loopSummaries: LoopSummary[];
}> {
	const env: DryEnv = {
		orgId: automation.orgId,
		automationName: automation.name,
		nodesById: new Map(automation.nodes.map((n) => [n.id, n])),
		scope: {
			trigger: {
				record: triggerObject,
				event:
					eventOldValue !== undefined || eventNewValue !== undefined
						? { oldValue: eventOldValue, newValue: eventNewValue }
						: undefined,
			},
			formulas: automation.formulas,
			...globals,
		},
		fetchOutputs: {},
		entries: [],
		truncated: false,
		dataTruncated: false,
		fetchScanBudget: WALK_SCAN_BUDGET,
		nodeStartedAt: Date.now(),
		loopSummaries: [],
	};

	let outcome: DryWalkOutcome = "chain_done";
	if (automation.nodes.length > 0) {
		outcome = await dryRunWalk(ctx, env, automation.nodes[0].id, scopeRecord, false);
	}
	return {
		plan: env.entries,
		aborted: outcome === "failed",
		loopSummaries: env.loopSummaries,
	};
}

/**
 * Start a dry-run test of an automation's working copy against an optional
 * sample record. Computes the plan, then schedules the live reveal.
 */
export const startTestRun = userMutation({
	args: {
		automationId: v.id("workflowAutomations"),
		record: v.optional(
			v.object({ entityType: objectTypeValidator, entityId: v.string() })
		),
	},
	handler: async (ctx, args): Promise<Id<"workflowExecutions">> => {
		await ctx.requireLevel("automations", "modify");
		// No server-side premium check by design: the automations editor is behind
		// PremiumGate and dispatchScheduledAutomations gates autonomous runs, so
		// interactive test runs stay ungated.
		const automation = await ctx.db.get(args.automationId);
		if (!automation || automation.orgId !== ctx.orgId) {
			throw new Error("Automation not found");
		}

		const trigger = automation.trigger;
		const triggerObjectType = triggerRecordObjectType(
			trigger as AutomationTrigger
		) as ObjectType | undefined;

		let triggerObject: Record<string, unknown> = {};
		let scopeRecord: ScopeRecord | undefined;
		let triggerRecord:
			| { entityType: string; entityId: string; label?: string }
			| undefined;
		if (args.record) {
			// A scheduled run never has a triggering record; binding one here would
			// make the dry run lie about production behavior.
			if ("type" in trigger && trigger.type === "scheduled") {
				throw new Error(
					"Scheduled automations run without a triggering record — test without one"
				);
			}
			if (triggerObjectType && args.record.entityType !== triggerObjectType) {
				throw new Error(
					`This automation runs on ${triggerObjectType} records — pick a ${triggerObjectType} to test with`
				);
			}
			const obj = await getObject(
				ctx,
				args.record.entityType,
				args.record.entityId,
				ctx.orgId
			);
			if (!obj) {
				throw new Error("The selected record could not be found");
			}
			triggerObject = obj as Record<string, unknown>;
			// Simulate a status change so status_changed conditions/variables
			// reflect the tested transition rather than the record's live status.
			if ("type" in trigger && trigger.type === "status_changed") {
				triggerObject = { ...triggerObject, status: trigger.toStatus };
			}
			scopeRecord = {
				type: args.record.entityType,
				id: args.record.entityId,
				record: triggerObject,
			};
			triggerRecord = {
				entityType: args.record.entityType,
				entityId: args.record.entityId,
				label: sampleRecordLabel(
					args.record.entityType,
					obj as Record<string, unknown>
				),
			};
		}

		const { eventOldValue, eventNewValue } = deriveTriggerEventValues(trigger);

		const now = Date.now();
		// The tester is always the actor for a dry run.
		const testerOrg = await ctx.db.get(ctx.orgId);
		const globals: Pick<VariableScope, "workflow" | "org" | "user" | "run"> = {
			workflow: { now, tz: automationFormulaTz(trigger) },
			org: testerOrg ? { id: ctx.orgId, name: testerOrg.name } : undefined,
			user: { id: ctx.user._id, name: ctx.user.name, email: ctx.user.email },
			// executionId is omitted — the workflowExecutions row isn't inserted until
			// after the dry plan is built, so a preview has no final id yet.
			run: {
				automationName: automation.name,
				automationId: automation._id,
				triggerType: "type" in trigger ? trigger.type : "status_changed",
			},
		};

		const { plan, aborted, loopSummaries } = await buildDryPlan(
			ctx,
			automation,
			scopeRecord,
			triggerObject,
			eventOldValue,
			eventNewValue,
			globals
		);

		const failed = plan.some((e) => e.result === "failed");
		const done = plan.length === 0;
		const dataTruncated = plan.some((e) => e.truncated);

		// A failed step no longer implies a failed run: a loop set to continue
		// records the failure and carries on. `aborted` is the only thing that
		// separates the two, so it's decided here and carried on the cursor —
		// executeTestStep only ever sees the entries, which can't tell them apart.
		const terminalStatus = aborted
			? ("failed" as const)
			: failed
				? ("completed_with_errors" as const)
				: ("completed" as const);

		const executionId = await ctx.db.insert("workflowExecutions", {
			orgId: ctx.orgId,
			automationId: args.automationId,
			triggeredBy: `test:${ctx.user._id}`,
			triggeredAt: now,
			status: done ? terminalStatus : "running",
			completedAt: done ? now : undefined,
			mode: "test",
			dryRun: true,
			currentNodeId: done ? undefined : plan[0].nodeId,
			triggerRecord,
			nodesExecuted: [],
			dataTruncated,
			loopSummary: loopSummaries.length > 0 ? loopSummaries : undefined,
			testCursor: done ? undefined : { plan, terminalStatus },
			error:
				done && aborted
					? plan.find((e) => e.result === "failed")?.error
					: undefined,
		});

		if (!done) {
			await ctx.scheduler.runAfter(
				TEST_STEP_INTERVAL_MS,
				internal.automationExecutor.executeTestStep,
				{ orgId: ctx.orgId, executionId }
			);
		}
		return executionId;
	},
});

/**
 * Reveal the next precomputed test-run entry, then reschedule until the plan
 * is exhausted. One node per transaction so the getExecution subscription
 * streams per-node status live.
 */
export const executeTestStep = systemMutation({
	args: { executionId: v.id("workflowExecutions") },
	handler: async (ctx, args): Promise<void> => {
		const execution = await ctx.db.get(args.executionId);
		if (!execution || execution.orgId !== ctx.orgId) return;
		// Cancelled/completed, or not a streaming test run.
		if (execution.status !== "running" || !execution.testCursor) return;

		const plan = execution.testCursor.plan;
		const index = execution.nodesExecuted.length;

		// Legacy cursors (written before terminalStatus existed) fall back to the
		// old derivation, but over `plan` — nodesExecuted excludes the entry this
		// call is about to reveal, so a run failing on its last step read clean.
		const terminalStatus =
			execution.testCursor.terminalStatus ??
			(plan.some((e) => e.result === "failed")
				? ("failed" as const)
				: ("completed" as const));

		if (index >= plan.length) {
			await ctx.db.patch(args.executionId, {
				status: terminalStatus,
				completedAt: Date.now(),
				currentNodeId: undefined,
				testCursor: undefined,
			});
			return;
		}

		const revealed = [...execution.nodesExecuted, plan[index]];
		const nextIndex = index + 1;

		if (nextIndex < plan.length) {
			await ctx.db.patch(args.executionId, {
				nodesExecuted: revealed,
				currentNodeId: plan[nextIndex].nodeId,
			});
			await ctx.scheduler.runAfter(
				TEST_STEP_INTERVAL_MS,
				internal.automationExecutor.executeTestStep,
				{ orgId: ctx.orgId, executionId: args.executionId }
			);
			return;
		}

		await ctx.db.patch(args.executionId, {
			nodesExecuted: revealed,
			status: terminalStatus,
			completedAt: Date.now(),
			currentNodeId: undefined,
			testCursor: undefined,
			error:
				terminalStatus === "failed"
					? revealed.find((e) => e.result === "failed")?.error
					: undefined,
		});
	},
});

/** Cancel an in-progress dry-run test. */
export const cancelTestRun = userMutation({
	args: { executionId: v.id("workflowExecutions") },
	handler: async (ctx, args): Promise<void> => {
		await ctx.requireLevel("automations", "modify");
		const execution = await ctx.db.get(args.executionId);
		if (!execution || execution.orgId !== ctx.orgId) {
			throw new Error("Test run not found");
		}
		if (execution.status !== "running" || execution.mode !== "test") return;
		await ctx.db.patch(args.executionId, {
			status: "cancelled",
			completedAt: Date.now(),
			currentNodeId: undefined,
			testCursor: undefined,
		});
	},
});

/**
 * Run a published automation on demand against a chosen record. Production
 * mode — real effects — executing the published snapshot via executeAutomation.
 */
export const startManualRun = userMutation({
	args: {
		automationId: v.id("workflowAutomations"),
		record: v.optional(
			v.object({ entityType: objectTypeValidator, entityId: v.string() })
		),
	},
	handler: async (ctx, args): Promise<Id<"workflowExecutions">> => {
		await ctx.requireLevel("automations", "modify");
		// No server-side premium check by design: the automations editor is behind
		// PremiumGate and dispatchScheduledAutomations gates autonomous runs, so
		// interactive manual runs stay ungated.
		const automation = await ctx.db.get(args.automationId);
		if (!automation || automation.orgId !== ctx.orgId) {
			throw new Error("Automation not found");
		}
		if (!automation.publishedSnapshot) {
			throw new Error("Publish this automation before running it manually");
		}

		const { trigger } = executableDefinition(automation);
		const objectType = triggerRecordObjectType(
			trigger as AutomationTrigger
		) as ObjectType | undefined;

		let triggerRecord:
			| { entityType: string; entityId: string; label?: string }
			| undefined;
		let objType: ObjectType | undefined;
		let objectId: string | undefined;
		if (args.record) {
			if (objectType && args.record.entityType !== objectType) {
				throw new Error(
					`This automation runs on ${objectType} records — pick a ${objectType} to run it against`
				);
			}
			const obj = await getObject(
				ctx,
				args.record.entityType,
				args.record.entityId,
				ctx.orgId
			);
			if (!obj) {
				throw new Error("The selected record could not be found");
			}
			objType = args.record.entityType;
			objectId = args.record.entityId;
			triggerRecord = {
				entityType: objType,
				entityId: objectId,
				label: sampleRecordLabel(objType, obj as Record<string, unknown>),
			};
		} else if (objectType) {
			throw new Error("Pick a record to run this automation against");
		}

		// Rate-limit (shared window with event-driven + scheduled runs).
		const now = Date.now();
		const recent = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_org_triggeredAt", (q) =>
				q.eq("orgId", ctx.orgId).gte("triggeredAt", now - RATE_LIMIT_WINDOW_MS)
			)
			.take(MAX_EXECUTIONS_PER_WINDOW);
		if (recent.length >= MAX_EXECUTIONS_PER_WINDOW) {
			throw new Error(
				"Too many automation runs in the last minute — try again shortly"
			);
		}

		const executionId = await ctx.db.insert("workflowExecutions", {
			orgId: ctx.orgId,
			automationId: args.automationId,
			triggeredBy: `manual:${ctx.user._id}`,
			triggeredAt: now,
			status: "running",
			mode: "production",
			snapshotVersion: automation.publishedSnapshot.version,
			triggerRecord,
			nodesExecuted: [],
			executionChain: [args.automationId],
			recursionDepth: 0,
		});

		// Thread the trigger's simulated event values (status_changed from/to) so
		// conditions on trigger.event.* resolve, matching startTestRun.
		const { eventOldValue, eventNewValue } = deriveTriggerEventValues(trigger);

		await ctx.scheduler.runAfter(
			0,
			internal.automationExecutor.executeAutomation,
			{
				orgId: ctx.orgId,
				executionId,
				automationId: args.automationId,
				objectType: objType,
				objectId,
				eventOldValue,
				eventNewValue,
				executionChain: [args.automationId],
				recursionDepth: 1,
			}
		);

		return executionId;
	},
});

/** Live subscription target for a single run (test or production). */
export const getExecution = userQuery({
	args: { executionId: v.id("workflowExecutions") },
	handler: async (ctx, args): Promise<Doc<"workflowExecutions"> | null> => {
		await ctx.requireLevel("automations", "view");
		const execution = await ctx.db.get(args.executionId);
		if (!execution || execution.orgId !== ctx.orgId) return null;
		return execution;
	},
});

/**
 * Latest records of a trigger object type, for the run picker. Accepts an
 * explicit objectType (so the editor's picker works before the automation is
 * saved) or derives it from a stored automation's trigger.
 */
export const getSampleRecords = userQuery({
	args: {
		automationId: v.optional(v.id("workflowAutomations")),
		objectType: v.optional(objectTypeValidator),
	},
	handler: async (
		ctx,
		args
	): Promise<{ entityType: ObjectType; entityId: string; label: string }[]> => {
		await ctx.requireLevel("automations", "view");
		let objectType = args.objectType;
		if (!objectType && args.automationId) {
			const automation = await ctx.db.get(args.automationId);
			if (!automation || automation.orgId !== ctx.orgId) return [];
			// Manual runs execute the published snapshot, so derive the record
			// type from it — an unpublished object-type edit must not leak here.
			const { trigger } = executableDefinition(automation);
			objectType = triggerRecordObjectType(trigger as AutomationTrigger) as
				| ObjectType
				| undefined;
		}
		if (!objectType) return [];

		// Sample records are per-object-type; automations:view alone doesn't
		// grant visibility into arbitrary record types (e.g. invoices).
		const permissionObject = ENTITY_PERMISSION_OBJECT[objectType];
		if (!permissionObject) return [];
		await ctx.requireLevel(permissionObject, "view");

		const rows = await takeOrgPage(ctx, objectType, ctx.orgId, undefined, 10);
		return rows.map((row) => ({
			entityType: objectType as ObjectType,
			entityId: String(row._id),
			label: sampleRecordLabel(objectType as ObjectType, row),
		}));
	},
});

/**
 * Watchdog: fail test runs stuck "running" past STALE_TEST_RUN_MS (a dropped
 * reveal chain). Production runs parked at delays are excluded (mode !== test).
 */
export const failStaleTestRuns = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ failed: number }> => {
		const cutoff = Date.now() - STALE_TEST_RUN_MS;
		const stale = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_triggeredAt", (q) => q.lt("triggeredAt", cutoff))
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "running"),
					q.eq(q.field("mode"), "test")
				)
			)
			.take(100);

		let failed = 0;
		for (const execution of stale) {
			await ctx.db.patch(execution._id, {
				status: "failed",
				completedAt: Date.now(),
				currentNodeId: undefined,
				testCursor: undefined,
				error: execution.error ?? "Test run timed out",
			});
			failed++;
		}
		return { failed };
	},
});

/**
 * A production run idle past this is presumed stranded by a dropped scheduler
 * hop. Applies to both the run's age (stuck mid-walk with no resumeState) and
 * a parked run's missed wake time.
 */
const STALE_PRODUCTION_RUN_MS = 30 * 60 * 1000;

/**
 * Watchdog: rescue production runs stranded by a dropped scheduler hop. Two
 * shapes: stuck mid-walk (`running`, no resumeState, older than the cutoff)
 * and parked runs whose resumeState wake time passed the cutoff without the
 * resume ever firing. Legitimately parked runs (future wake) are skipped.
 * Without this, a wedged run shows "running" forever and is excluded from
 * retention cleanup, and the owner is never told.
 */
export const failStaleProductionRuns = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ failed: number }> => {
		const now = Date.now();
		const cutoff = now - STALE_PRODUCTION_RUN_MS;
		// resumeAt >= triggeredAt always (wake times are computed at park time),
		// so triggeredAt < cutoff catches both shapes in one indexed read.
		const candidates = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_triggeredAt", (q) => q.lt("triggeredAt", cutoff))
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "running"),
					q.neq(q.field("mode"), "test")
				)
			)
			.take(100);

		let failed = 0;
		for (const execution of candidates) {
			const resume = execution.resumeState;
			// Parked with the wake still ahead (or recently passed): leave it be.
			if (resume && resume.resumeAt >= cutoff) continue;

			// A parked run's wait is honest pause, not activity — fold it in so
			// the derived activeMs stays truthful (mirrors resumeExecution).
			const pausedMs = resume
				? (execution.pausedMs ?? 0) + (now - (resume.checkpointAt ?? now))
				: execution.pausedMs;

			const message = resume
				? "Run never woke from its scheduled resume and was marked failed by the watchdog"
				: "Run stalled without completing and was marked failed by the watchdog";

			await ctx.db.patch(execution._id, {
				status: "failed",
				completedAt: now,
				currentNodeId: undefined,
				resumeState: undefined,
				pausedMs,
				error: execution.error ?? message,
			});
			failed++;

			// Legacy dry-run rows can carry mode !== "test": clean them up above,
			// but never alert on a run that wrote nothing.
			if (execution.dryRun) continue;
			const automation = await ctx.db.get(execution.automationId);
			if (automation && automation.orgId === execution.orgId) {
				await notifyAutomationFailure(ctx, automation, message, execution._id);
			}
			// else: no automation doc to name the alert; skip (deleted automation).
		}
		return { failed };
	},
});

/** Exposed for tests; not part of the public API. */
export const __testUtils = { resolveMemberUserIds };
