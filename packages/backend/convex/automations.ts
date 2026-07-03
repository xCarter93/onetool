import { QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import { userMutation, userQuery } from "./lib/factories";
import {
	AUTOMATION_OBJECT_TYPES,
	MAX_CONDITION_GROUPS,
	MAX_FETCH_LIMIT,
	MAX_RULES_PER_GROUP,
	VALUELESS_OPERATORS,
	nodeConfigValidator,
	nodeTypeValidator,
	recordCreatedTriggerValidator,
	recordUpdatedTriggerValidator,
	scheduledTriggerValidator,
	statusChangedTriggerValidator,
	type AutomationObjectType,
	type AutomationTrigger,
	type WorkflowNodeConfig,
} from "./lib/workflowTypes";
import {
	RELATED_OBJECTS,
	getFieldDefinition,
	getStatusOptions,
	operatorsForField,
} from "./lib/fieldRegistry";
import { computeNextRunAt, validateSchedule } from "./lib/schedule";

/**
 * Workflow Automation operations with embedded CRUD helpers
 * All automation-specific logic lives in this file for better organization
 */

// Type definitions
type AutomationDocument = Doc<"workflowAutomations">;
type AutomationId = Id<"workflowAutomations">;

// v2-only trigger validator for create/update args (legacy + email_received
// shapes remain readable from storage but can no longer be written).
const triggerArgValidator = v.union(
	statusChangedTriggerValidator,
	recordCreatedTriggerValidator,
	recordUpdatedTriggerValidator,
	scheduledTriggerValidator
);

// v2-only node validator for create/update args: `config` is required and the
// legacy condition/action/fetchConfig/loopConfig fields are not accepted.
const nodeArgValidator = v.object({
	id: v.string(),
	type: nodeTypeValidator,
	config: nodeConfigValidator,
	nextNodeId: v.optional(v.string()),
	elseNodeId: v.optional(v.string()),
	bodyStartNodeId: v.optional(v.string()),
	position: v.optional(v.object({ x: v.number(), y: v.number() })),
});

type NodeArg = {
	id: string;
	type: Doc<"workflowAutomations">["nodes"][number]["type"];
	config: WorkflowNodeConfig;
	nextNodeId?: string;
	elseNodeId?: string;
	bodyStartNodeId?: string;
	position?: { x: number; y: number };
};

// Automation-specific helper functions

/**
 * Get an automation by ID with organization validation
 */
async function getAutomationWithOrgValidation(
	ctx: QueryCtx | MutationCtx,
	id: AutomationId
): Promise<AutomationDocument | null> {
	const userOrgId = await getCurrentUserOrgId(ctx);
	const automation = await ctx.db.get(id);

	if (!automation) {
		return null;
	}

	if (automation.orgId !== userOrgId) {
		throw new Error("Automation does not belong to your organization");
	}

	return automation;
}

/**
 * Get an automation by ID, throwing if not found
 */
async function getAutomationOrThrow(
	ctx: QueryCtx | MutationCtx,
	id: AutomationId
): Promise<AutomationDocument> {
	const automation = await getAutomationWithOrgValidation(ctx, id);
	if (!automation) {
		throw new Error("Automation not found");
	}
	return automation;
}

/**
 * Effective lifecycle status, tolerating unmigrated legacy rows.
 */
export function effectiveStatus(
	automation: Pick<AutomationDocument, "status" | "isActive">
): "draft" | "active" | "paused" {
	if (automation.status) return automation.status;
	return automation.isActive ? "active" : "draft";
}

function validateTrigger(trigger: AutomationTrigger): void {
	if (!("type" in trigger)) {
		throw new Error("Legacy triggers can no longer be written");
	}
	switch (trigger.type) {
		case "status_changed": {
			if (!trigger.toStatus.trim()) {
				throw new Error("Trigger status is required");
			}
			const statuses = getStatusOptions(trigger.objectType).map(
				(o) => o.value
			);
			if (statuses.length > 0 && !statuses.includes(trigger.toStatus)) {
				throw new Error(
					`"${trigger.toStatus}" is not a valid ${trigger.objectType} status`
				);
			}
			if (
				trigger.fromStatus &&
				statuses.length > 0 &&
				!statuses.includes(trigger.fromStatus)
			) {
				throw new Error(
					`"${trigger.fromStatus}" is not a valid ${trigger.objectType} status`
				);
			}
			break;
		}
		case "record_updated": {
			for (const field of trigger.fields ?? []) {
				if (!getFieldDefinition(trigger.objectType, field)) {
					throw new Error(
						`Unknown field "${field}" for ${trigger.objectType}`
					);
				}
			}
			break;
		}
		case "scheduled": {
			// Includes IANA-timezone validation, so a stored schedule can never
			// make computeNextRunAt throw in the dispatcher.
			const error = validateSchedule(trigger.schedule);
			if (error) {
				throw new Error(error);
			}
			break;
		}
		case "record_created":
			break;
		default:
			throw new Error("Unsupported trigger type");
	}
}

function triggerObjectType(
	trigger: AutomationTrigger
): AutomationObjectType | undefined {
	if ("objectType" in trigger && trigger.objectType) {
		return trigger.objectType;
	}
	return undefined;
}

function validateConditionGroups(
	nodeId: string,
	groups: { logic: "and" | "or"; rules: { field: string; operator: string; value?: unknown }[] }[],
	objectType: AutomationObjectType | undefined,
	context: string
): void {
	if (groups.length > MAX_CONDITION_GROUPS) {
		throw new Error(
			`Node ${nodeId}: at most ${MAX_CONDITION_GROUPS} ${context} groups allowed`
		);
	}
	for (const group of groups) {
		if (group.rules.length > MAX_RULES_PER_GROUP) {
			throw new Error(
				`Node ${nodeId}: at most ${MAX_RULES_PER_GROUP} rules per group allowed`
			);
		}
		for (const rule of group.rules) {
			if (!rule.field.trim()) {
				throw new Error(`Node ${nodeId}: rule is missing a field`);
			}
			if (objectType) {
				const def = getFieldDefinition(objectType, rule.field);
				if (!def) {
					throw new Error(
						`Node ${nodeId}: unknown field "${rule.field}" for ${objectType}`
					);
				}
				const operators = operatorsForField(objectType, rule.field);
				if (!operators.includes(rule.operator as never)) {
					throw new Error(
						`Node ${nodeId}: operator "${rule.operator}" is not valid for field "${rule.field}"`
					);
				}
			}
			const valueless = (VALUELESS_OPERATORS as readonly string[]).includes(
				rule.operator
			);
			if (!valueless && rule.value === undefined) {
				throw new Error(
					`Node ${nodeId}: operator "${rule.operator}" requires a value`
				);
			}
		}
	}
}

function validateUpdateFieldAction(
	nodeId: string,
	action: Extract<
		Extract<WorkflowNodeConfig, { kind: "action" }>["action"],
		{ type: "update_field" }
	>,
	scopeObjectType: AutomationObjectType | undefined
): void {
	if (!scopeObjectType) return;

	let targetObjectType: AutomationObjectType = scopeObjectType;
	if (typeof action.target === "object") {
		if (!RELATED_OBJECTS[scopeObjectType].includes(action.target.related)) {
			throw new Error(
				`Node ${nodeId}: ${scopeObjectType} records have no related ${action.target.related}`
			);
		}
		targetObjectType = action.target.related;
	}

	const def = getFieldDefinition(targetObjectType, action.field);
	if (!def) {
		throw new Error(
			`Node ${nodeId}: unknown field "${action.field}" for ${targetObjectType}`
		);
	}
	if (!def.writable) {
		throw new Error(
			`Node ${nodeId}: field "${action.field}" cannot be updated${def.writeExclusionReason ? ` (${def.writeExclusionReason})` : ""}`
		);
	}
	const value = action.value;
	if (
		def.type === "select" &&
		value.kind === "static" &&
		typeof value.value === "string" &&
		def.options &&
		!def.options.some((o) => o.value === value.value)
	) {
		throw new Error(
			`Node ${nodeId}: "${String(value.value)}" is not a valid value for "${action.field}"`
		);
	}
}

/**
 * Full structural validation of a workflow definition. Used on every write;
 * activation additionally requires at least one node (see validateForActivation).
 */
function validateWorkflowDefinition(
	trigger: AutomationTrigger,
	nodes: NodeArg[]
): void {
	validateTrigger(trigger);

	const objectType = triggerObjectType(trigger);
	const nodeIds = new Set(nodes.map((n) => n.id));
	if (nodeIds.size !== nodes.length) {
		throw new Error("Node ids must be unique");
	}

	for (const node of nodes) {
		const config = node.config;
		const expectedKind = node.type;
		if (config.kind !== expectedKind) {
			throw new Error(
				`Node ${node.id}: config kind "${config.kind}" does not match node type "${node.type}"`
			);
		}

		for (const ref of [
			node.nextNodeId,
			node.elseNodeId,
			node.bodyStartNodeId,
		]) {
			if (ref !== undefined) {
				if (!nodeIds.has(ref)) {
					throw new Error(
						`Node ${node.id}: references missing node "${ref}"`
					);
				}
				if (ref === node.id) {
					throw new Error(`Node ${node.id}: references itself`);
				}
			}
		}

		switch (config.kind) {
			case "condition": {
				// Conditions sourced from a loop item are validated against the
				// loop's fetch object type when resolvable.
				let source: AutomationObjectType | undefined = objectType;
				if (config.source && typeof config.source === "object") {
					const loopNode = nodes.find(
						(n) =>
							n.id ===
							(config.source as { loopNodeId: string }).loopNodeId
					);
					source = undefined;
					const loopConfig = loopNode?.config;
					if (loopConfig?.kind === "loop") {
						const fetchNode = nodes.find(
							(n) => n.id === loopConfig.sourceNodeId
						);
						if (fetchNode?.config.kind === "fetch_records") {
							source = fetchNode.config.objectType;
						}
					}
				}
				validateConditionGroups(node.id, config.groups, source, "condition");
				break;
			}
			case "action": {
				if (config.action.type === "update_field") {
					validateUpdateFieldAction(node.id, config.action, objectType);
				}
				if (
					config.action.type === "send_notification" &&
					!config.action.message.trim()
				) {
					throw new Error(`Node ${node.id}: notification message is required`);
				}
				if (config.action.type === "send_team_message") {
					if (!config.action.message.trim()) {
						throw new Error(`Node ${node.id}: message is required`);
					}
					if (
						typeof config.action.recipients === "object" &&
						config.action.recipients.userIds.length === 0
					) {
						throw new Error(
							`Node ${node.id}: pick at least one recipient`
						);
					}
				}
				break;
			}
			case "fetch_records": {
				if (
					config.limit !== undefined &&
					(config.limit < 1 || config.limit > MAX_FETCH_LIMIT)
				) {
					throw new Error(
						`Node ${node.id}: fetch limit must be between 1 and ${MAX_FETCH_LIMIT}`
					);
				}
				validateConditionGroups(
					node.id,
					config.filters,
					config.objectType,
					"filter"
				);
				break;
			}
			case "loop": {
				const source = nodes.find((n) => n.id === config.sourceNodeId);
				if (!source || source.config.kind !== "fetch_records") {
					throw new Error(
						`Node ${node.id}: loops must reference a "Find records" node`
					);
				}
				break;
			}
			case "delay": {
				if (config.amount < 1) {
					throw new Error(`Node ${node.id}: delay must be at least 1`);
				}
				break;
			}
			case "delay_until":
			case "end":
				break;
		}
	}

	// Reject cycles across nextNodeId/elseNodeId/bodyStartNodeId — the
	// executor walks these links and must terminate. (The builder UI cannot
	// produce cycles; this guards direct API writes.)
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const state = new Map<string, "visiting" | "done">();
	const visit = (id: string): void => {
		const seen = state.get(id);
		if (seen === "done") return;
		if (seen === "visiting") {
			throw new Error(`Workflow contains a cycle through node "${id}"`);
		}
		state.set(id, "visiting");
		const node = byId.get(id);
		for (const ref of [
			node?.nextNodeId,
			node?.elseNodeId,
			node?.bodyStartNodeId,
		]) {
			if (ref !== undefined) visit(ref);
		}
		state.set(id, "done");
	};
	for (const node of nodes) visit(node.id);
}

function validateForActivation(
	trigger: AutomationTrigger,
	nodes: NodeArg[]
): void {
	validateWorkflowDefinition(trigger, nodes);
	if (nodes.length === 0) {
		throw new Error("Add at least one step before activating");
	}
}

/**
 * Build the published snapshot from the working copy.
 */
function buildSnapshot(
	automation: Pick<AutomationDocument, "trigger" | "nodes" | "publishedSnapshot">
): NonNullable<AutomationDocument["publishedSnapshot"]> {
	return {
		trigger: automation.trigger,
		nodes: automation.nodes,
		version: (automation.publishedSnapshot?.version ?? 0) + 1,
		publishedAt: Date.now(),
	};
}

/**
 * Next due time for an automation as it will execute: set only while active
 * with a scheduled trigger, cleared (undefined) otherwise. Patching
 * `nextRunAt: undefined` removes the field, which keeps the row out of the
 * dispatcher's by_status_nextRunAt range.
 */
function scheduledNextRunAt(
	trigger: AutomationTrigger,
	active: boolean
): number | undefined {
	if (!active || !("type" in trigger) || trigger.type !== "scheduled") {
		return undefined;
	}
	return computeNextRunAt(trigger.schedule, Date.now());
}

/**
 * Get all automations for the current user's organization
 */
export const list = userQuery({
	args: {},
	handler: async (ctx): Promise<AutomationDocument[]> => {
		const userOrgId = await getCurrentUserOrgId(ctx);

		const automations = await ctx.db
			.query("workflowAutomations")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		// Sort by name alphabetically
		return automations.sort((a, b) => a.name.localeCompare(b.name));
	},
});

/**
 * Get all active automations for the current user's organization
 */
export const listActive = userQuery({
	args: {},
	handler: async (ctx): Promise<AutomationDocument[]> => {
		const userOrgId = await getCurrentUserOrgId(ctx);

		const automations = await ctx.db
			.query("workflowAutomations")
			.withIndex("by_org_active", (q) =>
				q.eq("orgId", userOrgId).eq("isActive", true)
			)
			.collect();

		return automations
			.filter((a) => effectiveStatus(a) === "active")
			.sort((a, b) => a.name.localeCompare(b.name));
	},
});

/**
 * Get a specific automation by ID
 */
export const get = userQuery({
	args: { id: v.id("workflowAutomations") },
	handler: async (ctx, args): Promise<AutomationDocument | null> => {
		return await getAutomationWithOrgValidation(ctx, args.id);
	},
});

/**
 * Create a new automation.
 *
 * Transitional shim: passing isActive=true publishes immediately (snapshot v1).
 * Once the draft/publish UI lands, creation defaults to draft and `publish`
 * is called explicitly.
 */
export const create = userMutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		trigger: triggerArgValidator,
		nodes: v.array(nodeArgValidator),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<AutomationId> => {
		if (!args.name.trim()) {
			throw new Error("Automation name is required");
		}

		const activate = args.isActive ?? false;
		if (activate) {
			validateForActivation(args.trigger, args.nodes);
		} else {
			validateWorkflowDefinition(args.trigger, args.nodes);
		}

		const userOrgId = await getCurrentUserOrgId(ctx);
		const user = await getCurrentUserOrThrow(ctx);
		const now = Date.now();

		return await ctx.db.insert("workflowAutomations", {
			orgId: userOrgId,
			name: args.name.trim(),
			description: args.description?.trim(),
			trigger: args.trigger,
			nodes: args.nodes,
			status: activate ? "active" : "draft",
			// Legacy mirror, kept in sync until post-migration tightening.
			isActive: activate,
			publishedSnapshot: activate
				? {
						trigger: args.trigger,
						nodes: args.nodes,
						version: 1,
						publishedAt: now,
					}
				: undefined,
			nextRunAt: scheduledNextRunAt(args.trigger, activate),
			createdBy: user._id,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/**
 * Update an automation's working copy (and lifecycle, transitionally).
 *
 * Transitional shim: while an automation is active, saving trigger/node
 * changes republishes them immediately so behavior matches the current UI.
 * The draft/publish UI will replace this with explicit `publish` calls.
 */
export const update = userMutation({
	args: {
		id: v.id("workflowAutomations"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
		trigger: v.optional(triggerArgValidator),
		nodes: v.optional(v.array(nodeArgValidator)),
	},
	handler: async (ctx, args): Promise<AutomationId> => {
		const { id, ...updates } = args;
		const automation = await getAutomationOrThrow(ctx, id);

		if (updates.name !== undefined && !updates.name.trim()) {
			throw new Error("Automation name cannot be empty");
		}

		const nextTrigger = updates.trigger ?? automation.trigger;
		const nextNodes = (updates.nodes ?? automation.nodes) as NodeArg[];
		const currentStatus = effectiveStatus(automation);
		const nextActive =
			updates.isActive !== undefined
				? updates.isActive
				: currentStatus === "active";

		if (updates.trigger !== undefined && !("type" in nextTrigger)) {
			throw new Error("Legacy triggers can no longer be written");
		}
		if (updates.trigger !== undefined || updates.nodes !== undefined) {
			if (updates.nodes !== undefined) {
				for (const node of updates.nodes) {
					if (!node.config) {
						throw new Error(`Node ${node.id} is missing its configuration`);
					}
				}
			}
			if (nextActive) {
				validateForActivation(nextTrigger, nextNodes);
			} else {
				validateWorkflowDefinition(nextTrigger, nextNodes);
			}
		} else if (updates.isActive === true && currentStatus !== "active") {
			validateForActivation(nextTrigger, nextNodes);
		}

		const patch: Partial<AutomationDocument> = { updatedAt: Date.now() };

		if (updates.name !== undefined) patch.name = updates.name.trim();
		if (updates.description !== undefined) {
			patch.description = updates.description.trim();
		}
		if (updates.trigger !== undefined) patch.trigger = updates.trigger;
		if (updates.nodes !== undefined) patch.nodes = updates.nodes;

		// Lifecycle handling (transitional save==publish behavior)
		if (nextActive) {
			patch.status = "active";
			patch.isActive = true;
			if (
				updates.trigger !== undefined ||
				updates.nodes !== undefined ||
				currentStatus !== "active"
			) {
				patch.publishedSnapshot = buildSnapshot({
					trigger: nextTrigger,
					nodes: nextNodes,
					publishedSnapshot: automation.publishedSnapshot,
				});
			}
		} else if (updates.isActive === false) {
			// Deactivating: previously-published automations pause, drafts stay drafts.
			patch.status = automation.publishedSnapshot ? "paused" : "draft";
			patch.isActive = false;
		}

		// Keep the dispatch pointer in sync with the trigger that will execute
		// (the snapshot's when published, else the working copy).
		const executingTrigger =
			patch.publishedSnapshot?.trigger ??
			automation.publishedSnapshot?.trigger ??
			nextTrigger;
		patch.nextRunAt = scheduledNextRunAt(executingTrigger, nextActive);

		await ctx.db.patch(id, patch);
		return id;
	},
});

/**
 * Publish the working copy: validate, snapshot, activate.
 */
export const publish = userMutation({
	args: { id: v.id("workflowAutomations") },
	handler: async (ctx, args): Promise<AutomationId> => {
		const automation = await getAutomationOrThrow(ctx, args.id);

		validateForActivation(automation.trigger, automation.nodes as NodeArg[]);

		await ctx.db.patch(args.id, {
			status: "active",
			isActive: true,
			publishedSnapshot: buildSnapshot(automation),
			nextRunAt: scheduledNextRunAt(automation.trigger, true),
			updatedAt: Date.now(),
		});

		return args.id;
	},
});

/**
 * Toggle an automation between active and paused.
 * Activating a draft publishes it (snapshot v1).
 */
export const toggleActive = userMutation({
	args: { id: v.id("workflowAutomations") },
	handler: async (ctx, args): Promise<AutomationId> => {
		const automation = await getAutomationOrThrow(ctx, args.id);
		const status = effectiveStatus(automation);

		if (status === "active") {
			await ctx.db.patch(args.id, {
				status: "paused",
				isActive: false,
				nextRunAt: undefined,
				updatedAt: Date.now(),
			});
		} else {
			validateForActivation(
				automation.trigger,
				automation.nodes as NodeArg[]
			);
			await ctx.db.patch(args.id, {
				status: "active",
				isActive: true,
				publishedSnapshot: buildSnapshot(automation),
				nextRunAt: scheduledNextRunAt(automation.trigger, true),
				updatedAt: Date.now(),
			});
		}

		return args.id;
	},
});

/**
 * Delete an automation (hard delete)
 */
export const remove = userMutation({
	args: { id: v.id("workflowAutomations") },
	handler: async (ctx, args): Promise<AutomationId> => {
		await getAutomationOrThrow(ctx, args.id); // Validate access

		// Also delete associated execution logs
		const executions = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_automation", (q) => q.eq("automationId", args.id))
			.collect();

		for (const execution of executions) {
			await ctx.db.delete(execution._id);
		}

		await ctx.db.delete(args.id);
		return args.id;
	},
});

/**
 * Get execution logs for an automation
 */
export const getExecutions = userQuery({
	args: {
		automationId: v.id("workflowAutomations"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		// Validate access to the automation
		await getAutomationOrThrow(ctx, args.automationId);

		const limit = args.limit ?? 50;

		const executions = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_automation", (q) => q.eq("automationId", args.automationId))
			.order("desc")
			.take(limit);

		return executions;
	},
});
