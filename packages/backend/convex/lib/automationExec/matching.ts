import { MutationCtx } from "../../_generated/server";
import { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { rateLimiter } from "../../rateLimits";
import type { VariableScope } from "../conditionEval";
import type { AutomationTrigger, FormulaResource } from "../workflowTypes";
import type { AutomationDoc, AutomationNode, ObjectType } from "./types";

/**
 * The definition a run executes: the published snapshot when present,
 * otherwise the working copy (unmigrated legacy rows).
 */
export function executableDefinition(automation: AutomationDoc): {
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
 * timezone; event triggers use the org timezone (auto-detected at onboarding,
 * editable in org settings), falling back to UTC for orgs that never set one.
 */
export function automationFormulaTz(
	trigger: AutomationTrigger,
	orgTimezone: string | undefined
): string {
	if ("type" in trigger && trigger.type === "scheduled") {
		return trigger.schedule.timezone;
	}
	return orgTimezone ?? "UTC";
}

/** Extract a user id from a "manual:"/"test:"/"actor:" triggeredBy marker. */
export function parseActorUserId(
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
export function deriveTriggerEventValues(trigger: AutomationTrigger): {
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
export async function buildGlobalsScope(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	nowMs: number,
	trigger: AutomationTrigger,
	triggeredBy: string,
	run: NonNullable<VariableScope["run"]>
): Promise<Pick<VariableScope, "workflow" | "org" | "user" | "run">> {
	const org = await ctx.db.get(orgId);
	const globals: Pick<VariableScope, "workflow" | "org" | "user" | "run"> = {
		workflow: { now: nowMs, tz: automationFormulaTz(trigger, org?.timezone) },
		run,
	};
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
export function runMetadata(
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

// Configuration constants for safety limits
const MAX_RECURSION_DEPTH = 5; // Max chain of automations triggering each other
export const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
export const MAX_EXECUTIONS_PER_WINDOW = 100; // Max executions per org per minute

export type MatchAndScheduleResult = {
	triggered: number;
	recursionLimited?: boolean;
	rateLimited?: boolean;
};

export type MatchAndScheduleParams = {
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
export async function matchAndScheduleAutomations(
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

	// "actor:<userId>" lets buildGlobalsScope resolve user.* globals on
	// event-triggered runs; falls back to the entity id when no internal user
	// caused the event (webhooks, portal actions).
	const triggeredBy = params.actorUserId
		? `actor:${params.actorUserId}`
		: params.entityId;

	// Loop-detected automations are logged as skipped immediately and never
	// count toward the rate limit or the dedupe-filtered candidate set below.
	const candidates: { automation: AutomationDoc; dedupeKey: string }[] = [];
	for (const automation of automations) {
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
		candidates.push({
			automation,
			// WS2c: dedupes a re-dispatch caused by eventBus retrying a failed
			// domainEvent (attemptCount retry re-invoking handleStatusChangeEvent/
			// handleRecordEvent for the same event).
			dedupeKey: `${params.eventId}:${automation._id}`,
		});
	}

	// Drop candidates that already have an execution row for this exact
	// event + automation pair — a duplicate re-dispatch, not a new run.
	const remaining: { automation: AutomationDoc; dedupeKey: string }[] = [];
	for (const candidate of candidates) {
		const existing = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_org_dedupeKey", (q) =>
				q.eq("orgId", orgId).eq("dedupeKey", candidate.dedupeKey)
			)
			.first();
		if (existing) continue;
		remaining.push(candidate);
	}

	if (remaining.length === 0) {
		return { triggered: 0 };
	}

	// Rate limiting check: consumes one unit per run about to start, applied
	// after loop/dedupe filtering so duplicate re-dispatches don't burn quota.
	const limit = await rateLimiter.limit(ctx, "automationRunStarts", {
		key: orgId,
		count: remaining.length,
	});
	if (!limit.ok) {
		console.warn(
			`Automation rate limit reached for org ${orgId}. ` +
				`${remaining.length} run(s) requested this dispatch.`
		);
		return { triggered: 0, rateLimited: true };
	}

	let triggered = 0;

	// Schedule execution for each matching automation
	for (const { automation, dedupeKey } of remaining) {
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
			dedupeKey,
			// Mirrors the executeAutomation args scheduled below — lets the
			// watchdog re-drive this run from scratch if its first mutation
			// never committed.
			startArgs: {
				objectType: params.entityType,
				objectId: params.entityId,
				eventOldValue: params.fromStatus,
				eventNewValue: params.toStatus,
			},
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

/** Max scheduled automations dispatched per cron tick. */
export const SCHEDULED_DISPATCH_BATCH = 50;
