import {
	internalMutation,
	internalQuery,
	MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { AggregateHelpers } from "./lib/aggregates";

/**
 * Automation Execution Engine
 *
 * Handles finding matching automations and executing their workflows asynchronously.
 *
 * Event-Driven Architecture:
 * - Subscribes to "entity.status_changed" events from the event bus
 * - Publishes "automation.triggered", "automation.completed", "automation.failed" events
 * - Decoupled from entity mutations for better maintainability
 *
 * See: https://stack.convex.dev/event-driven-programming
 */

// Type definitions
type ObjectType = "client" | "project" | "quote" | "invoice" | "task";
type AutomationNode = Doc<"workflowAutomations">["nodes"][number];

// Status types for each object type
const OBJECT_STATUS_MAP = {
	client: ["lead", "prospect", "active", "inactive", "archived"],
	project: ["planned", "in-progress", "completed", "cancelled"],
	quote: ["draft", "sent", "approved", "declined", "expired"],
	invoice: ["draft", "sent", "paid", "overdue", "cancelled"],
	task: ["pending", "in-progress", "completed", "cancelled"],
} as const;

/**
 * Find all active automations that match a trigger event
 */
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
		fromStatus: v.string(),
		toStatus: v.string(),
	},
	handler: async (ctx, args) => {
		// Get all active automations for the org
		const automations = await ctx.db
			.query("workflowAutomations")
			.withIndex("by_org_active", (q) =>
				q.eq("orgId", args.orgId).eq("isActive", true)
			)
			.collect();

		// Filter to those matching this trigger
		return automations.filter((automation) => {
			const trigger = automation.trigger;

			// Must match object type
			if (trigger.objectType !== args.objectType) {
				return false;
			}

			// Must match target status
			if (trigger.toStatus !== args.toStatus) {
				return false;
			}

			// If fromStatus is specified, must match
			if (trigger.fromStatus && trigger.fromStatus !== args.fromStatus) {
				return false;
			}

			return true;
		});
	},
});

// Configuration constants for safety limits
const MAX_RECURSION_DEPTH = 5; // Max chain of automations triggering each other
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_EXECUTIONS_PER_WINDOW = 100; // Max executions per org per minute

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
export const handleStatusChangeEvent = internalMutation({
	args: {
		eventId: v.id("domainEvents"),
		orgId: v.id("organizations"),
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
	handler: async (ctx, args) => {
		// Get execution context (for cascading automations)
		const currentDepth = args.recursionDepth ?? 0;
		const currentChain = (args.executionChain ??
			[]) as Id<"workflowAutomations">[];

		// Check recursion depth limit
		if (currentDepth >= MAX_RECURSION_DEPTH) {
			console.warn(
				`Automation recursion limit reached (depth: ${currentDepth}) for org ${args.orgId}. ` +
					`Chain: ${currentChain.join(" → ")}`
			);
			return { triggered: 0, recursionLimited: true };
		}

		// Find matching automations
		const automations = await ctx.runQuery(
			internal.automationExecutor.findMatchingAutomations,
			{
				orgId: args.orgId,
				objectType: args.entityType,
				fromStatus: args.fromStatus,
				toStatus: args.toStatus,
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
				q.eq("orgId", args.orgId).gte("triggeredAt", oneMinuteAgo)
			)
			.collect();

		if (recentExecutions.length >= MAX_EXECUTIONS_PER_WINDOW) {
			console.warn(
				`Automation rate limit reached for org ${args.orgId}. ` +
					`${recentExecutions.length} executions in the last minute.`
			);
			return { triggered: 0, rateLimited: true };
		}

		let triggered = 0;

		// Schedule execution for each matching automation
		for (const automation of automations) {
			// Check if this automation is already in the chain (prevent loops)
			if (currentChain.includes(automation._id)) {
				console.warn(
					`Automation loop detected: ${automation._id} already in chain. Skipping.`
				);
				// Log as skipped
				await ctx.db.insert("workflowExecutions", {
					orgId: args.orgId,
					automationId: automation._id,
					triggeredBy: args.entityId,
					triggeredAt: Date.now(),
					status: "skipped",
					nodesExecuted: [],
					error: "Skipped: Automation loop detected",
					executionChain: currentChain,
					recursionDepth: currentDepth,
				});
				continue;
			}

			// Build new execution chain
			const newChain = [...currentChain, automation._id];

			// Create execution log entry with event correlation
			const executionId = await ctx.db.insert("workflowExecutions", {
				orgId: args.orgId,
				automationId: automation._id,
				triggeredBy: args.entityId,
				triggeredAt: Date.now(),
				status: "running",
				nodesExecuted: [],
				executionChain: newChain,
				recursionDepth: currentDepth,
			});

			// Publish automation.triggered event for monitoring
			await ctx.db.insert("domainEvents", {
				orgId: args.orgId,
				eventType: "automation.triggered",
				eventSource: "automationExecutor.handleStatusChangeEvent",
				payload: {
					entityType: args.entityType,
					entityId: args.entityId,
					metadata: {
						automationId: automation._id,
						automationName: automation.name,
						executionId,
						isCascade: currentDepth > 0,
					},
				},
				status: "processed", // Informational event, already processed
				processedAt: Date.now(),
				correlationId: args.correlationId,
				causationId: args.eventId,
				createdAt: Date.now(),
			});

			// Schedule async execution with chain context
			await ctx.scheduler.runAfter(
				0,
				internal.automationExecutor.executeAutomation,
				{
					executionId,
					automationId: automation._id,
					objectType: args.entityType,
					objectId: args.entityId,
					executionChain: newChain,
					recursionDepth: currentDepth + 1,
				}
			);

			triggered++;
		}

		return { triggered };
	},
});

/**
 * Execute a single automation workflow
 */
export const executeAutomation = internalMutation({
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
		const triggerObject = await getObject(ctx, args.objectType, args.objectId);
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

			// Execute nodes in sequence
			while (currentNodeId) {
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
 * Get an object by type and ID
 */
async function getObject(
	ctx: MutationCtx,
	objectType: ObjectType,
	objectId: string
): Promise<
	| Doc<"clients">
	| Doc<"projects">
	| Doc<"quotes">
	| Doc<"invoices">
	| Doc<"tasks">
	| null
> {
	switch (objectType) {
		case "client":
			return await ctx.db.get(objectId as Id<"clients">);
		case "project":
			return await ctx.db.get(objectId as Id<"projects">);
		case "quote":
			return await ctx.db.get(objectId as Id<"quotes">);
		case "invoice":
			return await ctx.db.get(objectId as Id<"invoices">);
		case "task":
			return await ctx.db.get(objectId as Id<"tasks">);
		default:
			return null;
	}
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

	// Validate the new status is valid for the target type
	const validStatuses = OBJECT_STATUS_MAP[targetInfo.type] as readonly string[];
	if (!validStatuses.includes(newStatus)) {
		return {
			success: false,
			error: `Invalid status "${newStatus}" for ${targetInfo.type}`,
		};
	}

	// Get the current status before update (for triggering cascading automations)
	const targetObject = await getObject(ctx, targetInfo.type, targetInfo.id);
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

		// IMPORTANT: Update aggregates to keep them in sync with direct database patches
		// This prevents "key not found" errors when entities are later deleted or updated
		if (oldStatus && oldStatus !== newStatus) {
			const updatedObject = await getObject(
				ctx,
				targetInfo.type,
				targetInfo.id
			);
			if (updatedObject && targetObject) {
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
				eventSource: "automationExecutor.executeActionNode",
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
				.filter((q) =>
					q.and(
						q.lt(q.field("triggeredAt"), cutoffTime),
						q.neq(q.field("status"), "running")
					)
				)
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
