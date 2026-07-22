import { Doc, Id } from "../../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../../_generated/server";
import {
	evaluateConditionGroups,
	resolveValueRef,
	type RelatedRecords,
	type VariableScope,
} from "../conditionEval";
import { dottedRuleFieldCandidates } from "../relationRefs";
import {
	getZonedParts,
	isCalendarDateEpoch,
	toEpochMs,
	zonedPartsToEpoch,
} from "../formula";
import { roundCents, sumMoney } from "../money";
import {
	RELATED_OBJECTS,
	RELATION_FIELD,
} from "../fieldRegistry";
import {
	ADJUST_TIME_UNIT_MS,
	DEFAULT_FETCH_LIMIT,
	FETCH_SCAN_CEILING,
	MAX_FETCH_LIMIT,
	type AutomationObjectType,
	type ConditionGroup,
	type TriggerableObjectType,
	type WorkflowNodeConfig,
} from "../workflowTypes";
import type { FetchOutput, ScopeRecord, WalkEnv } from "./types";

/** Rows fetched per index page while scanning for matches. */
const FETCH_SCAN_BATCH = 500;
/**
 * Shared scan budget across every fetch in one walk, so multi-fetch workflows
 * stay under Convex's per-transaction read limits — verified against the
 * production limits docs (2026-07-18): 32,000 documents scanned / 16 MiB read
 * / 4,096 index ranges per transaction. At 10k rows the binding constraint is
 * data read, not document count: headroom holds while the average scanned doc
 * stays under ~1.6 KiB, which fits the fetchable object types (rows with long
 * free-text notes are the ones to watch). Paging at FETCH_SCAN_BATCH=500
 * costs ~20 index ranges per exhausted budget, far under the 4,096 cap.
 */
export const WALK_SCAN_BUDGET = 10_000;

type OrgRow = Record<string, unknown> & { _creationTime: number };

/**
 * One page of an org's rows from the by_org index, newest first, starting
 * strictly after the `before` cursor (a _creationTime; Convex appends
 * _creationTime to every index as the unique final tiebreaker, so it is a
 * stable pagination cursor).
 */
export async function takeOrgPage(
	ctx: { db: QueryCtx["db"] },
	objectType: AutomationObjectType,
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
		case "quote_line_item":
			return await ctx.db
				.query("quoteLineItems")
				.withIndex("by_org", (q) => {
					const r = q.eq("orgId", orgId);
					return before === undefined ? r : r.lt("_creationTime", before);
				})
				.order("desc")
				.take(count);
		case "invoice_line_item":
			return await ctx.db
				.query("invoiceLineItems")
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
	objectType: AutomationObjectType,
	orgId: Id<"organizations">,
	opts: {
		predicate?: (row: Record<string, unknown>) => boolean | Promise<boolean>;
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
			if (!(await predicate(row))) continue;
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
	"orgId" | "scope" | "fetchOutputs" | "fetchScanBudget" | "relationCache"
>;

/**
 * Run a fetch_records node: paginated org-scoped index scan (newest first),
 * filter groups combined with AND applied per page, optional sort, then
 * limit. Output is stored for downstream loops and exposed as node.<id>.count.
 */
export async function runFetchNode(
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
		// Relation-qualified filter fields ("client.companyName") hydrate the
		// related doc per row (memoized per run). Rows and hydrations draw from
		// ONE read pool: each scanned row and each hydration cache miss costs a
		// unit. A miss past the pool fails loudly instead of brushing Convex's
		// per-transaction read limits; cache hits stay free even after the pool
		// is spent, so late rows sharing an already-hydrated relation still match.
		const dottedRelations = dottedRuleFieldCandidates(config.filters);
		let hydrationReads = 0;
		let rowsSeen = 0;
		const scanAllowance = Math.min(
			FETCH_SCAN_CEILING,
			Math.max(env.fetchScanBudget, 0)
		);
		const { matches, scanned, truncated } = await scanOrgRows(
			ctx,
			config.objectType,
			env.orgId,
			{
				predicate: async (row) => {
					rowsSeen += 1;
					const related =
						dottedRelations.size > 0
							? await hydrateRelations(
									ctx,
									env.orgId,
									config.objectType,
									row,
									dottedRelations,
									env.relationCache,
									() => {
										if (rowsSeen + hydrationReads >= scanAllowance) {
											throw new Error(
												"This filter reads too many related records — narrow the filter or add more specific conditions"
											);
										}
										hydrationReads += 1;
									}
								)
							: undefined;
					return evaluateConditionGroups(
						"and",
						config.filters,
						row,
						env.scope,
						config.objectType,
						related
					);
				},
				// Sorting needs every match in range; without one, rows already
				// arrive newest-first so the scan can stop at the node's limit.
				stopAfterMatches: config.sortBy ? undefined : limit,
				maxScan: scanAllowance,
			}
		);
		env.fetchScanBudget -= scanned + hydrationReads;
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
export function runAggregateNode(
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
export function runAdjustTimeNode(
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
	const days =
		config.unit === "days"
			? sign * config.amount
			: config.unit === "weeks"
				? sign * config.amount * 7
				: null;
	let value: number;
	if (days !== null && Number.isInteger(days)) {
		// Whole-day math mirrors ADDDAYS: a calendar date advances in UTC (no
		// DST there, result stays exactly UTC midnight); an instant preserves
		// its wall-clock time in the run tz across DST transitions. Fixed-ms
		// day math would drift an hour over a DST boundary.
		if (isCalendarDateEpoch(baseMs)) {
			value = baseMs + days * 86_400_000;
		} else {
			const tz = scope.workflow?.tz ?? "UTC";
			const parts = getZonedParts(baseMs, tz);
			value = zonedPartsToEpoch({ ...parts, day: parts.day + days }, tz);
		}
	} else {
		// Minutes/hours are absolute offsets; fractional day amounts keep the
		// legacy fixed-ms behavior (parts math needs whole days).
		value = baseMs + sign * config.amount * ADJUST_TIME_UNIT_MS[config.unit];
	}
	scope.nodes ??= {};
	scope.nodes[nodeId] = { ...scope.nodes[nodeId], result: value };
	return { ok: true, value };
}

/**
 * Get an object by type and ID, asserting it belongs to the given org.
 */
export async function getObject(
	ctx: { db: QueryCtx["db"] },
	objectType: AutomationObjectType,
	objectId: string,
	orgId: Id<"organizations">
): Promise<
	| Doc<"clients">
	| Doc<"projects">
	| Doc<"quotes">
	| Doc<"invoices">
	| Doc<"tasks">
	| Doc<"quoteLineItems">
	| Doc<"invoiceLineItems">
	| null
> {
	let doc:
		| Doc<"clients">
		| Doc<"projects">
		| Doc<"quotes">
		| Doc<"invoices">
		| Doc<"tasks">
		| Doc<"quoteLineItems">
		| Doc<"invoiceLineItems">
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
		case "quote_line_item":
			doc = await ctx.db.get(objectId as Id<"quoteLineItems">);
			break;
		case "invoice_line_item":
			doc = await ctx.db.get(objectId as Id<"invoiceLineItems">);
			break;
		default: {
			const _exhaustive: never = objectType;
			return _exhaustive;
		}
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
 * One-hop related records for `record`, keyed by relation name. Candidate
 * names not in RELATED_OBJECTS[objectType] are skipped (flat field keys may
 * contain dots); a missing FK / deleted / cross-org target stores `null` so
 * resolution degrades to undefined + the ref's fallback. Reads memoize per
 * run in `cache` (`type:id`) — a 200-item loop sharing one client reads it
 * once. `onFetch` fires per cache miss (fetch-filter scan-budget accounting).
 * The indirect client-via-project resolution matches resolveTargetV2.
 */
export async function hydrateRelations(
	ctx: { db: QueryCtx["db"] },
	orgId: Id<"organizations">,
	objectType: AutomationObjectType,
	record: Record<string, unknown>,
	relations: Iterable<string>,
	cache: Map<string, Record<string, unknown> | null>,
	onFetch?: () => void
): Promise<RelatedRecords | undefined> {
	const fetchCached = async (
		type: AutomationObjectType,
		id: string
	): Promise<Record<string, unknown> | null> => {
		const key = `${type}:${id}`;
		const hit = cache.get(key);
		if (hit !== undefined) return hit;
		onFetch?.();
		const doc = await getObject(ctx, type, id, orgId);
		cache.set(key, doc);
		return doc;
	};

	let related: RelatedRecords | undefined;
	for (const name of relations) {
		const relatedType = name as TriggerableObjectType;
		if (!RELATED_OBJECTS[objectType]?.includes(relatedType)) continue;
		related ??= {};
		const fkField = RELATION_FIELD[objectType]?.[relatedType];
		let relatedId = fkField
			? (record[fkField] as string | undefined)
			: undefined;
		if (!relatedId && relatedType === "client") {
			const projectFk = RELATION_FIELD[objectType]?.project;
			const projectId = projectFk
				? (record[projectFk] as string | undefined)
				: undefined;
			if (projectId) {
				relatedId = (await fetchCached("project", projectId))?.clientId as
					| string
					| undefined;
			}
		}
		related[name] = relatedId ? await fetchCached(relatedType, relatedId) : null;
	}
	return related;
}

/** Hydrate trigger-record relations referenced anywhere in the definition. */
export async function hydrateTriggerRelations(
	ctx: { db: QueryCtx["db"] },
	env: Pick<WalkEnv, "orgId" | "scope" | "relationRefs" | "relationCache">,
	scopeRecord: ScopeRecord | undefined
): Promise<void> {
	if (!scopeRecord || !env.scope.trigger) return;
	if (env.relationRefs.trigger.size === 0) return;
	env.scope.trigger.related = await hydrateRelations(
		ctx,
		env.orgId,
		scopeRecord.type,
		scopeRecord.record,
		env.relationRefs.trigger,
		env.relationCache
	);
}

/**
 * Relations named by dotted rule fields ("client.companyName"), hydrated for
 * the record under evaluation and merged over `related` (names already
 * hydrated are skipped).
 */
export async function withLazyRuleRelations(
	ctx: { db: QueryCtx["db"] },
	env: Pick<WalkEnv, "orgId" | "relationCache">,
	groups: ConditionGroup[],
	record: Record<string, unknown>,
	recordType: AutomationObjectType | undefined,
	related: RelatedRecords | undefined
): Promise<RelatedRecords | undefined> {
	if (!recordType) return related;
	const candidates = dottedRuleFieldCandidates(groups);
	for (const name of Object.keys(related ?? {})) candidates.delete(name);
	if (candidates.size === 0) return related;
	const lazy = await hydrateRelations(
		ctx,
		env.orgId,
		recordType,
		record,
		candidates,
		env.relationCache
	);
	return lazy ? { ...related, ...lazy } : related;
}

/** Human label for a record, used in the run's triggerRecord + sample picker. */
export function sampleRecordLabel(
	objectType: AutomationObjectType,
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
		case "quote_line_item":
		case "invoice_line_item":
			return String(record.description ?? "Line item");
		default: {
			const _exhaustive: never = objectType;
			return _exhaustive;
		}
	}
}
