import { QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrgId, getCurrentUserOrThrow } from "./lib/auth";
import { userMutation, userQuery } from "./lib/factories";
import {
	AUTOMATION_OBJECT_TYPES,
	DELAY_UNIT_MS,
	MAX_CONDITION_GROUPS,
	MAX_DELAY_MS,
	MAX_DUE_IN_DAYS,
	MAX_FETCH_LIMIT,
	MAX_FORMULAS,
	MAX_RULES_PER_GROUP,
	VALUELESS_OPERATORS,
	formulaResourceValidator,
	nodeConfigValidator,
	nodeTypeValidator,
	recordCreatedTriggerValidator,
	recordUpdatedTriggerValidator,
	scheduledTriggerValidator,
	statusChangedTriggerValidator,
	type AutomationObjectType,
	type AutomationTrigger,
	type FormulaResource,
	type WorkflowNodeConfig,
} from "./lib/workflowTypes";
import {
	collectReferencedPaths,
	parseFormula,
	FormulaError,
} from "./lib/formula";
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
/**
 * Map loop-body node ids to the object type their loop iterates (the source
 * fetch node's objectType, or undefined when unresolvable). Bounded by a
 * visited set so it terminates even on cyclic input (cycles are rejected
 * separately).
 */
function computeLoopBodyScopeTypes(
	nodes: NodeArg[]
): Map<string, AutomationObjectType | undefined> {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const bodyScopeType = new Map<string, AutomationObjectType | undefined>();
	for (const loop of nodes) {
		if (loop.config.kind !== "loop") continue;
		const fetchNode = byId.get(loop.config.sourceNodeId);
		const fetchType =
			fetchNode?.config.kind === "fetch_records"
				? fetchNode.config.objectType
				: undefined;
		const stack =
			loop.bodyStartNodeId === undefined ? [] : [loop.bodyStartNodeId];
		const seen = new Set<string>();
		while (stack.length > 0) {
			const id = stack.pop()!;
			if (seen.has(id)) continue;
			seen.add(id);
			bodyScopeType.set(id, fetchType);
			const member = byId.get(id);
			if (member?.nextNodeId !== undefined) stack.push(member.nextNodeId);
			if (member?.elseNodeId !== undefined) stack.push(member.elseNodeId);
		}
	}
	return bodyScopeType;
}

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

	// Loop-body nodes act on the loop's fetched records, not the trigger
	// record — validate their update_field configs against that object type.
	const bodyScopeType = computeLoopBodyScopeTypes(nodes);

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
					const scopeType = bodyScopeType.has(node.id)
						? bodyScopeType.get(node.id)
						: objectType;
					validateUpdateFieldAction(node.id, config.action, scopeType);
				}
				if (config.action.type === "create_task") {
					const title = config.action.title;
					if (
						title.kind === "static" &&
						(title.value === null || String(title.value).trim() === "")
					) {
						throw new Error(`Node ${node.id}: task title is required`);
					}
					const dueInDays = config.action.dueInDays;
					if (
						dueInDays !== undefined &&
						(!Number.isInteger(dueInDays) ||
							dueInDays < 0 ||
							dueInDays > MAX_DUE_IN_DAYS)
					) {
						throw new Error(
							`Node ${node.id}: due date must be 0-${MAX_DUE_IN_DAYS} days out`
						);
					}
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
			case "aggregate": {
				const source = nodes.find((n) => n.id === config.sourceNodeId);
				if (!source || source.config.kind !== "fetch_records") {
					throw new Error(
						`Node ${node.id}: aggregate must reference a "Find records" node`
					);
				}
				const def = getFieldDefinition(source.config.objectType, config.field);
				if (!def) {
					throw new Error(
						`Node ${node.id}: unknown field "${config.field}" for ${source.config.objectType}`
					);
				}
				if (def.type !== "number" && def.type !== "currency") {
					throw new Error(
						`Node ${node.id}: aggregate needs a number or currency field`
					);
				}
				break;
			}
			case "adjust_time": {
				if (!Number.isFinite(config.amount)) {
					throw new Error(
						`Node ${node.id}: adjust-time amount must be a number`
					);
				}
				if (config.base.kind === "static") {
					const raw = config.base.value;
					const parsed =
						typeof raw === "number"
							? raw
							: typeof raw === "string"
								? Date.parse(raw)
								: NaN;
					if (Number.isNaN(parsed)) {
						throw new Error(
							`Node ${node.id}: "Adjust time" base needs a valid date`
						);
					}
				}
				break;
			}
			case "delay": {
				if (!Number.isInteger(config.amount) || config.amount < 1) {
					throw new Error(
						`Node ${node.id}: delay must be a whole number of at least 1`
					);
				}
				if (config.amount * DELAY_UNIT_MS[config.unit] > MAX_DELAY_MS) {
					throw new Error(`Node ${node.id}: delays are capped at 90 days`);
				}
				break;
			}
			case "delay_until": {
				if (config.until.kind === "static") {
					const raw = config.until.value;
					const parsed =
						typeof raw === "number"
							? raw
							: typeof raw === "string"
								? Date.parse(raw)
								: NaN;
					if (Number.isNaN(parsed)) {
						throw new Error(
							`Node ${node.id}: "Delay until" needs a valid date`
						);
					}
				}
				break;
			}
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

	validateLoopBodies(nodes, byId);
}

/**
 * Structural rules for loop bodies (walked from bodyStartNodeId via
 * nextNodeId/elseNodeId):
 * - no nested loops and no delay steps inside a body (the walk engine can't
 *   checkpoint mid-loop);
 * - a node can belong to at most one loop body and must not also be
 *   reachable from the main chain (it would execute twice).
 * Assumes the cycle check above already passed, so walks terminate.
 */
function validateLoopBodies(
	nodes: NodeArg[],
	byId: Map<string, NodeArg>
): void {
	const collectChain = (startId: string | undefined): Set<string> => {
		const found = new Set<string>();
		const stack = startId === undefined ? [] : [startId];
		while (stack.length > 0) {
			const id = stack.pop()!;
			if (found.has(id)) continue;
			const node = byId.get(id);
			if (!node) continue;
			found.add(id);
			// Deliberately not descending into bodyStartNodeId: body membership
			// is per-loop, and nested loops are rejected below anyway.
			if (node.nextNodeId !== undefined) stack.push(node.nextNodeId);
			if (node.elseNodeId !== undefined) stack.push(node.elseNodeId);
		}
		return found;
	};

	const loops = nodes.filter((n) => n.config.kind === "loop");
	if (loops.length === 0) return;

	const bodyOwner = new Map<string, string>();
	for (const loop of loops) {
		const body = collectChain(loop.bodyStartNodeId);
		for (const id of body) {
			const member = byId.get(id)!;
			if (member.config.kind === "loop") {
				throw new Error(
					`Node ${loop.id}: loops cannot contain other loops`
				);
			}
			if (
				member.config.kind === "delay" ||
				member.config.kind === "delay_until"
			) {
				throw new Error(
					`Node ${loop.id}: delay steps aren't supported inside loops`
				);
			}
			const owner = bodyOwner.get(id);
			if (owner !== undefined && owner !== loop.id) {
				throw new Error(
					`Node ${id}: belongs to more than one loop body`
				);
			}
			bodyOwner.set(id, loop.id);
		}
	}

	// Main chain starts at the first node (the executor's entry point).
	const mainChain = collectChain(nodes[0]?.id);
	for (const id of bodyOwner.keys()) {
		if (mainChain.has(id)) {
			throw new Error(
				`Node ${id}: is inside a loop but also reachable outside it`
			);
		}
	}
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
 * Validate an automation's formula resources: structure, unique ids, syntax
 * (each expression must parse), referenced formulas exist, and no reference
 * cycles. Use-site scope enforcement (a formula is only offered where its
 * inputs are in scope) is handled in the builder; at runtime an out-of-scope
 * reference fails the run clearly.
 */
function validateFormulas(formulas: FormulaResource[] | undefined): void {
	if (!formulas || formulas.length === 0) return;
	if (formulas.length > MAX_FORMULAS) {
		throw new Error(`An automation can have at most ${MAX_FORMULAS} formulas`);
	}
	const ids = new Set<string>();
	const refs = new Map<string, string[]>();
	for (const f of formulas) {
		if (!f.id || f.id.includes(".")) {
			throw new Error(
				`Formula id "${f.id}" is invalid (must be non-empty and contain no dots)`
			);
		}
		if (ids.has(f.id)) throw new Error(`Duplicate formula id "${f.id}"`);
		ids.add(f.id);
		if (!f.name.trim()) throw new Error("Every formula needs a name");

		let referenced: string[];
		try {
			referenced = collectReferencedPaths(parseFormula(f.expression));
		} catch (err) {
			const msg = err instanceof FormulaError ? err.message : "invalid expression";
			throw new Error(`Formula "${f.name}" has a syntax error: ${msg}`);
		}
		refs.set(
			f.id,
			referenced
				.filter((p) => p.startsWith("formula."))
				.map((p) => p.slice("formula.".length))
		);
	}
	for (const [id, deps] of refs) {
		for (const dep of deps) {
			if (!ids.has(dep)) {
				const f = formulas.find((x) => x.id === id);
				throw new Error(
					`Formula "${f?.name ?? id}" references a formula that doesn't exist`
				);
			}
		}
	}
	detectFormulaCycle(refs, formulas);
}

/** DFS three-colouring over the formula-reference graph; throws on a cycle. */
function detectFormulaCycle(
	refs: Map<string, string[]>,
	formulas: FormulaResource[]
): void {
	const WHITE = 0;
	const GRAY = 1;
	const BLACK = 2;
	const color = new Map<string, number>();
	for (const id of refs.keys()) color.set(id, WHITE);

	const visit = (id: string): void => {
		color.set(id, GRAY);
		for (const dep of refs.get(id) ?? []) {
			const c = color.get(dep);
			if (c === GRAY) {
				const f = formulas.find((x) => x.id === id);
				throw new Error(
					`Formula "${f?.name ?? id}" is part of a reference cycle`
				);
			}
			if (c === WHITE) visit(dep);
		}
		color.set(id, BLACK);
	};

	for (const id of refs.keys()) {
		if (color.get(id) === WHITE) visit(id);
	}
}

/**
 * Build the published snapshot from the working copy.
 */
function buildSnapshot(
	automation: Pick<
		AutomationDocument,
		"trigger" | "nodes" | "formulas" | "publishedSnapshot"
	>
): NonNullable<AutomationDocument["publishedSnapshot"]> {
	return {
		trigger: automation.trigger,
		nodes: automation.nodes,
		formulas: automation.formulas,
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
		formulas: v.optional(v.array(formulaResourceValidator)),
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
		validateFormulas(args.formulas);

		const userOrgId = await getCurrentUserOrgId(ctx);
		const user = await getCurrentUserOrThrow(ctx);
		const now = Date.now();

		return await ctx.db.insert("workflowAutomations", {
			orgId: userOrgId,
			name: args.name.trim(),
			description: args.description?.trim(),
			trigger: args.trigger,
			nodes: args.nodes,
			formulas: args.formulas,
			status: activate ? "active" : "draft",
			// Legacy mirror, kept in sync until post-migration tightening.
			isActive: activate,
			publishedSnapshot: activate
				? {
						trigger: args.trigger,
						nodes: args.nodes,
						formulas: args.formulas,
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
 * Save an automation's working copy. Does NOT change lifecycle: an active
 * automation keeps running its published snapshot until `publish` is called
 * again, so saving edits to a live automation leaves it live-but-dirty (the
 * editor surfaces the unpublished-changes state). Lifecycle transitions go
 * through `publish` / `toggleActive`.
 */
export const update = userMutation({
	args: {
		id: v.id("workflowAutomations"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		trigger: v.optional(triggerArgValidator),
		nodes: v.optional(v.array(nodeArgValidator)),
		formulas: v.optional(v.array(formulaResourceValidator)),
	},
	handler: async (ctx, args): Promise<AutomationId> => {
		const { id, ...updates } = args;
		const automation = await getAutomationOrThrow(ctx, id);

		if (updates.name !== undefined && !updates.name.trim()) {
			throw new Error("Automation name cannot be empty");
		}

		if (updates.trigger !== undefined || updates.nodes !== undefined) {
			const nextTrigger = updates.trigger ?? automation.trigger;
			const nextNodes = (updates.nodes ?? automation.nodes) as NodeArg[];
			if (updates.trigger !== undefined && !("type" in nextTrigger)) {
				throw new Error("Legacy triggers can no longer be written");
			}
			if (updates.nodes !== undefined) {
				for (const node of updates.nodes) {
					if (!node.config) {
						throw new Error(`Node ${node.id} is missing its configuration`);
					}
				}
			}
			// Structural validity is enforced on every save; a working copy can
			// still be incomplete (activation-level checks run at publish time).
			validateWorkflowDefinition(nextTrigger, nextNodes);
		}

		if (updates.formulas !== undefined) {
			validateFormulas(updates.formulas);
		}

		const patch: Partial<AutomationDocument> = { updatedAt: Date.now() };

		if (updates.name !== undefined) patch.name = updates.name.trim();
		if (updates.description !== undefined) {
			patch.description = updates.description.trim();
		}
		if (updates.trigger !== undefined) patch.trigger = updates.trigger;
		if (updates.nodes !== undefined) patch.nodes = updates.nodes;
		if (updates.formulas !== undefined) patch.formulas = updates.formulas;

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
		validateFormulas(automation.formulas);

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
 *
 * - active → paused: stop firing (dispatch pointer cleared).
 * - paused → active: resume the EXISTING published snapshot — no re-snapshot,
 *   so any unpublished working-copy edits stay unpublished. nextRunAt is
 *   recomputed from the published trigger (what will actually run).
 * - draft → active: no snapshot exists yet, so this publishes the working copy
 *   (snapshot v1), same as `publish`.
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
			return args.id;
		}

		if (automation.publishedSnapshot) {
			// Resume a previously-published automation on its published version.
			await ctx.db.patch(args.id, {
				status: "active",
				isActive: true,
				nextRunAt: scheduledNextRunAt(
					automation.publishedSnapshot.trigger,
					true
				),
				updatedAt: Date.now(),
			});
			return args.id;
		}

		// Draft with no snapshot: publishing is the only way to go live.
		validateForActivation(automation.trigger, automation.nodes as NodeArg[]);
		validateFormulas(automation.formulas);
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

// ---------------------------------------------------------------------------
// Slice 5: runs & latency ops-console queries.
//
// Latency model: activeMs = (completedAt - triggeredAt) - (pausedMs ?? 0) —
// wall-clock minus parked delay time; wallMs = completedAt - triggeredAt. Both
// are null until the run completes. Derived here, never stored (avoids drift).
// "Production" runs = mode !== "test": record-triggered runs leave `mode` unset;
// scheduled/manual set "production". Test/dry runs are excluded from every
// ops-console metric.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

const executionStatusValidator = v.union(
	v.literal("running"),
	v.literal("completed"),
	v.literal("failed"),
	v.literal("skipped"),
	v.literal("cancelled")
);

type ExecutionDoc = Doc<"workflowExecutions">;

type RunRow = ExecutionDoc & {
	automationName: string;
	/** (completedAt - triggeredAt) - pausedMs; null until completed. */
	activeMs: number | null;
	/** completedAt - triggeredAt; null until completed. */
	wallMs: number | null;
};

/** Wall & active durations; null until the run has a completedAt. */
function deriveDurations(execution: ExecutionDoc): {
	activeMs: number | null;
	wallMs: number | null;
} {
	if (execution.completedAt == null) return { activeMs: null, wallMs: null };
	const wallMs = Math.max(0, execution.completedAt - execution.triggeredAt);
	const activeMs = Math.max(0, wallMs - (execution.pausedMs ?? 0));
	return { activeMs, wallMs };
}

function clampInt(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, Math.floor(value)));
}

/** Nearest-rank percentile over an ASCENDING-sorted array; 0 when empty. */
function percentile(sortedAsc: number[], p: number): number {
	if (sortedAsc.length === 0) return 0;
	const rank = Math.ceil((p / 100) * sortedAsc.length);
	const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1));
	return sortedAsc[idx];
}

/** Cached automationId → name resolver (org-scoped; deleted rows labeled). */
function makeAutomationNameResolver(ctx: QueryCtx, orgId: Id<"organizations">) {
	const cache = new Map<string, string>();
	return async (automationId: Id<"workflowAutomations">): Promise<string> => {
		const key = automationId as string;
		const cached = cache.get(key);
		if (cached !== undefined) return cached;
		const automation = await ctx.db.get(automationId);
		const name =
			automation && automation.orgId === orgId
				? automation.name
				: "(deleted automation)";
		cache.set(key, name);
		return name;
	};
}

/**
 * Get execution logs for an automation.
 *
 * Backward-compatible: with no paginationOpts, returns the classic newest-first
 * array (limit default 50) — the shape assistantTools.ts consumes. With
 * paginationOpts, returns a standard Convex PaginationResult for the (deferred)
 * editor Runs tab. Optional status filter applies to both.
 */
export const getExecutions = userQuery({
	args: {
		automationId: v.id("workflowAutomations"),
		limit: v.optional(v.number()),
		status: v.optional(executionStatusValidator),
		paginationOpts: v.optional(paginationOptsValidator),
	},
	handler: async (
		ctx,
		args
	): Promise<ExecutionDoc[] | PaginationResult<ExecutionDoc>> => {
		// Validate access to the automation (org-scoped).
		await getAutomationOrThrow(ctx, args.automationId);

		const status = args.status;
		const base = ctx.db
			.query("workflowExecutions")
			.withIndex("by_automation", (q) =>
				q.eq("automationId", args.automationId)
			);
		const ordered = (
			status ? base.filter((q) => q.eq(q.field("status"), status)) : base
		).order("desc");

		if (args.paginationOpts) {
			return await ordered.paginate(args.paginationOpts);
		}
		return await ordered.take(args.limit ?? 50);
	},
});

/**
 * Paginated, org-wide run history for the runs table. Uses the status-scoped
 * index when a status filter is set, else the org+triggeredAt index; both
 * newest-first. Each row joins the automation name and the derived durations.
 */
export const listRuns = userQuery({
	args: {
		status: v.optional(executionStatusValidator),
		automationId: v.optional(v.id("workflowAutomations")),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args): Promise<PaginationResult<RunRow>> => {
		const orgId = ctx.orgId;
		const status = args.status;
		const automationId = args.automationId;

		const indexed = status
			? ctx.db
					.query("workflowExecutions")
					.withIndex("by_org_status_triggeredAt", (q) =>
						q.eq("orgId", orgId).eq("status", status)
					)
			: ctx.db
					.query("workflowExecutions")
					.withIndex("by_org_triggeredAt", (q) => q.eq("orgId", orgId));

		const ordered = (
			automationId
				? indexed.filter((q) =>
						q.eq(q.field("automationId"), automationId)
					)
				: indexed
		).order("desc");

		const page = await ordered.paginate(args.paginationOpts);

		const resolveName = makeAutomationNameResolver(ctx, orgId);
		const rows: RunRow[] = [];
		for (const execution of page.page) {
			const { activeMs, wallMs } = deriveDurations(execution);
			rows.push({
				...execution,
				automationName: await resolveName(execution.automationId),
				activeMs,
				wallMs,
			});
		}

		return { ...page, page: rows };
	},
});

/**
 * Windowed cumulative run metrics for the KPI tiles (production runs only).
 * successRate is over decided runs (completed + failed); skipped/running are
 * excluded from the denominator. Latency stats are over completed runs' active
 * time. `activeAutomationCount` is the count of currently-active automations.
 */
export const getRunMetrics = userQuery({
	args: { windowDays: v.optional(v.number()) },
	handler: async (
		ctx,
		args
	): Promise<{
		totalRuns: number;
		successCount: number;
		failedCount: number;
		skippedCount: number;
		successRate: number;
		avgActiveMs: number;
		p50ActiveMs: number;
		p95ActiveMs: number;
		activeAutomationCount: number;
	}> => {
		const orgId = ctx.orgId;
		const windowDays = clampInt(args.windowDays ?? 30, 1, 365);
		const windowStart = Date.now() - windowDays * DAY_MS;

		const executions = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_org_triggeredAt", (q) =>
				q.eq("orgId", orgId).gte("triggeredAt", windowStart)
			)
			.collect();

		let totalRuns = 0;
		let successCount = 0;
		let failedCount = 0;
		let skippedCount = 0;
		const activeDurations: number[] = [];

		for (const e of executions) {
			if (e.mode === "test") continue; // production runs only
			totalRuns++;
			if (e.status === "completed") {
				successCount++;
				const { activeMs } = deriveDurations(e);
				if (activeMs != null) activeDurations.push(activeMs);
			} else if (e.status === "failed") {
				failedCount++;
			} else if (e.status === "skipped") {
				skippedCount++;
			}
		}

		const decided = successCount + failedCount;
		const successRate = decided > 0 ? successCount / decided : 0;

		activeDurations.sort((a, b) => a - b);
		const avgActiveMs = activeDurations.length
			? Math.round(
					activeDurations.reduce((sum, v) => sum + v, 0) /
						activeDurations.length
				)
			: 0;

		// `status` is optional and legacy rows may carry only the deprecated
		// `isActive` mirror until migrateAutomationsV2 backfills `status`, so count
		// effective-active across both to avoid undercounting pre-migration.
		const orgAutomations = await ctx.db
			.query("workflowAutomations")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		const activeAutomationCount = orgAutomations.filter(
			(a) => a.status === "active" || (a.status == null && a.isActive === true)
		).length;

		return {
			totalRuns,
			successCount,
			failedCount,
			skippedCount,
			successRate,
			avgActiveMs,
			p50ActiveMs: percentile(activeDurations, 50),
			p95ActiveMs: percentile(activeDurations, 95),
			activeAutomationCount,
		};
	},
});

/**
 * Windowed daily run throughput for the stacked chart (production runs only).
 * UTC day boundaries for v1. Returns every day in the window in chronological
 * order, including zero-count days.
 */
export const getRunThroughput = userQuery({
	args: { windowDays: v.optional(v.number()) },
	handler: async (
		ctx,
		args
	): Promise<
		Array<{ day: number; success: number; failed: number; skipped: number }>
	> => {
		const orgId = ctx.orgId;
		const windowDays = clampInt(args.windowDays ?? 30, 1, 365);
		const now = Date.now();
		const todayMidnight = Math.floor(now / DAY_MS) * DAY_MS;
		const firstDay = todayMidnight - (windowDays - 1) * DAY_MS;

		const executions = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_org_triggeredAt", (q) =>
				q.eq("orgId", orgId).gte("triggeredAt", firstDay)
			)
			.collect();

		// Seed every UTC day (incl. zero-count) in chronological order.
		const buckets = new Map<
			number,
			{ day: number; success: number; failed: number; skipped: number }
		>();
		for (let day = firstDay; day <= todayMidnight; day += DAY_MS) {
			buckets.set(day, { day, success: 0, failed: 0, skipped: 0 });
		}

		for (const e of executions) {
			if (e.mode === "test") continue; // production runs only
			const day = Math.floor(e.triggeredAt / DAY_MS) * DAY_MS;
			const bucket = buckets.get(day);
			if (!bucket) continue; // outside the seeded window
			if (e.status === "completed") bucket.success++;
			else if (e.status === "failed") bucket.failed++;
			else if (e.status === "skipped") bucket.skipped++;
		}

		return Array.from(buckets.values());
	},
});

/**
 * The most recent failed PRODUCTION runs (org-scoped, newest first) for the
 * recent-failures timeline. failedNodeId = the last nodesExecuted entry whose
 * result is "failed" (undefined for pre-walk failures like a missing record).
 */
export const getRecentFailures = userQuery({
	args: { limit: v.optional(v.number()) },
	handler: async (
		ctx,
		args
	): Promise<
		Array<{
			executionId: Id<"workflowExecutions">;
			automationId: Id<"workflowAutomations">;
			automationName: string;
			error: string;
			failedNodeId?: string;
			triggeredAt: number;
		}>
	> => {
		const orgId = ctx.orgId;
		const limit = clampInt(args.limit ?? 10, 1, 50);

		const failures = await ctx.db
			.query("workflowExecutions")
			.withIndex("by_org_status_triggeredAt", (q) =>
				q.eq("orgId", orgId).eq("status", "failed")
			)
			.order("desc")
			.filter((q) => q.neq(q.field("mode"), "test"))
			.take(limit);

		const resolveName = makeAutomationNameResolver(ctx, orgId);
		const rows = [];
		for (const e of failures) {
			const failedNode = [...e.nodesExecuted]
				.reverse()
				.find((n) => n.result === "failed");
			rows.push({
				executionId: e._id,
				automationId: e.automationId,
				automationName: await resolveName(e.automationId),
				error: e.error ?? "Unknown error",
				failedNodeId: failedNode?.nodeId,
				triggeredAt: e.triggeredAt,
			});
		}
		return rows;
	},
});
