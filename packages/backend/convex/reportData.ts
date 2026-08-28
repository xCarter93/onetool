import { QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getOrgTimezoneById } from "./lib/organization";
import { DateUtils } from "./lib/shared";
import { optionalUserQuery } from "./lib/factories";
import { scanOrgTable, REPORT_SCAN_CEILING } from "./lib/orgScan";
import {
	getReportField,
	getReportDateField,
	getGroupableFk,
	resolveGroupByField,
	reportEntityTypeValidator,
	REPORT_FIELDS,
	RATIO_METRICS,
	type RatioKey,
	type ReportEntityType,
	type ReportFieldType,
	type ReportFieldDef,
	type ReportGroupableFk,
} from "./lib/reportFields";
import {
	reportConfigV2Validator,
	type ReportConfigV2,
	type ReportDateComparison,
} from "./lib/reportConfig";
import { resolveComparisonRange, resolveDateRangePreset } from "./lib/reportDates";
import {
	evaluateReportFilters,
	type ReportFilters,
	type ReportPathResolver,
} from "./lib/reportFilters";
import {
	buildPathHydrator,
	isRelatedPath,
	pathTables,
	REPORT_RELATIONS,
	resolveReportPath,
	type PathHydrator,
	type ReportRelationTarget,
	type ResolvedPath,
} from "./lib/reportRelations";
import type { PermissionObject } from "./lib/permissionKeys";
import { denyPermission, getEffectivePermissions } from "./lib/permissions";

/**
 * Report Data Queries
 * Provides aggregated data for report visualizations and analytics.
 *
 * executeReport is the only public export — it runs a bounded, org-scoped
 * index scan (never `.collect()`s a whole org table) and groups in memory
 * through one unified pipeline. Every request is a v2 `config` (built by
 * lib/reportQueryArgs) plus an optional `detail` request. The 14-function
 * legacy dispatch was retired at R4c — its outputs are pinned by
 * __goldens__/report-legacy-dispatch.json, which reportDualRun.test.ts holds
 * this pipeline to.
 */

// ============================================================================
// Types
// ============================================================================

export interface AggregatedDataPoint {
	label: string;
	value: number;
	/**
	 * Raw internal bucket key, echoed back as `detail.bucketKey` to drill into
	 * this point's records. Absent on the ungrouped "Total" point.
	 */
	bucketKey?: string;
	/** Same bucket's value over the comparison range; absent when no comparison or no match. */
	compareValue?: number;
	metadata?: Record<string, unknown>;
	/** Per-segment values, present only when the request set segmentBy. */
	segments?: Record<string, number>;
}

/**
 * A detail row: the record's id, its FK ids (parent links — ids are never
 * exposed as columns), and one entry per requested column.
 */
export type DetailRow = { id: string; refs?: Record<string, string> } & Record<
	string,
	string | number | boolean | null
>;

export interface ReportDataResult {
	data: AggregatedDataPoint[];
	total: number;
	metadata?: {
		entityType: string;
		dateRange?: { start: number; end: number };
		groupBy?: string;
		truncated?: boolean;
		/** Which scans hit their ceiling; present only when a traversed scan truncated. */
		truncatedEntities?: string[];
		totalIsCurrency?: boolean;
		itemValueIsCurrency?: boolean;
		segmentBy?: string;
		/** Ordered segment keys (top-N by value plus "other"), present only when segmented. */
		segments?: { key: string; label: string }[];
		/** Comparison-range total (ratio reports: the previous ratio percentage). */
		compareTotal?: number;
		/** The comparison scan hit its ceiling; kept separate from `truncated` (current scan). */
		compareTruncated?: boolean;
	};
	detail?: {
		columns: { field: string; label: string; type: ReportFieldType }[];
		rows: DetailRow[];
		totalMatched: number;
		rowsTruncated: boolean;
	};
}

type Row = Record<string, unknown>;

const emptyReportResult = (): ReportDataResult => ({ data: [], total: 0 });

// ============================================================================
// Validators
// ============================================================================

type AggregationOp = "count" | "sum" | "avg" | "min" | "max";
interface Aggregation {
	op: AggregationOp;
	field?: string;
}

const detailValidator = v.optional(
	v.object({
		columns: v.array(v.string()),
		limit: v.optional(v.number()),
		/** Drill-down: the `bucketKey` of the data point being opened. */
		bucketKey: v.optional(v.string()),
	})
);

interface DetailArgs {
	columns: string[];
	limit?: number;
	bucketKey?: string;
}

// ============================================================================
// Date Bounds (exact millisecond bounds — no server-local re-clamping)
// ============================================================================

interface DateBoundsResult {
	start?: number;
	end?: number;
	hasDateFilter: boolean;
}

/**
 * Resolve date bounds for a date range. The caller (frontend) computes any
 * day-boundary clamping it wants before sending start/end — the backend
 * treats these as exact millisecond bounds. Returns hasDateFilter: false for
 * "all time" (no start or end supplied).
 */
function resolveDateBounds(dateRange?: {
	start?: number;
	end?: number;
}): DateBoundsResult {
	if (!dateRange || (dateRange.start === undefined && dateRange.end === undefined)) {
		return { hasDateFilter: false };
	}
	return {
		start: dateRange.start,
		end: dateRange.end ?? Date.now(),
		hasDateFilter: true,
	};
}

function inDateBounds(value: unknown, bounds: DateBoundsResult): boolean {
	if (!bounds.hasDateFilter) return true;
	if (typeof value !== "number") return false;
	if (bounds.start !== undefined && value < bounds.start) return false;
	if (bounds.end !== undefined && value > bounds.end) return false;
	return true;
}

function metadataDateRange(bounds: DateBoundsResult): { start: number; end: number } | undefined {
	if (!bounds.hasDateFilter || bounds.start === undefined || bounds.end === undefined) {
		return undefined;
	}
	return { start: bounds.start, end: bounds.end };
}

// ============================================================================
// Date Grouping Utilities
// ============================================================================

type Granularity = "day" | "week" | "month";

/** Sunday week-start, computed in the given IANA timezone (not server-local). */
function weekStartKey(timestamp: number, timezone?: string): string {
	const dateStr = DateUtils.toLocalDateString(timestamp, timezone);
	const d = new Date(dateStr + "T00:00:00Z");
	const dayOfWeek = d.getUTCDay();
	d.setUTCDate(d.getUTCDate() - dayOfWeek);
	return d.toISOString().split("T")[0];
}

function getDateKey(timestamp: number, granularity: Granularity, timezone?: string): string {
	switch (granularity) {
		case "day":
			return DateUtils.toLocalDateString(timestamp, timezone);
		case "week":
			return weekStartKey(timestamp, timezone);
		case "month":
		default:
			return DateUtils.toLocalDateString(timestamp, timezone).substring(0, 7);
	}
}

function formatDateLabel(dateKey: string, granularity: Granularity): string {
	switch (granularity) {
		case "day": {
			const date = new Date(dateKey + "T12:00:00");
			return date.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
		}
		case "week": {
			const date = new Date(dateKey + "T12:00:00");
			return `Week of ${date.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			})}`;
		}
		case "month":
		default: {
			const [year, month] = dateKey.split("-");
			const date = new Date(parseInt(year), parseInt(month) - 1, 1);
			return date.toLocaleDateString("en-US", {
				month: "short",
				year: "numeric",
			});
		}
	}
}

// ============================================================================
// Label / Value Formatting Utilities
// ============================================================================

function capitalizeWords(text: string, separator: string | RegExp): string {
	return text
		.split(separator)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function num(value: unknown): number {
	return typeof value === "number" ? value : 0;
}

function str(value: unknown): string {
	return typeof value === "string" ? value : "";
}

// ============================================================================
// Generic Aggregation
// ============================================================================

function computeAggregateValue(rows: Row[], aggregation?: Aggregation): number {
	const op = aggregation?.op ?? "count";
	if (op === "count") return rows.length;

	const field = aggregation?.field;
	const nums = field
		? rows.map((r) => r[field]).filter((v): v is number => typeof v === "number")
		: [];
	if (nums.length === 0) return 0;

	switch (op) {
		case "sum":
			return nums.reduce((a, b) => a + b, 0);
		case "avg":
			return nums.reduce((a, b) => a + b, 0) / nums.length;
		case "min":
			return Math.min(...nums);
		case "max":
			return Math.max(...nums);
	}
}

// ============================================================================
// Filter / Aggregation Validation
// ============================================================================

/**
 * Config filters may traverse related records (§8 d15), but a dotted field
 * must land on a plain value: ids were never filterable, and a time bucket is
 * a grouping, not a value.
 */
function validateConfigFilters(
	entityType: ReportEntityType,
	filters?: ReportFilters
): void {
	if (!filters) return;
	for (const group of filters.groups) {
		for (const rule of group.rules) {
			if (!isRelatedPath(rule.field)) {
				if (!getReportField(entityType, rule.field)) {
					throw new ConvexError(
						`Unknown report filter field "${rule.field}" for entity "${entityType}"`
					);
				}
				continue;
			}
			const { terminal } = resolveReportPath(entityType, rule.field);
			if (terminal.kind === "fk") {
				throw new ConvexError(
					`Report filter field "${rule.field}" resolves to a related record, not a filterable value`
				);
			}
			if (terminal.granularity) {
				throw new ConvexError(
					`Report filter field "${rule.field}" is a time bucket, not a filterable value`
				);
			}
		}
	}
}

/** The dotted filter fields of a filter set, resolved once and keyed by field. */
function resolveFilterPaths(
	entityType: ReportEntityType,
	filters: ReportFilters | undefined
): Map<string, ResolvedPath> {
	const paths = new Map<string, ResolvedPath>();
	if (!filters) return paths;
	for (const group of filters.groups) {
		for (const rule of group.rules) {
			if (isRelatedPath(rule.field) && !paths.has(rule.field)) {
				paths.set(rule.field, resolveReportPath(entityType, rule.field));
			}
		}
	}
	return paths;
}

function validateAggregation(entityType: ReportEntityType, aggregation?: Aggregation): void {
	if (!aggregation || aggregation.op === "count") return;
	if (!aggregation.field) {
		throw new ConvexError(`Aggregation op "${aggregation.op}" requires a field`);
	}
	const def = getReportField(entityType, aggregation.field);
	if (!def) {
		throw new ConvexError(
			`Unknown report aggregation field "${aggregation.field}" for entity "${entityType}"`
		);
	}
	if (def.type !== "number" && def.type !== "currency") {
		throw new ConvexError(
			`Report aggregation field "${aggregation.field}" is not numeric for entity "${entityType}"`
		);
	}
}

function validateDetailColumns(entityType: ReportEntityType, columns: string[]): void {
	if (columns.length === 0) {
		throw new ConvexError(
			`Detail report requires at least one column for entity "${entityType}"`
		);
	}
	for (const column of columns) {
		if (!getReportField(entityType, column)) {
			throw new ConvexError(
				`Unknown report detail column "${column}" for entity "${entityType}"`
			);
		}
	}
}

// ============================================================================
// Scanning helper
// ============================================================================

interface ScanResult {
	rows: Row[];
	truncated: boolean;
	/** Tables whose hydration hit the budget; merged into metadata.truncatedEntities. */
	truncatedEntities: string[];
	/** Present whenever the scan resolved any dotted path. */
	hydrator?: PathHydrator;
}

async function scanFiltered(
	ctx: QueryCtx,
	entityType: ReportEntityType,
	orgId: Id<"organizations">,
	dateField: string,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined,
	timezone: string | undefined,
	groupByPath?: ResolvedPath
): Promise<ScanResult> {
	const filterPaths = resolveFilterPaths(entityType, filters);
	const hasPathFilters = filterPaths.size > 0;

	const predicate = (row: Row) => {
		if (!inDateBounds(row[dateField], bounds)) return false;
		// OR across rules forbids splitting direct rules from dotted ones, so one
		// dotted rule defers the whole set to post-scan — which means the ceiling
		// then counts date-bounded rows rather than filter-matched ones.
		if (!hasPathFilters && filters && !evaluateReportFilters(row, filters, timezone)) {
			return false;
		}
		return true;
	};

	// Early-exit only applies when the date filter is on _creationTime, since
	// the scan is creation-desc — anything past the bound genuinely can't match.
	const stopBelowCreationTime =
		dateField === "_creationTime" && bounds.hasDateFilter && bounds.start !== undefined
			? bounds.start
			: undefined;

	const { matches, truncated } = await scanOrgTable(ctx, entityType, orgId, {
		predicate,
		maxScan: REPORT_SCAN_CEILING,
		stopBelowCreationTime,
	});

	const paths = [...filterPaths.values(), ...(groupByPath ? [groupByPath] : [])];
	if (paths.length === 0) {
		return { rows: matches, truncated, truncatedEntities: [] };
	}

	// One hydrator per execution so the memo and the budget are shared; §8 d15
	// counts hydration reads against the same scan ceiling.
	const hydrator = await buildPathHydrator(
		async (id) =>
			(await ctx.db.get(id as Id<"clients">)) as Record<string, unknown> | null,
		matches,
		paths,
		Math.max(0, REPORT_SCAN_CEILING - matches.length)
	);

	let rows: Row[] = matches;
	if (hasPathFilters && filters) {
		const resolvePath: ReportPathResolver = (row, field) =>
			hydrator.resolve(row, filterPaths.get(field)!);
		rows = rows.filter((row) =>
			evaluateReportFilters(row, filters, timezone, resolvePath)
		);
	}

	return {
		rows,
		truncated: truncated || hydrator.truncated,
		truncatedEntities: hydrator.truncatedTables,
		hydrator,
	};
}

// ============================================================================
// Unified aggregation pipeline — serves both the legacy generic args path and
// v2 configs. Ordering/label/zero-fill semantics per PRD-reports-redesign §8
// d11: canonical options order, currency flags only when true, rows without a
// usable time-group timestamp excluded entirely.
// ============================================================================

const timeGroupingRegex = /^([a-zA-Z_]+)_(day|week|month)$/;

interface AggregationPlan {
	entityType: ReportEntityType;
	dateField: string;
	bounds: DateBoundsResult;
	filters?: ReportFilters;
	aggregation: Aggregation;
	groupBy?: string;
	segmentBy?: string;
	includeEmptyValues?: boolean;
	seriesLimit?: number;
	sort?: BucketSort;
	timezone?: string;
	/** Overrides metadata.groupBy (ratio metrics report their ratioKey). */
	metadataGroupBy?: string;
}

type BucketSort = "value_desc" | "value_asc" | "label_asc";

interface Bucket {
	key: string;
	label: string;
	rows: Row[];
	value: number;
	metadata?: Record<string, unknown>;
	segments?: Record<string, number>;
}

// §4.2: cap 8 segments plus an Other bucket.
const SEGMENT_CAP = 8;

function bucketKeyOf(raw: unknown): string {
	return raw === undefined || raw === null || raw === "" ? "unknown" : String(raw);
}

/** Row → bucket key; null for rows a time bucket can't place (dropped from data AND totals). */
type BucketKeyFn = (row: Row) => string | null;

function bucketLabel(def: ReportFieldDef | undefined, key: string): string {
	return def?.optionLabels?.[key] ?? capitalizeWords(key, /[-_]/);
}

function groupRows(rows: Row[], keyOf: BucketKeyFn): Record<string, Row[]> {
	const grouped: Record<string, Row[]> = {};
	for (const row of rows) {
		const key = keyOf(row);
		if (key !== null) (grouped[key] ??= []).push(row);
	}
	return grouped;
}

function buildTimeBuckets(
	rows: Row[],
	keyOf: BucketKeyFn,
	granularity: Granularity,
	aggregation: Aggregation
): Bucket[] {
	return Object.entries(groupRows(rows, keyOf))
		.map(([key, bucketRows]) => ({
			key,
			label: formatDateLabel(key, granularity),
			rows: bucketRows,
			value: computeAggregateValue(bucketRows, aggregation),
			metadata: { dateKey: key },
		}))
		.sort((a, b) => a.key.localeCompare(b.key));
}

function buildFieldBuckets(
	rows: Row[],
	keyOf: BucketKeyFn,
	def: ReportFieldDef,
	aggregation: Aggregation,
	includeEmptyValues: boolean
): Bucket[] {
	const grouped = groupRows(rows, keyOf);
	const toBucket = (key: string, bucketRows: Row[]): Bucket => ({
		key,
		label: bucketLabel(def, key),
		rows: bucketRows,
		value: computeAggregateValue(bucketRows, aggregation),
	});

	if (def.options) {
		// Canonical options order; values outside the vocabulary (and the
		// null/empty "unknown" bucket) append after, largest first.
		const canonical = def.options
			.map((option) => toBucket(option, grouped[option] ?? []))
			.filter((b) => includeEmptyValues || b.rows.length > 0);
		const extras = Object.entries(grouped)
			.filter(([key]) => !def.options!.includes(key))
			.map(([key, bucketRows]) => toBucket(key, bucketRows))
			.sort((a, b) => b.value - a.value);
		return [...canonical, ...extras];
	}

	return Object.entries(grouped)
		.map(([key, bucketRows]) => toBucket(key, bucketRows))
		.sort((a, b) => b.value - a.value);
}

/** Bucket key for rows whose groupBy path broke, suffixed with the missing hop's table. */
const BROKEN_KEY_PREFIX = "__broken:";

function isBrokenKey(key: string | null): boolean {
	return key !== null && key.startsWith(BROKEN_KEY_PREFIX);
}

const NO_RELATION_LABEL: Partial<Record<ReportRelationTarget, string>> = {
	clients: "No Client",
	projects: "No Project",
	quotes: "No Quote",
	invoices: "No Invoice",
	skus: "No SKU",
	users: "Unassigned",
};

function brokenBucketLabel(refType: string): string {
	return NO_RELATION_LABEL[refType as ReportRelationTarget] ?? "None";
}

function fkDocLabel(
	refType: ReportRelationTarget,
	doc: Row | null,
	key: string
): string {
	switch (refType) {
		case "users":
			return (doc?.name as string | undefined) ?? key;
		case "clients":
			return (doc?.companyName as string | undefined) || "Unknown Client";
		case "projects":
			return (doc?.title as string | undefined) || "Unknown Project";
		case "quotes":
			// quoteNumber is optional in schema.ts.
			return (doc?.quoteNumber as string | undefined) || "Unknown Quote";
		case "invoices":
			return (doc?.invoiceNumber as string | undefined) || "Unknown Invoice";
		case "skus":
			return (doc?.name as string | undefined) || "Unknown SKU";
		default:
			return key;
	}
}

async function resolveFkLabel(
	ctx: QueryCtx,
	fk: ReportGroupableFk,
	key: string
): Promise<string> {
	if (key === "unknown") {
		if (fk.refType === "users") return "Unassigned";
		if (fk.refType === "skus") return "No SKU";
		return "None";
	}
	const doc = (await ctx.db.get(key as Id<"users">)) as Row | null;
	return fkDocLabel(fk.refType, doc, key);
}

/**
 * The single row→bucket-key definition: aggregation buckets on it and detail
 * drill-down re-derives the same keys to scope its rows. Throws the groupBy
 * validation errors for direct (non-path) fields.
 */
function bucketKeyResolver(
	entityType: ReportEntityType,
	groupBy: string,
	timezone: string | undefined,
	groupByPath?: ResolvedPath,
	hydrator?: PathHydrator
): BucketKeyFn {
	if (groupByPath && hydrator) {
		const { terminal } = groupByPath;
		const granularity =
			terminal.kind === "field" ? terminal.granularity : undefined;
		return (row) => {
			const resolution = hydrator.resolve(row, groupByPath);
			if ("brokenAt" in resolution) {
				// A timeline has no "No X" bucket — unreachable rows drop out entirely.
				return granularity ? null : BROKEN_KEY_PREFIX + resolution.brokenAt.refType;
			}
			if (granularity) {
				return typeof resolution.value === "number"
					? getDateKey(resolution.value, granularity, timezone)
					: null;
			}
			return bucketKeyOf(resolution.value);
		};
	}

	const timeMatch = groupBy.match(timeGroupingRegex);
	if (timeMatch) {
		const resolved = resolveGroupByField(entityType, timeMatch[1]);
		if (!resolved) {
			throw new ConvexError(
				`Unknown report groupBy time field "${timeMatch[1]}" for entity "${entityType}"`
			);
		}
		if (resolved.def.type !== "timestamp") {
			throw new ConvexError(
				`Report groupBy time field "${timeMatch[1]}" is not a timestamp for entity "${entityType}"`
			);
		}
		const { sourceField } = resolved;
		const granularity = timeMatch[2] as Granularity;
		return (row) => {
			const value = row[sourceField];
			return typeof value === "number" ? getDateKey(value, granularity, timezone) : null;
		};
	}

	if (getGroupableFk(entityType, groupBy)) {
		return (row) => bucketKeyOf(row[groupBy]);
	}

	const resolved = resolveGroupByField(entityType, groupBy);
	if (!resolved) {
		throw new ConvexError(
			`Unknown report groupBy field "${groupBy}" for entity "${entityType}"`
		);
	}
	if (resolved.def.type === "timestamp") {
		throw new ConvexError(
			`Report groupBy field "${groupBy}" is a timestamp — use "${groupBy}_day", "${groupBy}_week", or "${groupBy}_month"`
		);
	}
	const { sourceField } = resolved;
	return (row) => bucketKeyOf(row[sourceField]);
}

function applySegments(
	buckets: Bucket[],
	rows: Row[],
	sourceField: string,
	def: ReportFieldDef,
	aggregation: Aggregation
): { key: string; label: string }[] {
	const segmentKeyOf: BucketKeyFn = (row) => bucketKeyOf(row[sourceField]);
	// Rank segment keys over the whole scan so every bucket shares one key set.
	const globalGroups = groupRows(rows, segmentKeyOf);
	const ranked = Object.entries(globalGroups)
		.map(([key, segRows]) => ({ key, value: computeAggregateValue(segRows, aggregation) }))
		.sort((a, b) => b.value - a.value);
	const topKeys = new Set(ranked.slice(0, SEGMENT_CAP).map((s) => s.key));
	const hasOther = ranked.length > SEGMENT_CAP;

	for (const bucket of buckets) {
		if (bucket.rows.length === 0) continue;
		const perSegment: Record<string, Row[]> = {};
		for (const row of bucket.rows) {
			const raw = bucketKeyOf(row[sourceField]);
			const key = topKeys.has(raw) ? raw : "other";
			(perSegment[key] ??= []).push(row);
		}
		bucket.segments = Object.fromEntries(
			Object.entries(perSegment).map(([key, segRows]) => [
				key,
				computeAggregateValue(segRows, aggregation),
			])
		);
	}

	return [
		...ranked
			.slice(0, SEGMENT_CAP)
			.map(({ key }) => ({ key, label: bucketLabel(def, key) })),
		...(hasOther ? [{ key: "other", label: "Other" }] : []),
	];
}

// ============================================================================
// Comparison ranges (R11): a second scan over the earlier window, merged into
// the current series by calendar position — never by array index, since both
// series only have buckets where records exist.
// ============================================================================

interface ComparisonRun {
	bounds: DateBoundsResult;
	/** Comparison bucket key → the current-series key it pairs with; null drops it. */
	shiftKey: (key: string) => string | null;
}

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

function shiftMonthKey(key: string, months: number): string {
	const [year, month] = key.split("-").map(Number);
	const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
	return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}`;
}

function shiftDayKey(key: string, days: number): string {
	const [year, month, day] = key.split("-").map(Number);
	const shifted = new Date(Date.UTC(year, month - 1, day + days));
	return shifted.toISOString().split("T")[0];
}

function daysBetweenKeys(from: string, to: string): number {
	return Math.round(
		(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
	);
}

function monthsBetweenKeys(from: string, to: string): number {
	const [fromYear, fromMonth] = from.split("-").map(Number);
	const [toYear, toMonth] = to.split("-").map(Number);
	return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

function timeGranularityOf(
	entityType: ReportEntityType,
	groupBy: string | undefined
): Granularity | undefined {
	if (!groupBy) return undefined;
	if (isRelatedPath(groupBy)) {
		const { terminal } = resolveReportPath(entityType, groupBy);
		return terminal.kind === "field" ? terminal.granularity : undefined;
	}
	const match = groupBy.match(timeGroupingRegex);
	return match ? (match[2] as Granularity) : undefined;
}

/**
 * Time buckets pair by calendar slot, so a comparison key is moved forward by
 * the offset between the two windows and then matched byte-for-byte against
 * the current keys. Non-time buckets (enum, FK, dotted, `__broken:`) pair on
 * their raw key.
 */
function comparisonKeyShift(
	granularity: Granularity | undefined,
	kind: ReportDateComparison["kind"],
	current: { start: number },
	compare: { start: number },
	timezone: string | undefined
): (key: string) => string | null {
	if (!granularity) return (key) => key;

	if (kind === "previous_year") {
		if (granularity === "month") return (key) => shiftMonthKey(key, 12);
		// 52 aligned weeks keeps the shifted key on a Sunday, as week keys are.
		if (granularity === "week") return (key) => shiftDayKey(key, 364);
		return (key) => {
			const [year, month, day] = key.split("-").map(Number);
			// Feb 29 has no counterpart in the following (never leap) year.
			if (month === 2 && day === 29) return null;
			return `${year + 1}-${pad2(month)}-${pad2(day)}`;
		};
	}

	const currentStart = DateUtils.toLocalDateString(current.start, timezone);
	const compareStart = DateUtils.toLocalDateString(compare.start, timezone);
	if (granularity === "month") {
		const months = monthsBetweenKeys(compareStart, currentStart);
		return (key) => shiftMonthKey(key, months);
	}
	const days = daysBetweenKeys(compareStart, currentStart);
	if (granularity === "week") {
		const weekAlignedDays = Math.round(days / 7) * 7;
		return (key) => shiftDayKey(key, weekAlignedDays);
	}
	return (key) => shiftDayKey(key, days);
}

/**
 * Comparison bounds + bucket pairing for a config, or undefined when it has no
 * comparison. The throws are backstops for the gating lib/reportQueryArgs
 * already applies (`comparisonIsExecutable`) — reachable only if a caller
 * skipped it. Detail requests never get here: drill-down on a compared report
 * ignores the comparison rather than failing.
 */
function resolveComparisonRun(
	config: ReportConfigV2,
	current: DateBoundsResult,
	timezone: string | undefined
): ComparisonRun | undefined {
	const comparison = config.date?.comparison;
	if (!comparison) return undefined;
	if (config.segmentBy) {
		throw new ConvexError(
			`Report comparison ranges are not supported with segmentBy "${config.segmentBy}"`
		);
	}
	const range = config.date?.range;
	const unbounded =
		!range ||
		(range.kind === "preset" && range.preset === "all_time") ||
		(range.kind === "absolute" && (range.start === undefined || range.end === undefined));
	if (unbounded || current.start === undefined || current.end === undefined) {
		throw new ConvexError(
			`Report comparison ranges require a date range with both bounds`
		);
	}

	const compare = resolveComparisonRange(
		range,
		comparison,
		{ start: current.start, end: current.end },
		timezone
	);
	// Undefined only for an unbounded preset, rejected above.
	if (!compare) return undefined;

	return {
		bounds: { start: compare.start, end: compare.end, hasDateFilter: true },
		shiftKey: comparisonKeyShift(
			timeGranularityOf(config.entityType, config.groupBy),
			comparison.kind,
			{ start: current.start },
			compare,
			timezone
		),
	};
}

async function runAggregationPlan(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	plan: AggregationPlan,
	comparison?: ComparisonRun
): Promise<ReportDataResult> {
	const { entityType, aggregation } = plan;
	const groupByPath =
		plan.groupBy && isRelatedPath(plan.groupBy)
			? resolveReportPath(entityType, plan.groupBy)
			: undefined;
	const scanned = await scanFiltered(
		ctx,
		entityType,
		orgId,
		plan.dateField,
		plan.bounds,
		plan.filters,
		plan.timezone,
		groupByPath
	);
	const truncated = scanned.truncated;
	let rows = scanned.rows;

	let buckets: Bucket[] | undefined;
	let fk: ReportGroupableFk | undefined;
	let fieldGrouping: ReportFieldDef | undefined;
	let resolveLabel: ((key: string) => Promise<string>) | undefined;
	let pathTimeBucketed = false;

	if (plan.groupBy) {
		const groupBy = plan.groupBy;
		const keyOf = bucketKeyResolver(
			entityType,
			groupBy,
			plan.timezone,
			groupByPath,
			scanned.hydrator
		);
		const fkBuckets = (): Bucket[] =>
			Object.entries(groupRows(rows, keyOf))
				.map(([key, bucketRows]) => ({
					key,
					label: key,
					rows: bucketRows,
					value: computeAggregateValue(bucketRows, aggregation),
					metadata: { [groupBy]: key },
				}))
				.sort((a, b) => b.value - a.value);

		const terminal = groupByPath && scanned.hydrator ? groupByPath.terminal : undefined;
		const timeMatch = terminal ? null : groupBy.match(timeGroupingRegex);
		fk = terminal ? undefined : getGroupableFk(entityType, groupBy);
		if (terminal) {
			if (terminal.kind === "field" && terminal.granularity) {
				// Rows with no reachable timestamp are excluded from data AND totals.
				rows = rows.filter((row) => keyOf(row) !== null);
				buckets = buildTimeBuckets(rows, keyOf, terminal.granularity, aggregation);
				pathTimeBucketed = true;
			} else if (terminal.kind === "fk") {
				const refType = terminal.refType;
				buckets = fkBuckets();
				resolveLabel = async (key) =>
					isBrokenKey(key)
						? brokenBucketLabel(key.slice(BROKEN_KEY_PREFIX.length))
						: fkDocLabel(
								refType,
								(await ctx.db.get(key as Id<"users">)) as Row | null,
								key
							);
			} else {
				fieldGrouping = terminal.def;
				const reached: Row[] = [];
				const broken: Row[] = [];
				for (const row of rows) {
					(isBrokenKey(keyOf(row)) ? broken : reached).push(row);
				}
				buckets = [
					...buildFieldBuckets(
						reached,
						keyOf,
						terminal.def,
						aggregation,
						plan.includeEmptyValues ?? false
					),
					...Object.entries(groupRows(broken, keyOf)).map(([key, bucketRows]) => ({
						key,
						label: brokenBucketLabel(key.slice(BROKEN_KEY_PREFIX.length)),
						rows: bucketRows,
						value: computeAggregateValue(bucketRows, aggregation),
					})),
				];
			}
		} else if (timeMatch) {
			// Rows without a usable timestamp can't be bucketed — excluded from
			// data AND totals (matches legacy scanPaidInvoices semantics).
			rows = rows.filter((row) => keyOf(row) !== null);
			buckets = buildTimeBuckets(rows, keyOf, timeMatch[2] as Granularity, aggregation);
		} else if (fk) {
			const fkRef = fk;
			buckets = fkBuckets();
			resolveLabel = (key) => resolveFkLabel(ctx, fkRef, key);
		} else {
			// Presence and non-timestamp type already enforced by bucketKeyResolver.
			fieldGrouping = resolveGroupByField(entityType, groupBy)!.def;
			buckets = buildFieldBuckets(
				rows,
				keyOf,
				fieldGrouping,
				aggregation,
				plan.includeEmptyValues ?? false
			);
		}
	}

	let segmentMeta: { key: string; label: string }[] | undefined;
	if (plan.segmentBy && buckets) {
		const seg = resolveGroupByField(entityType, plan.segmentBy);
		if (!seg || seg.def.type === "timestamp" || getGroupableFk(entityType, plan.segmentBy)) {
			throw new ConvexError(
				`Unknown report segmentBy field "${plan.segmentBy}" for entity "${entityType}"`
			);
		}
		segmentMeta = applySegments(buckets, rows, seg.sourceField, seg.def, aggregation);
	}

	// User sort (R9) never reorders time buckets (a timeline stays
	// chronological), and label_asc is skipped for FK grouping — labels only
	// resolve for the displayed buckets, after the slice below.
	const timeBucketed =
		pathTimeBucketed || (plan.groupBy ? timeGroupingRegex.test(plan.groupBy) : false);
	const fkBucketed = fk !== undefined || groupByPath?.terminal.kind === "fk";
	if (buckets && plan.sort && !timeBucketed && !(fkBucketed && plan.sort === "label_asc")) {
		const sort = plan.sort;
		buckets = [...buckets].sort((a, b) =>
			sort === "value_desc"
				? b.value - a.value
				: sort === "value_asc"
					? a.value - b.value
					: a.label.localeCompare(b.label)
		);
	}

	if (buckets && plan.seriesLimit !== undefined && Number.isFinite(plan.seriesLimit)) {
		buckets = buckets.slice(0, Math.max(1, Math.floor(plan.seriesLimit)));
	}

	if (buckets && resolveLabel) {
		const resolve = resolveLabel;
		await Promise.all(
			buckets.map(async (bucket) => {
				bucket.label = await resolve(bucket.key);
			})
		);
	}

	// Grouped count reports on entities with a summary value field keep the
	// legacy per-bucket dollar column and currency grand total (§8 d11).
	const summaryField =
		aggregation.op === "count" && fieldGrouping
			? REPORT_FIELDS[entityType].summaryValueField
			: undefined;
	if (summaryField && buckets) {
		for (const bucket of buckets) {
			bucket.metadata = {
				...bucket.metadata,
				totalValue: bucket.rows.reduce((sum, r) => sum + num(r[summaryField]), 0),
			};
		}
	}

	const data: AggregatedDataPoint[] = buckets
		? buckets.map((b) => ({
				label: b.label,
				value: b.value,
				bucketKey: b.key,
				...(b.metadata ? { metadata: b.metadata } : {}),
				...(b.segments ? { segments: b.segments } : {}),
			}))
		: [{ label: "Total", value: computeAggregateValue(rows, aggregation) }];

	const aggFieldDef = aggregation.field
		? getReportField(entityType, aggregation.field)
		: undefined;
	const isCurrencyAgg = aggregation.op !== "count" && aggFieldDef?.type === "currency";
	const total = summaryField
		? rows.reduce((sum, r) => sum + num(r[summaryField]), 0)
		: computeAggregateValue(rows, aggregation);

	// The comparison series is the same plan over the earlier window: no
	// segments, no slice, no sort — only its bucket values and scan-wide total
	// are read, and the survivors of THIS series' slice keep their labels/order.
	let compared: ReportDataResult | undefined;
	if (comparison) {
		compared = await runAggregationPlan(ctx, orgId, {
			...plan,
			bounds: comparison.bounds,
			segmentBy: undefined,
			seriesLimit: undefined,
			sort: undefined,
		});
		const paired = new Map<string, number>();
		for (const point of compared.data) {
			if (point.bucketKey === undefined) continue;
			const key = comparison.shiftKey(point.bucketKey);
			if (key !== null) paired.set(key, point.value);
		}
		for (const point of data) {
			const value =
				point.bucketKey === undefined ? undefined : paired.get(point.bucketKey);
			if (value !== undefined) point.compareValue = value;
		}
	}

	return {
		data,
		total,
		metadata: {
			entityType,
			dateRange: metadataDateRange(plan.bounds),
			groupBy: plan.metadataGroupBy ?? plan.groupBy,
			truncated,
			...(scanned.truncatedEntities.length > 0
				? { truncatedEntities: scanned.truncatedEntities }
				: {}),
			...(summaryField || isCurrencyAgg ? { totalIsCurrency: true } : {}),
			...(isCurrencyAgg ? { itemValueIsCurrency: true } : {}),
			...(plan.segmentBy && segmentMeta
				? { segmentBy: plan.segmentBy, segments: segmentMeta }
				: {}),
			...(compared
				? {
						compareTotal: compared.total,
						compareTruncated: compared.metadata?.truncated ?? false,
					}
				: {}),
		},
	};
}

// ============================================================================
// Detail pipeline (used only when args.detail is set; the aggregation is
// ignored, and groupBy only serves detail.bucketKey drill-down scoping)
// ============================================================================

/**
 * The row's FK ids, keyed by edge field — the drill-down sheet's parent links.
 * Independent of the requested columns: REPORT_FIELDS excludes ids on purpose,
 * so `refs` is the only place a report exposes them.
 */
function rowRefs(
	entityType: ReportEntityType,
	row: Row
): Record<string, string> | undefined {
	let refs: Record<string, string> | undefined;
	for (const field of Object.keys(REPORT_RELATIONS[entityType])) {
		const value = row[field];
		if (value === undefined || value === null) continue;
		(refs ??= {})[field] = String(value);
	}
	return refs;
}

function detailCellValue(value: unknown): string | number | boolean | null {
	if (value === undefined || value === null) return null;
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}
	return String(value);
}

async function runDetailReport(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	entityType: ReportEntityType,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined,
	detail: DetailArgs,
	timezone: string | undefined,
	dateFieldOverride?: string,
	groupBy?: string
): Promise<ReportDataResult> {
	validateDetailColumns(entityType, detail.columns);

	const bucketKey = detail.bucketKey;
	if (bucketKey !== undefined && !groupBy) {
		throw new ConvexError(
			`Detail bucketKey "${bucketKey}" requires a groupBy in the report config`
		);
	}
	// Only a scoped request pays for path hydration — unscoped detail is untouched.
	const groupByPath =
		bucketKey !== undefined && groupBy && isRelatedPath(groupBy)
			? resolveReportPath(entityType, groupBy)
			: undefined;

	const dateField = dateFieldOverride ?? getReportDateField(entityType);
	const scanned = await scanFiltered(
		ctx,
		entityType,
		orgId,
		dateField,
		bounds,
		filters,
		timezone,
		groupByPath
	);
	const { truncated, truncatedEntities } = scanned;

	let rows = scanned.rows;
	if (bucketKey !== undefined && groupBy) {
		const keyOf = bucketKeyResolver(
			entityType,
			groupBy,
			timezone,
			groupByPath,
			scanned.hydrator
		);
		rows = rows.filter((row) => keyOf(row) === bucketKey);
	}

	// Sort is exact over the scanned window; if the scan hit its ceiling
	// (metadata.truncated), top-N by a non-creation date field is approximate —
	// the truncation banner is the surface for that.
	const sorted = [...rows].sort((a, b) => {
		const aVal = a[dateField];
		const bVal = b[dateField];
		const aNum = typeof aVal === "number" ? aVal : undefined;
		const bNum = typeof bVal === "number" ? bVal : undefined;
		if (aNum === undefined && bNum === undefined) return 0;
		if (aNum === undefined) return 1;
		if (bNum === undefined) return -1;
		return bNum - aNum;
	});

	const totalMatched = sorted.length;
	const cap = Math.min(Math.max(detail.limit ?? 100, 1), 1000);
	const cappedRows = sorted.slice(0, cap);

	const columns = detail.columns.map((field) => {
		const def = getReportField(entityType, field);
		// Presence already validated by validateDetailColumns.
		return { field, label: def!.label, type: def!.type };
	});

	const rowsOut = cappedRows.map((row) => {
		const cells: Record<string, string | number | boolean | null> = {};
		for (const field of detail.columns) {
			cells[field] = detailCellValue(row[field]);
		}
		const refs = rowRefs(entityType, row);
		return {
			id: String(row._id),
			...(refs ? { refs } : {}),
			...cells,
		} as DetailRow;
	});

	return {
		data: [],
		total: totalMatched,
		metadata: {
			entityType,
			dateRange: metadataDateRange(bounds),
			truncated,
			...(truncatedEntities.length > 0 ? { truncatedEntities } : {}),
		},
		detail: {
			columns,
			rows: rowsOut,
			totalMatched,
			rowsTruncated: totalMatched > cap,
		},
	};
}

// ============================================================================
// Public export
// ============================================================================

/**
 * The permission object a report over each entity reads from.
 *
 * `activities` is absent on purpose: an activity row can carry ANY entity type,
 * including the `user` rows (member_permissions_updated) that activities.ts
 * restricts to admins, so there is no single object that covers it.
 */
const REPORT_PERMISSION_OBJECT: Record<
	Exclude<ReportEntityType, "activities">,
	PermissionObject
> = {
	clients: "clients",
	projects: "projects",
	tasks: "tasks",
	quotes: "quotes",
	invoices: "invoices",
	// Payments and line items have no standalone RBAC objects — payments.ts
	// gates every payment on the invoices object; line items follow their parent.
	payments: "invoices",
	invoiceLineItems: "invoices",
	quoteLineItems: "quotes",
};

/**
 * Gate a report on the entity it reads, not just on `reports:view`.
 *
 * `reports:view` alone was the only check, which made it a grant escalation:
 * it reads in the UI as "let them see reports" but also handed over unscoped
 * raw reads of clients, projects, tasks, quotes, invoices and activities —
 * defeating the very grants an admin had deliberately withheld. Detail reports
 * return raw document fields.
 *
 * allRecords is required, not merely `view`, for the same reason the automation
 * engine requires it: a report is an org-wide scan by construction (scanOrgTable
 * pages `by_org` with a 10,000-row ceiling and no record filter), so a caller
 * who can only see their own assignments must not be able to run one. Owners and
 * admins resolve to "all" grants and are unaffected.
 */
async function requireReportEntityAccess(
	ctx: Parameters<typeof getEffectivePermissions>[0] & {
		requireLevel: (o: PermissionObject, l: "view") => Promise<void>;
		requireRecordScope: (
			o: PermissionObject,
			isInScope: () => boolean | Promise<boolean>
		) => Promise<void>;
	},
	entityType: ReportEntityType
): Promise<void> {
	if (entityType === "activities") {
		// The audit trail spans every object type and includes permission-change
		// rows; only owners/admins ("all") may report over it.
		const grants = await getEffectivePermissions(ctx);
		if (grants !== "all") {
			denyPermission({ object: "reports", level: "view", detail: "activities report" });
		}
		return;
	}
	const object = REPORT_PERMISSION_OBJECT[entityType];
	await ctx.requireLevel(object, "view");
	// Denies unless the caller holds allRecords; requireRecordScope short-circuits
	// for hasAllRecords and otherwise runs this predicate.
	await ctx.requireRecordScope(object, () => false);
}

/**
 * Every drillable table a config's dotted paths reach needs its own report
 * access, fail closed (§8 d15, R5 precedent). users/skus terminals are
 * label-only and excluded by pathTables.
 */
async function requireReportPathAccess(
	ctx: Parameters<typeof requireReportEntityAccess>[0],
	config: ReportConfigV2
): Promise<void> {
	const paths = [
		...resolveFilterPaths(
			config.entityType,
			config.filters as ReportFilters | undefined
		).values(),
		...(config.groupBy && isRelatedPath(config.groupBy)
			? [resolveReportPath(config.entityType, config.groupBy)]
			: []),
	];
	for (const table of new Set(paths.flatMap(pathTables))) {
		await requireReportEntityAccess(ctx, table);
	}
}

/**
 * Resolve a v2 config's date field + bounds. Preset ranges resolve server-side
 * in the org timezone at execution (saved "this month" reports roll forward);
 * `date.comparison` resolves off these bounds in resolveComparisonRun.
 */
function resolveConfigDatesFor(
	entityType: ReportEntityType,
	date: ReportConfigV2["date"],
	timezone: string | undefined
): { dateField: string; bounds: DateBoundsResult } {
	if (date?.field) {
		const def = getReportField(entityType, date.field);
		if (!def || def.type !== "timestamp") {
			throw new ConvexError(
				`Unknown report date field "${date.field}" for entity "${entityType}"`
			);
		}
	}
	const range = date?.range;
	const bounds =
		range === undefined
			? resolveDateBounds(undefined)
			: range.kind === "preset"
				? resolveDateBounds(resolveDateRangePreset(range.preset, timezone))
				: resolveDateBounds({ start: range.start, end: range.end });
	return { dateField: date?.field ?? getReportDateField(entityType), bounds };
}

function resolveConfigDates(
	config: ReportConfigV2,
	timezone: string | undefined
): { dateField: string; bounds: DateBoundsResult } {
	return resolveConfigDatesFor(config.entityType, config.date, timezone);
}

function planFromConfig(
	config: ReportConfigV2,
	seriesLimit: number | undefined,
	timezone: string | undefined,
	sort?: BucketSort
): AggregationPlan {
	const metric = config.metric;
	if (metric.op === "ratio") {
		throw new ConvexError(`Report metric op "${metric.op}" is not executable yet`);
	}
	const { dateField, bounds } = resolveConfigDates(config, timezone);
	return {
		entityType: config.entityType,
		dateField,
		bounds,
		filters: config.filters as ReportFilters | undefined,
		aggregation: { op: metric.op, ...(metric.field ? { field: metric.field } : {}) },
		groupBy: config.groupBy,
		segmentBy: config.segmentBy,
		includeEmptyValues: config.includeEmptyValues,
		seriesLimit,
		sort,
		timezone,
	};
}

/**
 * Registry-declared ratio metrics (§3.3, executable from R4b). Output shape is
 * pinned byte-exact to the legacy dispatch: two fixed data rows, `total` IS the
 * integer percentage, metadata.groupBy reports the ratioKey.
 */
async function runRatioMetric(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	config: ReportConfigV2,
	ratioKey: RatioKey,
	timezone: string | undefined,
	compareBounds?: DateBoundsResult
): Promise<ReportDataResult> {
	const def = RATIO_METRICS[ratioKey];
	const entityType = config.entityType;
	if (def.entityType !== entityType) {
		throw new ConvexError(
			`Ratio metric "${ratioKey}" is not available for entity "${entityType}"`
		);
	}
	if (config.groupBy || config.segmentBy) {
		throw new ConvexError(`Ratio metric "${ratioKey}" does not support grouping`);
	}

	const { dateField, bounds } = resolveConfigDates(config, timezone);
	const over = async (window: DateBoundsResult) => {
		const { rows, truncated, truncatedEntities } = await scanFiltered(
			ctx,
			entityType,
			orgId,
			dateField,
			window,
			config.filters as ReportFilters | undefined,
			timezone
		);
		const inSet = (values: string[]) => (r: Row) => values.includes(str(r[def.field]));
		const denominator = def.denominatorValues
			? rows.filter(inSet(def.denominatorValues))
			: rows;
		const numerator = rows.filter(inSet(def.numeratorValues));
		const secondRow = def.rows[1];
		return {
			percentage:
				denominator.length > 0
					? Math.round((numerator.length / denominator.length) * 100)
					: 0,
			numerator: numerator.length,
			secondValue:
				"values" in secondRow
					? rows.filter(inSet(secondRow.values)).length
					: denominator.length - numerator.length,
			truncated,
			truncatedEntities,
		};
	};

	const current = await over(bounds);
	const compared = compareBounds ? await over(compareBounds) : undefined;

	return {
		data: [
			{ label: def.rows[0].label, value: current.numerator },
			{ label: def.rows[1].label, value: current.secondValue },
		],
		total: current.percentage,
		metadata: {
			entityType,
			dateRange: metadataDateRange(bounds),
			groupBy: ratioKey,
			truncated: current.truncated,
			...(current.truncatedEntities.length > 0
				? { truncatedEntities: current.truncatedEntities }
				: {}),
			...(compared
				? { compareTotal: compared.percentage, compareTruncated: compared.truncated }
				: {}),
		},
	};
}

export const executeReport = optionalUserQuery({
	args: {
		entityType: reportEntityTypeValidator,
		detail: detailValidator,
		config: reportConfigV2Validator,
		seriesLimit: v.optional(v.number()),
		sort: v.optional(
			v.union(
				v.literal("value_desc"),
				v.literal("value_asc"),
				v.literal("label_asc")
			)
		),
	},
	handler: async (ctx, args): Promise<ReportDataResult> => {
		if (!ctx.orgId) return emptyReportResult();
		await ctx.requireLevel("reports", "view");
		const orgId = ctx.orgId;

		const entityType = args.entityType;
		await requireReportEntityAccess(ctx, entityType);
		const detail = args.detail as DetailArgs | undefined;

		const config = args.config as ReportConfigV2;
		if (config.entityType !== entityType) {
			throw new ConvexError(
				`config.entityType "${config.entityType}" does not match entityType "${entityType}"`
			);
		}
		const configFilters = config.filters as ReportFilters | undefined;
		validateConfigFilters(entityType, configFilters);
		await requireReportPathAccess(ctx, config);
		const timezone = await getOrgTimezoneById(ctx, orgId);

		// Detail mode is a caller decision — it composes with any config.
		if (detail) {
			const { dateField, bounds } = resolveConfigDates(config, timezone);
			return await runDetailReport(
				ctx,
				orgId,
				entityType,
				bounds,
				configFilters,
				detail,
				timezone,
				dateField,
				config.groupBy
			);
		}
		if (config.metric.op === "ratio") {
			if (!config.metric.ratioKey) {
				throw new ConvexError(`Ratio metric requires a ratioKey`);
			}
			const { bounds } = resolveConfigDates(config, timezone);
			return await runRatioMetric(
				ctx,
				orgId,
				config,
				config.metric.ratioKey,
				timezone,
				resolveComparisonRun(config, bounds, timezone)?.bounds
			);
		}
		const plan = planFromConfig(config, args.seriesLimit, timezone, args.sort);
		validateAggregation(entityType, plan.aggregation);
		return await runAggregationPlan(
			ctx,
			orgId,
			plan,
			resolveComparisonRun(config, plan.bounds, timezone)
		);
	},
});

// Re-export field registry types for internal reuse (e.g. by future callers
// that want to introspect what a report can filter/group on).
export type { ReportEntityType } from "./lib/reportFields";
export { REPORT_FIELDS } from "./lib/reportFields";
