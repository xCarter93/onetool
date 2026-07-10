/**
 * Bounded, org-scoped, newest-first index scanner for report queries.
 * Mirrors the proven scanOrgRows/takeOrgPage pattern in automationExecutor.ts
 * (scoped to the six report tables) so reports never `.collect()` a whole
 * org table into memory.
 */
import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

export type ReportTable =
	| "clients"
	| "projects"
	| "tasks"
	| "quotes"
	| "invoices"
	| "activities";

/** Default bound on rows scanned per report query. */
export const REPORT_SCAN_CEILING = 10_000;

/** Rows fetched per index page while scanning. */
const SCAN_BATCH = 500;

type ScanRow = Record<string, unknown> & { _creationTime: number };

/**
 * One page of an org's rows, newest first, from the `before` cursor
 * (inclusive — _creationTime is millisecond-precision and NOT unique, so the
 * caller re-reads the boundary tie group and drops rows it already returned;
 * a strict-lt cursor would silently skip same-timestamp rows straddling a
 * page break).
 */
type NonActivityTable = Exclude<ReportTable, "activities">;

async function takeOrgPage(
	ctx: { db: QueryCtx["db"] },
	table: NonActivityTable,
	orgId: Id<"organizations">,
	before: number | undefined,
	count: number
): Promise<ScanRow[]> {
	switch (table) {
		case "clients":
			return await ctx.db
				.query("clients")
				.withIndex("by_org", (q) => {
					const r = q.eq("orgId", orgId);
					return before === undefined ? r : r.lte("_creationTime", before);
				})
				.order("desc")
				.take(count);
		case "projects":
			return await ctx.db
				.query("projects")
				.withIndex("by_org", (q) => {
					const r = q.eq("orgId", orgId);
					return before === undefined ? r : r.lte("_creationTime", before);
				})
				.order("desc")
				.take(count);
		case "tasks":
			return await ctx.db
				.query("tasks")
				.withIndex("by_org", (q) => {
					const r = q.eq("orgId", orgId);
					return before === undefined ? r : r.lte("_creationTime", before);
				})
				.order("desc")
				.take(count);
		case "quotes":
			return await ctx.db
				.query("quotes")
				.withIndex("by_org", (q) => {
					const r = q.eq("orgId", orgId);
					return before === undefined ? r : r.lte("_creationTime", before);
				})
				.order("desc")
				.take(count);
		case "invoices":
			return await ctx.db
				.query("invoices")
				.withIndex("by_org", (q) => {
					const r = q.eq("orgId", orgId);
					return before === undefined ? r : r.lte("_creationTime", before);
				})
				.order("desc")
				.take(count);
		default: {
			const _exhaustive: never = table;
			return _exhaustive;
		}
	}
}

/**
 * Bounded scan of an org's activities, newest first. Single take rather than
 * cursor pages: `timestamp` is not unique, so a strict-lt timestamp cursor
 * would silently skip same-timestamp rows straddling a page boundary.
 */
async function scanActivities(
	ctx: { db: QueryCtx["db"] },
	orgId: Id<"organizations">,
	predicate: (row: ScanRow) => boolean,
	maxScan: number
): Promise<OrgScanResult> {
	const rows = (await ctx.db
		.query("activities")
		.withIndex("by_org_timestamp", (q) => q.eq("orgId", orgId))
		.order("desc")
		.take(maxScan + 1)) as unknown as ScanRow[];
	const truncated = rows.length > maxScan;
	const page = truncated ? rows.slice(0, maxScan) : rows;
	return {
		matches: page.filter(predicate),
		scanned: page.length,
		truncated,
	};
}

export interface OrgScanOptions {
	/** Row-level predicate; applied per row in JS (never as a withIndex().filter() chain). */
	predicate?: (row: ScanRow) => boolean;
	/** Hard cap on rows scanned. Defaults to REPORT_SCAN_CEILING. */
	maxScan?: number;
	/** Page size per index read. */
	batchSize?: number;
	/**
	 * Early-exit (NOT truncation) once a page row's _creationTime drops below
	 * this bound. Used when the date filter is on _creationTime, since the
	 * scan is creation-desc — everything past this point is out of range.
	 */
	stopBelowCreationTime?: number;
}

export interface OrgScanResult {
	matches: ScanRow[];
	scanned: number;
	truncated: boolean;
}

/**
 * Scan an org-scoped table newest-first, applying `predicate` per row, up to
 * `maxScan` rows. `truncated` is true only when the scan cap was hit and rows
 * genuinely remain past the cursor (probed with one extra read) — an org
 * with exactly `maxScan` rows is not truncated.
 */
export async function scanOrgTable(
	ctx: { db: QueryCtx["db"] },
	table: ReportTable,
	orgId: Id<"organizations">,
	opts: OrgScanOptions = {}
): Promise<OrgScanResult> {
	const predicate = opts.predicate ?? (() => true);
	const maxScan = opts.maxScan ?? REPORT_SCAN_CEILING;

	if (table === "activities") {
		return await scanActivities(ctx, orgId, predicate, maxScan);
	}

	const batchSize = Math.max(opts.batchSize ?? SCAN_BATCH, 1);
	const matches: ScanRow[] = [];
	let scanned = 0;
	let cursor: number | undefined;
	// Rows already returned at exactly `cursor` — the lte page re-reads the
	// boundary tie group (always the head of the page, same index order), so
	// these are filtered out to make progress without skipping ties.
	let cursorIds = new Set<string>();

	const takePage = (before: number | undefined, count: number) =>
		takeOrgPage(ctx, table as NonActivityTable, orgId, before, count);

	while (scanned < maxScan) {
		const pageSize = Math.min(batchSize, maxScan - scanned);
		const raw = await takePage(cursor, pageSize + cursorIds.size);
		const page = raw.filter((row) => !cursorIds.has(String(row._id)));
		if (page.length > 0) {
			const lastTs = page[page.length - 1]._creationTime;
			const boundary = page
				.filter((row) => row._creationTime === lastTs)
				.map((row) => String(row._id));
			cursorIds =
				lastTs === cursor
					? new Set([...cursorIds, ...boundary])
					: new Set(boundary);
			cursor = lastTs;
		}
		scanned += page.length;

		let stoppedEarly = false;
		for (const row of page) {
			if (
				opts.stopBelowCreationTime !== undefined &&
				row._creationTime < opts.stopBelowCreationTime
			) {
				stoppedEarly = true;
				break;
			}
			if (!predicate(row)) continue;
			matches.push(row);
		}

		if (stoppedEarly) {
			return { matches, scanned, truncated: false };
		}
		if (page.length < pageSize) {
			// Index exhausted — every org row was considered.
			return { matches, scanned, truncated: false };
		}
	}

	// Hit the scan cap. Truncated only if rows actually remain past it —
	// the lte probe must look past the already-returned boundary ties.
	const probe = await takePage(cursor, cursorIds.size + 1);
	return {
		matches,
		scanned,
		truncated: probe.some((row) => !cursorIds.has(String(row._id))),
	};
}
