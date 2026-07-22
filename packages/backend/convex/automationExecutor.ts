import {
	internalMutation,
	internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { ENTITY_PERMISSION_OBJECT } from "./activities";
import { systemMutation, userMutation, userQuery } from "./lib/factories";
import { computeNextRunAt } from "./lib/schedule";
import { orgHasPremiumPlan, userHasPremiumOverride } from "./lib/permissions";
import { rateLimiter } from "./rateLimits";
import {
	evaluateConditionGroups,
	type VariableScope,
} from "./lib/conditionEval";
import {
	collectRelationRefs,
	dottedRuleFieldCandidates,
} from "./lib/relationRefs";
import {
	triggerableObjectTypeValidator,
	triggerRecordObjectType,
	type AutomationTrigger,
} from "./lib/workflowTypes";
import type {
	AutomationDoc,
	ObjectType,
	ScopeRecord,
	WalkEnv,
} from "./lib/automationExec/types";
import {
	WALK_SCAN_BUDGET,
	takeOrgPage,
	getObject,
	hydrateRelations,
	hydrateTriggerRelations,
	sampleRecordLabel,
} from "./lib/automationExec/fetch";
// Re-exported: automationExecutor.test.ts imports these from this module.
export { scanOrgRows, hydrateRelations } from "./lib/automationExec/fetch";
import {
	notifyAutomationFailure,
	resolveMemberUserIds,
} from "./lib/automationExec/actions";
import {
	executableDefinition,
	automationFormulaTz,
	deriveTriggerEventValues,
	buildGlobalsScope,
	runMetadata,
	matchAndScheduleAutomations,
	SCHEDULED_DISPATCH_BATCH,
	RATE_LIMIT_WINDOW_MS,
	MAX_EXECUTIONS_PER_WINDOW,
	type MatchAndScheduleResult,
} from "./lib/automationExec/matching";
import {
	MAX_EXECUTED_ENTRIES,
	loopSummaryPatch,
	finishWalk,
	runWalk,
	runLoopNode,
	mergeContinuationFor,
	type WalkOutcome,
} from "./lib/automationExec/walk";
// Re-exported: automationExecutor.test.ts imports this from this module.
export { isFatalExecutionError } from "./lib/automationExec/walk";
import {
	TEST_STEP_INTERVAL_MS,
	STALE_TEST_RUN_MS,
	buildDryPlan,
} from "./lib/automationExec/dryRun";

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

		const relationCache: Map<string, Record<string, unknown> | null> =
			new Map();
		const matched: typeof automations = [];
		for (const automation of automations) {
			const definition = executableDefinition(automation);
			const trigger = definition.trigger;
			const triggerType =
				"type" in trigger ? trigger.type : "status_changed";

			if (triggerType !== args.triggerType) {
				continue;
			}
			if (
				"objectType" in trigger &&
				trigger.objectType !== args.objectType
			) {
				continue;
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
			if (!shapeMatches) continue;

			// Entry criteria (A5-2): evaluated against the actual record before
			// anything is scheduled, with condition-node semantics
			// (evaluateConditionGroups) scoped to trigger + globals.
			const criteria =
				"entryCriteria" in trigger ? trigger.entryCriteria : undefined;
			if (!criteria || criteria.groups.length === 0) {
				matched.push(automation);
				continue;
			}
			if (!record) continue;
			// One-hop relations the criteria reference (value refs and formulas via
			// the static scan; dotted rule fields directly), hydrated against the
			// trigger record. The cache is shared across candidates — same record.
			const refs = collectRelationRefs([], trigger, definition.formulas);
			for (const candidate of dottedRuleFieldCandidates(criteria.groups)) {
				refs.trigger.add(candidate);
			}
			const related =
				refs.trigger.size > 0
					? await hydrateRelations(
							ctx,
							args.orgId,
							args.objectType,
							record,
							refs.trigger,
							relationCache
						)
					: undefined;
			const scope: VariableScope = {
				trigger: {
					record,
					event:
						args.fromStatus !== undefined || args.toStatus !== undefined
							? { oldValue: args.fromStatus, newValue: args.toStatus }
							: undefined,
					related,
				},
				workflow: {
					now: Date.now(),
					tz: automationFormulaTz(trigger, org?.timezone),
				},
				org: org ? { id: args.orgId, name: org.name } : undefined,
				user: actor
					? { id: actor._id, name: actor.name, email: actor.email }
					: undefined,
				formulas: definition.formulas,
			};
			if (
				evaluateConditionGroups(
					criteria.logic,
					criteria.groups,
					record,
					scope,
					args.objectType,
					related
				)
			) {
				matched.push(automation);
			}
		}
		return matched;
	},
});

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
		entityType: triggerableObjectTypeValidator,
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

				// Debit the same per-org budget as event-driven run starts so
				// scheduled + event runs share one 100/min cap.
				const limit = await rateLimiter.limit(ctx, "automationRunStarts", {
					key: automation.orgId,
				});
				if (!limit.ok) {
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

		// A full batch means more rows may already be due — catch up now instead
		// of drifting a further 15 minutes per tick. Claim-first nextRunAt
		// advances (or clears, on failure) above, so the follow-up sees only
		// still-unclaimed rows and the chain terminates.
		if (due.length === SCHEDULED_DISPATCH_BATCH) {
			await ctx.scheduler.runAfter(
				0,
				internal.automationExecutor.dispatchScheduledAutomations,
				{}
			);
		}

		return { due: due.length, dispatched };
	},
});


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
			definition.trigger,
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
			relationRefs: collectRelationRefs(
				definition.nodes,
				definition.trigger,
				definition.formulas
			),
			relationCache: new Map(),
			trigger: { objectType: args.objectType, objectId: args.objectId },
			nodeStartedAt: Date.now(),
			isProduction,
		};

		await hydrateTriggerRelations(ctx, env, scopeRecord);

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
			definition.trigger,
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
			relationRefs: collectRelationRefs(
				definition.nodes,
				definition.trigger,
				definition.formulas
			),
			relationCache: new Map(),
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

		await hydrateTriggerRelations(ctx, env, scopeRecord);

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

/**
 * Deferred run-counter bump — deliberately its own tiny mutation (see the
 * finishWalk comment). Conflicts between concurrent completions retry a
 * two-read patch instead of a whole walk chunk. Seeds from the deprecated
 * on-doc counters so pre-split history carries over.
 */
export const bumpTriggerStats = internalMutation({
	args: {
		automationId: v.id("workflowAutomations"),
		orgId: v.id("organizations"),
		triggeredAt: v.number(),
	},
	handler: async (ctx, args): Promise<void> => {
		const existing = await ctx.db
			.query("automationRunStats")
			.withIndex("by_automation", (q) =>
				q.eq("automationId", args.automationId)
			)
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, {
				lastTriggeredAt: Math.max(existing.lastTriggeredAt, args.triggeredAt),
				triggerCount: existing.triggerCount + 1,
			});
			return;
		}
		const automation = await ctx.db.get(args.automationId);
		// remove() deletes the automation and its stats row atomically; a bump
		// still in the scheduler queue must not resurrect an orphaned row.
		if (!automation) return;
		await ctx.db.insert("automationRunStats", {
			orgId: args.orgId,
			automationId: args.automationId,
			lastTriggeredAt: Math.max(
				automation?.lastTriggeredAt ?? 0,
				args.triggeredAt
			),
			triggerCount: (automation?.triggerCount ?? 0) + 1,
		});
	},
});

// Cleanup configuration
const EXECUTION_LOG_RETENTION_DAYS = 30;
/** Runaway guard for self-rechaining sweeps; deletes always make progress. */
const MAX_CLEANUP_PASSES = 200;

/**
 * Clean up old execution logs to prevent unbounded table growth.
 * Runs daily via cron and self-rechains while rows remain — a single
 * fixed-size pass deletes less than a busy day inserts.
 */
export const cleanupOldExecutions = internalMutation({
	args: {
		olderThanDays: v.optional(v.number()),
		batchSize: v.optional(v.number()),
		pass: v.optional(v.number()),
	},
	handler: async (
		ctx,
		args
	): Promise<{ deleted: number; hasMore: boolean }> => {
		const retentionDays = args.olderThanDays ?? EXECUTION_LOG_RETENTION_DAYS;
		const batchSize = args.batchSize ?? 500;
		const pass = args.pass ?? 0;

		const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

		// Terminal rows only — "running" rows are left for the stale-run
		// watchdogs. Status-partitioned index ranges land directly on deletable
		// rows, so stuck old "running" rows are never re-scanned pass after pass.
		const terminalStatuses = [
			"completed",
			"completed_with_errors",
			"failed",
			"skipped",
			"cancelled",
		] as const;

		let deleted = 0;
		for (const status of terminalStatuses) {
			while (deleted < batchSize) {
				const oldExecutions = await ctx.db
					.query("workflowExecutions")
					.withIndex("by_status_triggeredAt", (q) =>
						q.eq("status", status).lt("triggeredAt", cutoffTime)
					)
					.take(Math.min(100, batchSize - deleted));

				if (oldExecutions.length === 0) {
					break;
				}

				for (const execution of oldExecutions) {
					await ctx.db.delete(execution._id);
					deleted++;
				}
			}
		}

		const hasMore = deleted >= batchSize && pass + 1 < MAX_CLEANUP_PASSES;
		if (hasMore) {
			await ctx.scheduler.runAfter(
				0,
				internal.automationExecutor.cleanupOldExecutions,
				{
					olderThanDays: args.olderThanDays,
					batchSize: args.batchSize,
					pass: pass + 1,
				}
			);
		} else if (deleted >= batchSize) {
			console.warn(
				`cleanupOldExecutions hit the ${MAX_CLEANUP_PASSES}-pass cap with rows still pending`
			);
		}

		console.log(
			`Cleaned up ${deleted} old automation execution logs (older than ${retentionDays} days, pass ${pass})`
		);

		return { deleted, hasMore };
	},
});


/**
 * Start a dry-run test of an automation's working copy against an optional
 * sample record. Computes the plan, then schedules the live reveal.
 */
export const startTestRun = userMutation({
	args: {
		automationId: v.id("workflowAutomations"),
		record: v.optional(
			v.object({
				entityType: triggerableObjectTypeValidator,
				entityId: v.string(),
			})
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
			workflow: { now, tz: automationFormulaTz(trigger, testerOrg?.timezone) },
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
			v.object({
				entityType: triggerableObjectTypeValidator,
				entityId: v.string(),
			})
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
		objectType: v.optional(triggerableObjectTypeValidator),
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

/** One watchdog page. Rechained via cursor, so this bounds a pass, not a sweep. */
const WATCHDOG_BATCH_SIZE = 100;
/** Runaway guard; the cursor advances monotonically so sweeps terminate. */
const MAX_WATCHDOG_PASSES = 200;

/**
 * Watchdog: fail test runs stuck "running" past STALE_TEST_RUN_MS (a dropped
 * reveal chain). Production runs parked at delays are excluded (mode !== test).
 */
export const failStaleTestRuns = internalMutation({
	args: {
		cursorTriggeredAt: v.optional(v.number()),
		pass: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<{ failed: number }> => {
		const cutoff = Date.now() - STALE_TEST_RUN_MS;
		const pass = args.pass ?? 0;
		// Status-partitioned range lands directly on "running" rows. Scanning
		// by_triggeredAt instead walks the far larger population of old terminal
		// rows and can exhaust its budget before reaching any stale run.
		const candidates = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_status_triggeredAt", (q) =>
				q
					.eq("status", "running")
					.gt("triggeredAt", args.cursorTriggeredAt ?? -1)
					.lt("triggeredAt", cutoff)
			)
			.take(WATCHDOG_BATCH_SIZE);

		let failed = 0;
		for (const execution of candidates) {
			if (execution.mode !== "test") continue;
			await ctx.db.patch(execution._id, {
				status: "failed",
				completedAt: Date.now(),
				currentNodeId: undefined,
				testCursor: undefined,
				error: execution.error ?? "Test run timed out",
			});
			failed++;
		}

		// Cursor on row position, not work done: a full page of skipped rows
		// (wrong mode) must not stall the sweep. Rows sharing the last row's
		// exact triggeredAt ms are passed over by the exclusive `gt` bound and
		// are picked up by the next cron tick, which starts from scratch.
		if (
			candidates.length === WATCHDOG_BATCH_SIZE &&
			pass + 1 < MAX_WATCHDOG_PASSES
		) {
			await ctx.scheduler.runAfter(
				0,
				internal.automationExecutor.failStaleTestRuns,
				{
					cursorTriggeredAt: candidates[candidates.length - 1].triggeredAt,
					pass: pass + 1,
				}
			);
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
	args: {
		cursorTriggeredAt: v.optional(v.number()),
		pass: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<{ failed: number }> => {
		const now = Date.now();
		const cutoff = now - STALE_PRODUCTION_RUN_MS;
		const pass = args.pass ?? 0;
		// resumeAt >= triggeredAt always (wake times are computed at park time),
		// so triggeredAt < cutoff catches both shapes in one indexed read.
		// Status-partitioned range lands directly on "running" rows; scanning
		// by_triggeredAt walks the far larger population of old terminal rows.
		const candidates = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_status_triggeredAt", (q) =>
				q
					.eq("status", "running")
					.gt("triggeredAt", args.cursorTriggeredAt ?? -1)
					.lt("triggeredAt", cutoff)
			)
			.take(WATCHDOG_BATCH_SIZE);

		let failed = 0;
		for (const execution of candidates) {
			if (execution.mode === "test") continue;
			const resume = execution.resumeState;
			// Parked with the wake still ahead (or recently passed): leave it be.
			if (resume && resume.resumeAt >= cutoff) continue;

			const attemptCount = execution.attemptCount ?? 0;
			// A parked run with a resume checkpoint and attempts left is a missed
			// wake, not a dead run — reschedule instead of failing it. Bump
			// resumeAt so this same row isn't picked up again by the next sweep;
			// checkpointAt stays put so resumeExecution's own pausedMs math still
			// accounts for the full stall once it actually fires.
			if (resume && attemptCount < 3) {
				await ctx.db.patch(execution._id, {
					attemptCount: attemptCount + 1,
					resumeState: { ...resume, resumeAt: now },
				});
				await ctx.scheduler.runAfter(
					0,
					internal.automationExecutor.resumeExecution,
					{
						orgId: execution.orgId,
						executionId: execution._id,
						automationId: execution.automationId,
					}
				);
				continue;
			}

			// No resumeState and nothing executed yet: the very first mutation
			// (executeAutomation) never committed — a dropped runAfter(0) hop, not
			// a walk that made progress and got stuck. Mutations are atomic, so
			// zero nodesExecuted means the original invocation wrote nothing;
			// re-driving from startArgs duplicates nothing. Only possible for
			// event-driven runs (matchAndScheduleAutomations stamps startArgs);
			// manual/scheduled runs fall through to the terminal-fail path below.
			if (
				!resume &&
				execution.nodesExecuted.length === 0 &&
				execution.startArgs &&
				attemptCount < 3
			) {
				await ctx.db.patch(execution._id, {
					attemptCount: attemptCount + 1,
				});
				await ctx.scheduler.runAfter(
					0,
					internal.automationExecutor.executeAutomation,
					{
						orgId: execution.orgId,
						executionId: execution._id,
						automationId: execution.automationId,
						objectType: execution.startArgs.objectType,
						objectId: execution.startArgs.objectId,
						eventOldValue: execution.startArgs.eventOldValue,
						eventNewValue: execution.startArgs.eventNewValue,
						executionChain: execution.executionChain ?? [
							execution.automationId,
						],
						// Row stores the pre-increment depth; the original schedule passed +1.
						recursionDepth: (execution.recursionDepth ?? 0) + 1,
					}
				);
				continue;
			}

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

		// Cursor on row position, not work done: a full page of legitimately
		// parked runs must not stall the sweep. Rows sharing the last row's exact
		// triggeredAt ms are passed over by the exclusive `gt` bound and are
		// picked up by the next cron tick, which starts from scratch.
		if (
			candidates.length === WATCHDOG_BATCH_SIZE &&
			pass + 1 < MAX_WATCHDOG_PASSES
		) {
			await ctx.scheduler.runAfter(
				0,
				internal.automationExecutor.failStaleProductionRuns,
				{
					cursorTriggeredAt: candidates[candidates.length - 1].triggeredAt,
					pass: pass + 1,
				}
			);
		}
		return { failed };
	},
});

/** Exposed for tests; not part of the public API. */
export const __testUtils = { resolveMemberUserIds };
