import { Doc, Id } from "../../_generated/dataModel";
import { MutationCtx } from "../../_generated/server";
import { trackServerException } from "../posthog";
import { AggregateHelpers } from "../aggregates";
import { ActivityHelpers } from "../activities";
import { isAdminRole, orgHasPremiumPlan } from "../permissions";
import { getMembership, listMembershipsByOrg } from "../memberships";
import { enqueuePushViaPool } from "../../push";
import { insertTeamMessage } from "../../teamMessages";
import { scheduleEventProcessing } from "../../eventBus";
import {
	evaluateConditionGroups,
	interpolateTemplate,
	resolveValueRef,
	type RelatedRecords,
	type VariableScope,
} from "../conditionEval";
import { calendarDayEpoch } from "../formula";
import {
	FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT,
	FREE_MAX_CLIENTS,
} from "../planLimits";
import {
	RELATION_FIELD,
	getFieldDefinition,
	getRequiredCreateFields,
	getStatusOptions,
	isCreatableObjectType,
	type FieldDefinition,
} from "../fieldRegistry";
import {
	type ActionTarget,
	type AutomationAction,
	type AutomationObjectType,
	type TeamMessageMention,
	type ValueRef,
	type WorkflowNodeConfig,
} from "../workflowTypes";
import type {
	AutomationDoc,
	AutomationNode,
	ObjectType,
	ScopeRecord,
	WalkEnv,
} from "./types";
import { getObject, withLazyRuleRelations } from "./fetch";

/**
 * Field-registry status validator for the target's object type. Lives here
 * (rather than the matching/trigger module its status-changed-trigger
 * cousins occupy) because it is actions.ts's only external caller today;
 * automationExecutor.ts re-imports it for the dry-run test-step executor.
 */
export function isValidStatus(objectType: ObjectType, status: string): boolean {
	const options = getStatusOptions(objectType);
	return options.some((o) => o.value === status);
}

/**
 * Execute a per-record node (condition/action) via its v2 `config`.
 * Structural kinds (fetch/loop/delay/end) are handled by the walk engine
 * before this is reached.
 */
// Caps per-run push fan-out for send_notification/send_team_message actions;
// overflow recipients are skipped and recorded on the run's node output.
const RECIPIENT_FANOUT_CAP = 50;

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

export async function executeNode(
	ctx: MutationCtx,
	node: AutomationNode,
	scopeRecord: ScopeRecord | undefined,
	env: WalkEnv
): Promise<{
	success: boolean;
	skipped?: boolean;
	conditionMet?: boolean;
	error?: string;
	output?: Record<string, unknown>;
}> {
	return executeNodeV2(ctx, node.config, scopeRecord, env);
}

export const NO_SCOPE_RECORD_ERROR =
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
	output?: Record<string, unknown>;
}> {
	switch (config.kind) {
		case "condition": {
			let record: Record<string, unknown>;
			let recordType: AutomationObjectType | undefined;
			let related: RelatedRecords | undefined;
			if (config.source && typeof config.source === "object") {
				const loopScope = env.scope.loops?.[config.source.loopNodeId];
				if (!loopScope) {
					return {
						success: false,
						error: "This condition reads a loop item but no loop is running",
					};
				}
				record = loopScope.item;
				recordType = loopScope.objectType;
				related = loopScope.related;
			} else {
				record = scopeRecord?.record ?? {};
				recordType = scopeRecord?.type;
				// Inside a loop the scope record IS the current item.
				related = env.currentLoop
					? env.scope.loops?.[env.currentLoop.nodeId]?.related
					: env.scope.trigger?.related;
			}
			related = await withLazyRuleRelations(
				ctx,
				env,
				config.groups,
				record,
				recordType,
				related
			);
			const conditionMet = evaluateConditionGroups(
				config.logic,
				config.groups,
				record,
				env.scope,
				recordType,
				related
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
			await scheduleEventProcessing(ctx);
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
export function coerceFieldValue(
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
		case "datetime": {
			// An instant field stores the exact moment — no day normalization.
			// (All datetime fields are writable:false today; this keeps the
			// switch exhaustive and correct if one ever opens up.)
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
			return { ok: true, value: n };
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
): Promise<{
	success: boolean;
	skipped?: boolean;
	error?: string;
	output?: Record<string, unknown>;
}> {
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
export async function executeUpdateFieldsAction(
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
				await scheduleEventProcessing(ctx);
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
export async function resolveTargetV2(
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
export function resolveTextValue(
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
			// Attribute the activity to the automation's creator — a scheduled
			// (cron) run has no ambient authenticated user, so createActivity's
			// default getCurrentUserOrThrow would throw AFTER the task insert
			// (node reports failed though the task exists). If that creator has
			// since left the org, fall back to the org owner (mirrors
			// executeCreateRecordAction).
			const org = await ctx.db.get(env.orgId);
			const creatorId = env.automation.createdBy;
			const creatorMembership = await getMembership(ctx, creatorId, env.orgId);
			const actor = {
				userId: creatorMembership ? creatorId : (org?.ownerUserId ?? creatorId),
				orgId: env.orgId,
			};
			await ActivityHelpers.taskCreated(ctx, task, actor);

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
			await scheduleEventProcessing(ctx);
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
		invoice: "invoices",
	}[refType] as "users" | "clients" | "projects" | "quotes" | "invoices";
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
export async function checkCreateRecordPlanCap(
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
export async function buildCreateRecordPayload(
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

export async function executeCreateRecordAction(
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
			await scheduleEventProcessing(ctx);
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
export async function resolveMemberUserIds(
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
export async function notifyAutomationFailure(
	ctx: MutationCtx,
	automation: AutomationDoc,
	error: string,
	executionId: Id<"workflowExecutions">
): Promise<void> {
	try {
		// Production-run failures also land in PostHog error tracking.
		const org = await ctx.db.get(automation.orgId);
		await trackServerException(ctx, {
			error,
			source: "automation",
			...(org
				? {
						distinctId: `org:${org.clerkOrganizationId}`,
						groups: { organization: org.clerkOrganizationId },
					}
				: {}),
			properties: {
				automation_id: automation._id,
				execution_id: executionId,
			},
		});

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
export async function resolveRecordFieldUsers(
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
): Promise<{
	success: boolean;
	skipped?: boolean;
	error?: string;
	output?: Record<string, unknown>;
}> {
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

	const notifyIds = userIds.slice(0, RECIPIENT_FANOUT_CAP);
	const skippedCount = userIds.length - notifyIds.length;

	try {
		for (const userId of notifyIds) {
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
				await enqueuePushViaPool(ctx, {
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
		return {
			success: true,
			output: {
				recipientsNotified: notifyIds.length,
				...(skippedCount > 0 ? { recipientsSkipped: skippedCount } : {}),
			},
		};
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
export async function resolveTeamMessageMention(
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
export async function resolveTeamMessageRecipients(
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
): Promise<{
	success: boolean;
	skipped?: boolean;
	error?: string;
	output?: Record<string, unknown>;
}> {
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

	const messageBellIds = bellIds.slice(0, RECIPIENT_FANOUT_CAP);
	const skippedCount = bellIds.length - messageBellIds.length;

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
		for (const userId of messageBellIds) {
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
			await enqueuePushViaPool(ctx, {
				notificationType: "automation_message",
				taggedUserId: userId,
				title,
				body: message,
				url: actionUrl,
				notificationId,
				orgId: clerkOrgId,
			});
		}
		return {
			success: true,
			output: {
				recipientsNotified: messageBellIds.length,
				...(skippedCount > 0 ? { recipientsSkipped: skippedCount } : {}),
			},
		};
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to send team message",
		};
	}
}
