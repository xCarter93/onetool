import { QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getOrgTimezoneById } from "./lib/organization";
import { DateUtils } from "./lib/shared";
import { optionalUserQuery } from "./lib/factories";
import {
	scanOrgTable,
	REPORT_SCAN_CEILING,
	type ReportTable,
} from "./lib/orgScan";
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
	type ReportMetric,
} from "./lib/reportConfig";
import { resolveDateRangePreset } from "./lib/reportDates";
import {
	reportFiltersValidator,
	evaluateReportFilters,
	type ReportFilters,
} from "./lib/reportFilters";
import type { PermissionObject } from "./lib/permissionKeys";
import { denyPermission, getEffectivePermissions } from "./lib/permissions";

/**
 * Report Data Queries
 * Provides aggregated data for report visualizations and analytics.
 *
 * executeReport is the only public export — it runs a bounded, org-scoped
 * index scan (never `.collect()`s a whole org table) and groups in memory
 * through one unified pipeline. Requests arrive as v2 configs (the `config`
 * arg, built by lib/reportQueryArgs from any caller state including v1 magic
 * keys via the expander); the standalone aggregation/detail args survive only
 * for tests until R14 deletes them. The 14-function legacy dispatch was
 * retired at R4c — its outputs are pinned by __goldens__/report-legacy-dispatch.json,
 * which reportDualRun.test.ts holds this pipeline to.
 */

// ============================================================================
// Types
// ============================================================================

export interface AggregatedDataPoint {
	label: string;
	value: number;
	metadata?: Record<string, unknown>;
	/** Per-segment values, present only when the request set segmentBy. */
	segments?: Record<string, number>;
}

export interface ReportDataResult {
	data: AggregatedDataPoint[];
	total: number;
	metadata?: {
		entityType: string;
		dateRange?: { start: number; end: number };
		groupBy?: string;
		truncated?: boolean;
		/** Which scans hit their ceiling; present only on truncated related rollups. */
		truncatedEntities?: string[];
		totalIsCurrency?: boolean;
		itemValueIsCurrency?: boolean;
		segmentBy?: string;
		/** Ordered segment keys (top-N by value plus "other"), present only when segmented. */
		segments?: { key: string; label: string }[];
	};
	detail?: {
		columns: { field: string; label: string; type: ReportFieldType }[];
		rows: Record<string, string | number | boolean | null>[];
		totalMatched: number;
		rowsTruncated: boolean;
	};
}

type Row = Record<string, unknown>;

const emptyReportResult = (): ReportDataResult => ({ data: [], total: 0 });

// ============================================================================
// Validators
// ============================================================================

const dateRangeValidator = v.optional(
	v.object({
		start: v.optional(v.number()),
		end: v.optional(v.number()),
	})
);

const aggregationValidator = v.optional(
	v.object({
		op: v.union(
			v.literal("count"),
			v.literal("sum"),
			v.literal("avg"),
			v.literal("min"),
			v.literal("max")
		),
		field: v.optional(v.string()),
	})
);

type AggregationOp = "count" | "sum" | "avg" | "min" | "max";
interface Aggregation {
	op: AggregationOp;
	field?: string;
}

const detailValidator = v.optional(
	v.object({
		columns: v.array(v.string()),
		limit: v.optional(v.number()),
	})
);

interface DetailArgs {
	columns: string[];
	limit?: number;
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

function validateFilters(entityType: ReportEntityType, filters?: ReportFilters): void {
	if (!filters) return;
	for (const group of filters.groups) {
		for (const rule of group.rules) {
			if (!getReportField(entityType, rule.field)) {
				throw new ConvexError(
					`Unknown report filter field "${rule.field}" for entity "${entityType}"`
				);
			}
		}
	}
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

async function scanFiltered(
	ctx: QueryCtx,
	table: ReportTable,
	orgId: Id<"organizations">,
	dateField: string,
	bounds: DateBoundsResult,
	filters: ReportFilters | undefined,
	timezone: string | undefined
): Promise<{ rows: Row[]; truncated: boolean }> {
	const predicate = (row: Row) => {
		if (!inDateBounds(row[dateField], bounds)) return false;
		if (filters && !evaluateReportFilters(row, filters, timezone)) return false;
		return true;
	};

	// Early-exit only applies when the date filter is on _creationTime, since
	// the scan is creation-desc — anything past the bound genuinely can't match.
	const stopBelowCreationTime =
		dateField === "_creationTime" && bounds.hasDateFilter && bounds.start !== undefined
			? bounds.start
			: undefined;

	const { matches, truncated } = await scanOrgTable(ctx, table, orgId, {
		predicate,
		maxScan: REPORT_SCAN_CEILING,
		stopBelowCreationTime,
	});

	return { rows: matches, truncated };
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

function bucketLabel(def: ReportFieldDef | undefined, key: string): string {
	return def?.optionLabels?.[key] ?? capitalizeWords(key, /[-_]/);
}

function groupRows(rows: Row[], sourceField: string): Record<string, Row[]> {
	const grouped: Record<string, Row[]> = {};
	for (const row of rows) {
		(grouped[bucketKeyOf(row[sourceField])] ??= []).push(row);
	}
	return grouped;
}

function buildTimeBuckets(
	rows: Row[],
	sourceField: string,
	granularity: Granularity,
	timezone: string | undefined,
	aggregation: Aggregation
): Bucket[] {
	const grouped: Record<string, Row[]> = {};
	for (const row of rows) {
		const key = getDateKey(row[sourceField] as number, granularity, timezone);
		(grouped[key] ??= []).push(row);
	}
	return Object.entries(grouped)
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
	sourceField: string,
	def: ReportFieldDef,
	aggregation: Aggregation,
	includeEmptyValues: boolean
): Bucket[] {
	const grouped = groupRows(rows, sourceField);
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

function fkDocLabel(
	refType: ReportGroupableFk["refType"],
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
		case "invoices":
			return (doc?.invoiceNumber as string | undefined) || "Unknown Invoice";
		case "skus":
			return (doc?.name as string | undefined) || "Unknown SKU";
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

function applySegments(
	buckets: Bucket[],
	rows: Row[],
	sourceField: string,
	def: ReportFieldDef,
	aggregation: Aggregation
): { key: string; label: string }[] {
	// Rank segment keys over the whole scan so every bucket shares one key set.
	const globalGroups = groupRows(rows, sourceField);
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

async function runAggregationPlan(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	plan: AggregationPlan
): Promise<ReportDataResult> {
	const { entityType, aggregation } = plan;
	const scanned = await scanFiltered(
		ctx,
		entityType,
		orgId,
		plan.dateField,
		plan.bounds,
		plan.filters,
		plan.timezone
	);
	const truncated = scanned.truncated;
	let rows = scanned.rows;

	let buckets: Bucket[] | undefined;
	let fk: ReportGroupableFk | undefined;
	let fieldGrouping: ReportFieldDef | undefined;

	if (plan.groupBy) {
		const timeMatch = plan.groupBy.match(timeGroupingRegex);
		fk = getGroupableFk(entityType, plan.groupBy);
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
			// Rows without a usable timestamp can't be bucketed — excluded from
			// data AND totals (matches legacy scanPaidInvoices semantics).
			rows = rows.filter((r) => typeof r[resolved.sourceField] === "number");
			buckets = buildTimeBuckets(
				rows,
				resolved.sourceField,
				timeMatch[2] as Granularity,
				plan.timezone,
				aggregation
			);
		} else if (fk) {
			buckets = Object.entries(groupRows(rows, plan.groupBy))
				.map(([key, bucketRows]) => ({
					key,
					label: key,
					rows: bucketRows,
					value: computeAggregateValue(bucketRows, aggregation),
					metadata: { [plan.groupBy!]: key },
				}))
				.sort((a, b) => b.value - a.value);
		} else {
			const resolved = resolveGroupByField(entityType, plan.groupBy);
			if (!resolved) {
				throw new ConvexError(
					`Unknown report groupBy field "${plan.groupBy}" for entity "${entityType}"`
				);
			}
			if (resolved.def.type === "timestamp") {
				throw new ConvexError(
					`Report groupBy field "${plan.groupBy}" is a timestamp — use "${plan.groupBy}_day", "${plan.groupBy}_week", or "${plan.groupBy}_month"`
				);
			}
			fieldGrouping = resolved.def;
			buckets = buildFieldBuckets(
				rows,
				resolved.sourceField,
				resolved.def,
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
	const timeBucketed = plan.groupBy ? timeGroupingRegex.test(plan.groupBy) : false;
	if (buckets && plan.sort && !timeBucketed && !(fk && plan.sort === "label_asc")) {
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

	if (buckets && fk) {
		const fkRef = fk;
		await Promise.all(
			buckets.map(async (bucket) => {
				bucket.label = await resolveFkLabel(ctx, fkRef, bucket.key);
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

	return {
		data,
		total,
		metadata: {
			entityType,
			dateRange: metadataDateRange(plan.bounds),
			groupBy: plan.metadataGroupBy ?? plan.groupBy,
			truncated,
			...(summaryField || isCurrencyAgg ? { totalIsCurrency: true } : {}),
			...(isCurrencyAgg ? { itemValueIsCurrency: true } : {}),
			...(plan.segmentBy && segmentMeta
				? { segmentBy: plan.segmentBy, segments: segmentMeta }
				: {}),
		},
	};
}

// ============================================================================
// Detail pipeline (new capability — used only when args.detail is set;
// exclusive of groupBy/aggregation, which are ignored in this mode)
// ============================================================================

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
	dateFieldOverride?: string
): Promise<ReportDataResult> {
	validateDetailColumns(entityType, detail.columns);

	const dateField = dateFieldOverride ?? getReportDateField(entityType);
	const { rows, truncated } = await scanFiltered(
		ctx,
		entityType,
		orgId,
		dateField,
		bounds,
		filters,
		timezone
	);

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
		const out: Record<string, string | number | boolean | null> = {};
		for (const field of detail.columns) {
			out[field] = detailCellValue(row[field]);
		}
		return out;
	});

	return {
		data: [],
		total: totalMatched,
		metadata: {
			entityType,
			dateRange: metadataDateRange(bounds),
			truncated,
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
 * Resolve a v2 config's date field + bounds. Preset ranges resolve server-side
 * in the org timezone at execution (saved "this month" reports roll forward);
 * `date.comparison` is stored but not executed until R11.
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
	if (metric.op === "ratio" || metric.op === "related") {
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
	timezone: string | undefined
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
	const { rows, truncated } = await scanFiltered(
		ctx,
		entityType,
		orgId,
		dateField,
		bounds,
		config.filters as ReportFilters | undefined,
		timezone
	);

	const inSet = (values: string[]) => (r: Row) => values.includes(str(r[def.field]));
	const denominator = def.denominatorValues ? rows.filter(inSet(def.denominatorValues)) : rows;
	const numerator = rows.filter(inSet(def.numeratorValues));
	const percentage =
		denominator.length > 0
			? Math.round((numerator.length / denominator.length) * 100)
			: 0;
	const secondRow = def.rows[1];
	const secondValue =
		"values" in secondRow
			? rows.filter(inSet(secondRow.values)).length
			: denominator.length - numerator.length;

	return {
		data: [
			{ label: def.rows[0].label, value: numerator.length },
			{ label: secondRow.label, value: secondValue },
		],
		total: percentage,
		metadata: {
			entityType,
			dateRange: metadataDateRange(bounds),
			groupBy: ratioKey,
			truncated,
		},
	};
}

/**
 * Related-rollup metric (§3.2, executable from R5). The report's entityType is
 * the parent; buckets are parent records rolled up from a second bounded child
 * scan. Per §8 d12: config.date bounds the CHILD scan, config.filters narrow
 * the parent universe, children with no fk or a parent outside that universe
 * are dropped, and zero-children parents appear only with includeEmptyValues.
 */
async function runRelatedMetric(
	ctx: QueryCtx,
	orgId: Id<"organizations">,
	config: ReportConfigV2,
	related: NonNullable<ReportMetric["related"]>,
	seriesLimit: number | undefined,
	timezone: string | undefined
): Promise<ReportDataResult> {
	const parent = config.entityType;
	const child = related.entity;
	if (config.groupBy || config.segmentBy) {
		throw new ConvexError(`Related metrics do not support grouping`);
	}
	const fk = getGroupableFk(child, related.fk);
	if (!fk || fk.refType !== parent) {
		throw new ConvexError(
			`No registry FK "${related.fk}" from entity "${child}" to entity "${parent}"`
		);
	}
	const aggregation: Aggregation = {
		op: related.op,
		...(related.field ? { field: related.field } : {}),
	};
	validateAggregation(child, aggregation);
	const childFilters = related.filters as ReportFilters | undefined;
	validateFilters(child, childFilters);

	const { dateField: childDateField, bounds: childBounds } = resolveConfigDatesFor(
		child,
		config.date,
		timezone
	);
	const parentScan = await scanFiltered(
		ctx,
		parent,
		orgId,
		getReportDateField(parent),
		resolveDateBounds(undefined),
		config.filters as ReportFilters | undefined,
		timezone
	);
	const childScan = await scanFiltered(
		ctx,
		child,
		orgId,
		childDateField,
		childBounds,
		childFilters,
		timezone
	);

	const parents = new Map<string, Row>();
	for (const row of parentScan.rows) parents.set(String(row._id), row);

	const childrenByParent = new Map<string, Row[]>();
	for (const row of childScan.rows) {
		const key = bucketKeyOf(row[related.fk]);
		if (!parents.has(key)) continue;
		const list = childrenByParent.get(key);
		if (list) list.push(row);
		else childrenByParent.set(key, [row]);
	}

	const includedChildRows = [...childrenByParent.values()].flat();
	let buckets: Bucket[] = [...parents.entries()]
		.filter(([key]) => (config.includeEmptyValues ?? false) || childrenByParent.has(key))
		.map(([key, parentRow]) => ({
			key,
			label: fkDocLabel(fk.refType, parentRow, key),
			rows: childrenByParent.get(key) ?? [],
			value: computeAggregateValue(childrenByParent.get(key) ?? [], aggregation),
			metadata: { [related.fk]: key },
		}))
		.sort((a, b) => b.value - a.value);

	if (seriesLimit !== undefined && Number.isFinite(seriesLimit)) {
		buckets = buckets.slice(0, Math.max(1, Math.floor(seriesLimit)));
	}

	const aggFieldDef = related.field ? getReportField(child, related.field) : undefined;
	const isCurrencyAgg = related.op !== "count" && aggFieldDef?.type === "currency";
	const truncatedEntities = [
		...(parentScan.truncated ? [parent] : []),
		...(childScan.truncated ? [child] : []),
	];

	return {
		data: buckets.map((b) => ({ label: b.label, value: b.value, metadata: b.metadata })),
		total: computeAggregateValue(includedChildRows, aggregation),
		metadata: {
			entityType: parent,
			dateRange: metadataDateRange(childBounds),
			groupBy: related.fk,
			truncated: truncatedEntities.length > 0,
			...(truncatedEntities.length > 0 ? { truncatedEntities } : {}),
			...(isCurrencyAgg ? { totalIsCurrency: true, itemValueIsCurrency: true } : {}),
		},
	};
}

export const executeReport = optionalUserQuery({
	args: {
		entityType: reportEntityTypeValidator,
		groupBy: v.optional(v.string()),
		dateRange: dateRangeValidator,
		filters: v.optional(reportFiltersValidator),
		aggregation: aggregationValidator,
		detail: detailValidator,
		// v2 request: the saved config, normalized (R2's normalizeReportConfig).
		// When present, the legacy groupBy/dateRange/filters/aggregation args are
		// ignored; `detail` still composes (detail mode is a caller decision).
		// The legacy args are deleted at R14 (§8 d11).
		config: v.optional(reportConfigV2Validator),
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

		if (args.config) {
			const config = args.config as ReportConfigV2;
			if (config.entityType !== entityType) {
				throw new ConvexError(
					`config.entityType "${config.entityType}" does not match entityType "${entityType}"`
				);
			}
			const configFilters = config.filters as ReportFilters | undefined;
			validateFilters(entityType, configFilters);
			const timezone = await getOrgTimezoneById(ctx, orgId);
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
					dateField
				);
			}
			if (config.metric.op === "ratio") {
				if (!config.metric.ratioKey) {
					throw new ConvexError(`Ratio metric requires a ratioKey`);
				}
				return await runRatioMetric(ctx, orgId, config, config.metric.ratioKey, timezone);
			}
			if (config.metric.op === "related") {
				const related = config.metric.related;
				if (!related) {
					throw new ConvexError(`Related metric requires a related descriptor`);
				}
				// Permission intersection (§8 d12): parent was checked above, the
				// child scan needs its own entity access, fail closed.
				await requireReportEntityAccess(ctx, related.entity);
				return await runRelatedMetric(ctx, orgId, config, related, args.seriesLimit, timezone);
			}
			const plan = planFromConfig(config, args.seriesLimit, timezone, args.sort);
			validateAggregation(entityType, plan.aggregation);
			return await runAggregationPlan(ctx, orgId, plan);
		}

		const filters = args.filters as ReportFilters | undefined;
		const aggregation = args.aggregation as Aggregation | undefined;

		validateFilters(entityType, filters);

		if (detail) {
			const bounds = resolveDateBounds(args.dateRange);
			const timezone = await getOrgTimezoneById(ctx, orgId);
			return await runDetailReport(ctx, orgId, entityType, bounds, filters, detail, timezone);
		}

		validateAggregation(entityType, aggregation);

		if (aggregation) {
			const bounds = resolveDateBounds(args.dateRange);
			const timezone = await getOrgTimezoneById(ctx, orgId);
			return await runAggregationPlan(ctx, orgId, {
				entityType,
				dateField: getReportDateField(entityType),
				bounds,
				filters,
				aggregation,
				groupBy: args.groupBy,
				seriesLimit: args.seriesLimit,
				timezone,
			});
		}

		// The bare-args grouped path died with the legacy dispatch at R4c —
		// every real caller routes through resolveReportQueryArgs, which always
		// sends a config or a detail request.
		throw new ConvexError(
			`executeReport requires a config, an aggregation, or a detail request`
		);
	},
});

// Re-export field registry types for internal reuse (e.g. by future callers
// that want to introspect what a report can filter/group on).
export type { ReportEntityType } from "./lib/reportFields";
export { REPORT_FIELDS } from "./lib/reportFields";
