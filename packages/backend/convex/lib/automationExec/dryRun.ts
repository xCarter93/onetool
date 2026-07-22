import { Id } from "../../_generated/dataModel";
import { MutationCtx } from "../../_generated/server";
import {
	evaluateConditionGroups,
	interpolateTemplate,
	resolveValueRef,
	type RelatedRecords,
	type VariableScope,
} from "../conditionEval";
import { collectRelationRefs, type RelationRefs } from "../relationRefs";
import { getFieldDefinition, isCreatableObjectType } from "../fieldRegistry";
import { orgHasPremiumPlan } from "../permissions";
import { getMembership } from "../memberships";
import {
	MAX_LOOP_ITEM_ERRORS,
	MAX_LOOP_ITERATIONS,
	isFetchOnlyObjectType,
	LOOP_FETCH_ONLY_ERROR,
	type ActionTarget,
	type AutomationAction,
	type ValueRef,
	type AutomationObjectType,
	type ExecutedNode,
	type LoopSummary,
	type WorkflowNodeConfig,
} from "../workflowTypes";
import type {
	AutomationDoc,
	AutomationNode,
	ScopeRecord,
	FetchOutput,
} from "./types";
import {
	WALK_SCAN_BUDGET,
	runFetchNode,
	runAggregateNode,
	runAdjustTimeNode,
	hydrateRelations,
	hydrateTriggerRelations,
	withLazyRuleRelations,
	sampleRecordLabel,
} from "./fetch";
import {
	NO_SCOPE_RECORD_ERROR,
	isValidStatus,
	coerceFieldValue,
	resolveTargetV2,
	resolveTextValue,
	checkCreateRecordPlanCap,
	buildCreateRecordPayload,
	resolveMemberUserIds,
	resolveRecordFieldUsers,
	resolveTeamMessageMention,
	resolveTeamMessageRecipients,
} from "./actions";
import {
	MAX_EXECUTED_ENTRIES,
	MAX_ITEM_ERROR_CHARS,
	mergeContinuationFor,
	computeDelayResume,
} from "./walk";

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
export const TEST_STEP_INTERVAL_MS = 150;
/** Loop iterations sampled per loop in a dry run (keeps the reveal snappy). */
const DRY_LOOP_SAMPLE = 3;

type DryWalkOutcome = "chain_done" | "ended" | "next_item" | "failed";
/** A test run stuck "running" past this is presumed dropped and marked failed. */
export const STALE_TEST_RUN_MS = 5 * 60 * 1000;

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
	/** One-hop relation references statically collected from the working copy. */
	relationRefs: RelationRefs;
	/** Per-run memo of hydrated related docs, keyed `type:id`. */
	relationCache: Map<string, Record<string, unknown> | null>;
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
	// Line items are fetch+aggregate only: they can't be a scope record, so a
	// loop can't hand one to an action. Publish validation rejects this too;
	// this is the runtime backstop for already-published snapshots.
	if (isFetchOnlyObjectType(source.objectType)) {
		const error = LOOP_FETCH_ONLY_ERROR;
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
			const loopRelations = env.relationRefs.loops.get(node.id);
			env.scope.loops[node.id] = {
				item,
				index,
				count: total,
				objectType: source.objectType,
				related: loopRelations?.size
					? await hydrateRelations(
							ctx,
							env.orgId,
							source.objectType,
							item,
							loopRelations,
							env.relationCache
						)
					: undefined,
			};
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
export async function buildDryPlan(
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
		relationRefs: collectRelationRefs(
			automation.nodes,
			automation.trigger,
			automation.formulas
		),
		relationCache: new Map(),
		nodeStartedAt: Date.now(),
		loopSummaries: [],
	};

	await hydrateTriggerRelations(ctx, env, scopeRecord);

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
