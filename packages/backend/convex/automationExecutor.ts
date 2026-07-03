import {
	internalMutation,
	internalQuery,
	MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { AggregateHelpers } from "./lib/aggregates";
import { systemMutation } from "./lib/factories";
import {
	evaluateConditionGroups,
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

/**
 * Execute a single automation workflow
 */
export const executeAutomation = systemMutation({
	args: {
		executionId: v.id("workflowExecutions"),
		automationId: v.id("workflowAutomations"),
		objectType: v.union(
			v.literal("client"),
			v.literal("project"),
			v.literal("quote"),
			v.literal("invoice"),
			v.literal("task")
		),
		objectId: v.string(),
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
				nodes: automation.nodes.map((n) => ({
					id: n.id,
					type: n.type,
					action: n.action,
					nextNodeId: n.nextNodeId,
				})),
				recursionDepth: args.recursionDepth,
			}
		);

		// Get the triggering object
		const triggerObject = await getObject(
			ctx,
			args.objectType,
			args.objectId,
			automation.orgId
		);
		if (!triggerObject) {
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				error: "Triggering object not found",
			});
			return;
		}

		const nodesExecuted: Doc<"workflowExecutions">["nodesExecuted"] = [];

		try {
			// Start with the first node
			if (automation.nodes.length === 0) {
				await ctx.db.patch(args.executionId, {
					status: "completed",
					completedAt: Date.now(),
					nodesExecuted: [],
				});
				return;
			}

			let currentNodeId: string | undefined = automation.nodes[0].id;

			// Guard against cyclic node graphs (writes reject them, but stored
			// rows may predate that validation) — the walk must terminate.
			const visitedNodeIds = new Set<string>();

			// Execute nodes in sequence
			while (currentNodeId) {
				if (visitedNodeIds.has(currentNodeId)) {
					await ctx.db.patch(args.executionId, {
						status: "failed",
						completedAt: Date.now(),
						nodesExecuted,
						error: `Workflow contains a cycle through node "${currentNodeId}"`,
					});
					return;
				}
				visitedNodeIds.add(currentNodeId);

				const node = automation.nodes.find((n) => n.id === currentNodeId);
				if (!node) {
					console.warn(
						`[AutomationExecutor] Node ${currentNodeId} not found in automation ${args.automationId}`
					);
					break;
				}

				console.log(
					`[AutomationExecutor] Processing node ${node.id} (${node.type})`,
					{
						automationId: args.automationId,
						action: node.action,
						condition: node.condition,
					}
				);

				const result = await executeNode(
					ctx,
					node,
					args.objectType,
					args.objectId,
					triggerObject,
					automation.orgId,
					args.executionChain ?? [],
					args.recursionDepth ?? 0
				);

				console.log(`[AutomationExecutor] Node ${node.id} result:`, {
					success: result.success,
					skipped: result.skipped,
					error: result.error,
				});

				nodesExecuted.push({
					nodeId: node.id,
					result: result.success
						? "success"
						: result.skipped
						? "skipped"
						: "failed",
					error: result.error,
				});

				if (!result.success && !result.skipped) {
					// Node failed, stop execution
					await ctx.db.patch(args.executionId, {
						status: "failed",
						completedAt: Date.now(),
						nodesExecuted,
						error: result.error,
					});
					return;
				}

				// Determine next node
				if (node.type === "condition") {
					// Condition node: follow yes or no branch
					currentNodeId = result.conditionMet
						? node.nextNodeId
						: node.elseNodeId;
				} else {
					// Action node: follow next
					currentNodeId = node.nextNodeId;
				}
			}

			// Update automation trigger stats
			await ctx.db.patch(args.automationId, {
				lastTriggeredAt: Date.now(),
				triggerCount: (automation.triggerCount || 0) + 1,
			});

			// Execution completed successfully
			await ctx.db.patch(args.executionId, {
				status: "completed",
				completedAt: Date.now(),
				nodesExecuted,
			});
		} catch (error) {
			await ctx.db.patch(args.executionId, {
				status: "failed",
				completedAt: Date.now(),
				nodesExecuted,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	},
});

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
 * Execute a single node
 */
async function executeNode(
	ctx: MutationCtx,
	node: AutomationNode,
	objectType: ObjectType,
	objectId: string,
	triggerObject: Record<string, unknown>,
	orgId: Id<"organizations">,
	executionChain: Id<"workflowAutomations">[],
	recursionDepth: number
): Promise<{
	success: boolean;
	skipped?: boolean;
	conditionMet?: boolean;
	error?: string;
}> {
	// v2 nodes carry a discriminated `config`; legacy rows (pre-migration)
	// only have `condition`/`action` and fall through below.
	if (node.config) {
		return executeNodeV2(
			ctx,
			node.config,
			objectType,
			objectId,
			triggerObject,
			orgId,
			executionChain,
			recursionDepth
		);
	}

	if (node.type === "condition") {
		return executeConditionNode(node, triggerObject);
	} else if (node.type === "action") {
		return executeActionNode(
			ctx,
			node,
			objectType,
			objectId,
			triggerObject,
			orgId,
			executionChain,
			recursionDepth
		);
	}

	return { success: false, error: "Unknown node type" };
}

/**
 * Execute a v2 node from its discriminated `config`. Only `condition` and
 * `action` (update_field) are implemented; the rest land in Slice 3.
 */
async function executeNodeV2(
	ctx: MutationCtx,
	config: WorkflowNodeConfig,
	objectType: ObjectType,
	objectId: string,
	triggerObject: Record<string, unknown>,
	orgId: Id<"organizations">,
	executionChain: Id<"workflowAutomations">[],
	recursionDepth: number
): Promise<{
	success: boolean;
	skipped?: boolean;
	conditionMet?: boolean;
	error?: string;
}> {
	switch (config.kind) {
		case "condition": {
			if (config.source && typeof config.source === "object") {
				// Loop-scoped conditions need a loop node's item scope, which
				// doesn't exist until loop nodes are implemented.
				return {
					success: false,
					error:
						"Loop-scoped conditions are not yet enabled (lands in Slice 3).",
				};
			}
			const scope: VariableScope = { trigger: { record: triggerObject } };
			const conditionMet = evaluateConditionGroups(
				config.logic,
				config.groups,
				triggerObject,
				scope
			);
			return { success: true, conditionMet };
		}
		case "action":
			return executeActionNodeV2(
				ctx,
				config.action,
				objectType,
				objectId,
				triggerObject,
				orgId,
				executionChain,
				recursionDepth
			);
		case "fetch_records":
		case "loop":
		case "delay":
		case "delay_until":
		case "end":
			return {
				success: false,
				error: `Node kind "${config.kind}" is not yet enabled (lands in Slice 3).`,
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

/**
 * Execute a v2 action config. Only `update_field` is implemented; the other
 * action types (create_task / send_notification / send_team_message) land
 * in Slice 3.
 */
async function executeActionNodeV2(
	ctx: MutationCtx,
	action: AutomationAction,
	objectType: ObjectType,
	objectId: string,
	triggerObject: Record<string, unknown>,
	orgId: Id<"organizations">,
	executionChain: Id<"workflowAutomations">[],
	recursionDepth: number
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
	if (action.type !== "update_field") {
		return {
			success: false,
			error: `Action type "${action.type}" is not yet enabled (lands in Slice 3).`,
		};
	}

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

	const scope: VariableScope = { trigger: { record: triggerObject } };
	const rawValue = resolveValueRef(action.value, scope);
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
