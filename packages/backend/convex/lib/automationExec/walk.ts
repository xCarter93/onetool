import { Doc } from "../../_generated/dataModel";
import { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
	resolveValueRef,
	type VariableScope,
} from "../conditionEval";
import { toEpochMs } from "../formula";
import {
	DELAY_UNIT_MS,
	MAX_DELAY_MS,
	MAX_LOOP_ITEM_ERRORS,
	MAX_LOOP_ITERATIONS,
	isFetchOnlyObjectType,
	LOOP_FETCH_ONLY_ERROR,
	type LoopSummary,
	type WorkflowNodeConfig,
} from "../workflowTypes";
import type {
	AutomationNode,
	ExecEntry,
	ScopeRecord,
	WalkEnv,
} from "./types";
import {
	runFetchNode,
	runAggregateNode,
	runAdjustTimeNode,
	hydrateRelations,
	sampleRecordLabel,
} from "./fetch";
import { executeNode, notifyAutomationFailure } from "./actions";

// ---------------------------------------------------------------------------
// Walk engine — shared by the initial run and delay resumes. A "walk" follows
// nextNodeId/elseNodeId links; loop bodies run as nested walks per item via
// bodyStartNodeId; delay nodes checkpoint the walk into resumeState and
// schedule resumeExecution.
// ---------------------------------------------------------------------------


export type WalkOutcome =
	| { kind: "chain_done" } // ran off the end of a chain
	| { kind: "ended" } // end node — terminate the whole run successfully
	| { kind: "next_item" } // next_item node — continue with the loop's next record
	| { kind: "waiting" } // delay checkpointed the run and scheduled a resume
	| { kind: "failed"; error: string };

/** Cap on stored per-node log entries (loops multiply them). */
export const MAX_EXECUTED_ENTRIES = 400;

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
export const MAX_ITEM_ERROR_CHARS = 500;

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
export function loopSummaryPatch(env: WalkEnv): LoopSummary[] | undefined {
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

/** Apply a finished walk's outcome to the execution row. */
export async function finishWalk(
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

	// Run counters live on automationRunStats, bumped in a tiny deferred
	// mutation: every walk chunk reads the automation doc, so patching counters
	// onto it here would OCC-invalidate all in-flight runs of a burst-triggered
	// automation.
	await ctx.scheduler.runAfter(0, internal.automationExecutor.bumpTriggerStats, {
		automationId: env.automation._id,
		orgId: env.automation.orgId,
		triggeredAt: Date.now(),
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

export function mergeContinuationFor(
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
 * Build a resumeState checkpoint pointing at resumeNodeId/resumeAt. Shared by
 * the delay checkpoint, the chunked-loop checkpoint (which layers a `loop`
 * field on top), and the run-level retry checkpoint in finishWalk.
 */
function buildResumeState(
	env: WalkEnv,
	resumeNodeId: string,
	resumeAt: number
): NonNullable<Doc<"workflowExecutions">["resumeState"]> {
	return {
		resumeNodeId,
		resumeAt,
		// Parked-at timestamp; resume adds (now - checkpointAt) to pausedMs.
		checkpointAt: Date.now(),
		eventOldValue: env.scope.trigger?.event?.oldValue as string | undefined,
		eventNewValue: env.scope.trigger?.event?.newValue as string | undefined,
		objectType: env.trigger.objectType,
		objectId: env.trigger.objectId,
		fetchOutputs: Object.entries(env.fetchOutputs).map(([nodeId, output]) => ({
			nodeId,
			objectType: output.objectType,
			recordIds: output.records.map((r) => String(r._id)),
			count: output.count,
		})),
		nodeResults: collectNodeResults(env.scope),
	};
}

/**
 * Walk a node chain from startNodeId. Loop bodies recurse with the loop item
 * as the scope record; delays checkpoint and return "waiting".
 */
export async function runWalk(
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
				resumeState: buildResumeState(env, delayNextNodeId, resume.resumeAt),
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
			output: result.output,
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
 * Iterations executed per mutation. Longer loops checkpoint into resumeState
 * and continue in a scheduled follow-up mutation: each chunk's writes commit
 * with its own transaction (commit-per-chunk), so a failure in a later chunk
 * keeps earlier chunks' effects.
 */
const LOOP_CHUNK_SIZE = 25;

type LoopResumeState = { nextIndex: number; remainingItemIds: string[] };

/**
 * Run a loop node: iterate the source fetch output, walking the body chain
 * once per item with that item as the scope record and loop.<id>.item/.index
 * variables in scope.
 */
export async function runLoopNode(
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
	// Line items are fetch+aggregate only: they can't be a scope record, so a
	// loop can't hand one to an action. Publish validation rejects this too;
	// this is the runtime backstop for already-published snapshots.
	if (isFetchOnlyObjectType(source.objectType)) {
		const error = LOOP_FETCH_ONLY_ERROR;
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
			const loopRelations = env.relationRefs.loops.get(node.id);
			env.scope.loops[node.id] = {
				item,
				index,
				count: summary.total,
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
			...buildResumeState(env, node.id, now),
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

export function computeDelayResume(
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
