/**
 * Related-object traversal for reports (§d15 F2/F6) — the FK edge map, the
 * dotted-path resolver that turns `"invoiceId.projectId.startDate_month"` into
 * hops + a terminal, and a batching hydrator that walks those hops over scanned
 * rows without N+1 reads.
 *
 * Edges are verified against schema.ts; do not invent them here. Paths fail
 * closed: anything the registry can't account for throws rather than silently
 * resolving to undefined, so a bad saved config surfaces instead of producing a
 * quietly empty report.
 */
import { ConvexError } from "convex/values";
import {
	resolveGroupByField,
	type ReportEntityType,
	type ReportFieldDef,
} from "./reportFields";

/** Traversal targets: report entities, plus the two label-only reference tables. */
export type ReportRelationTarget = ReportEntityType | "users" | "skus";

export interface ReportRelationEdge {
	refType: ReportRelationTarget;
}

export const REPORT_RELATIONS: Record<
	ReportEntityType,
	Record<string, ReportRelationEdge>
> = {
	clients: {},
	projects: { clientId: { refType: "clients" } },
	tasks: {
		assigneeUserId: { refType: "users" },
		projectId: { refType: "projects" },
		clientId: { refType: "clients" },
	},
	quotes: {
		clientId: { refType: "clients" },
		projectId: { refType: "projects" },
	},
	invoices: {
		clientId: { refType: "clients" },
		projectId: { refType: "projects" },
		quoteId: { refType: "quotes" },
	},
	payments: { invoiceId: { refType: "invoices" } },
	quoteLineItems: {
		skuId: { refType: "skus" },
		quoteId: { refType: "quotes" },
	},
	invoiceLineItems: {
		skuId: { refType: "skus" },
		invoiceId: { refType: "invoices" },
	},
	activities: {},
};

export function getRelationEdge(
	entityType: ReportEntityType,
	field: string
): ReportRelationEdge | undefined {
	return REPORT_RELATIONS[entityType][field];
}

/**
 * users/skus are label-only terminals — groupable as a record, never
 * drillable into: reports must not expose user or SKU columns (§d15 privacy).
 */
export function isDrillableTarget(
	refType: ReportRelationTarget
): refType is ReportEntityType {
	return refType !== "users" && refType !== "skus";
}

export type TimeGranularity = "day" | "week" | "month";

export interface PathHop {
	field: string;
	refType: ReportRelationTarget;
}

export type PathTerminal =
	| {
			kind: "field";
			entityType: ReportEntityType;
			sourceField: string;
			def: ReportFieldDef;
			granularity?: TimeGranularity;
	  }
	/** The path stops on the edge itself — the last segment is both hop and terminal. */
	| { kind: "fk"; field: string; refType: ReportRelationTarget };

export interface ResolvedPath {
	hops: PathHop[];
	terminal: PathTerminal;
}

/** Matches reportData's groupBy time buckets, e.g. `startDate_month`. */
const TIME_GRANULARITY_SUFFIX = /^([a-zA-Z_]+)_(day|week|month)$/;

function resolveTerminal(
	entityType: ReportEntityType,
	segment: string,
	path: string
): PathTerminal {
	const edge = getRelationEdge(entityType, segment);
	if (edge) return { kind: "fk", field: segment, refType: edge.refType };

	const direct = resolveGroupByField(entityType, segment);
	if (direct) {
		return {
			kind: "field",
			entityType,
			sourceField: direct.sourceField,
			def: direct.def,
		};
	}

	const bucket = TIME_GRANULARITY_SUFFIX.exec(segment);
	const base = bucket ? resolveGroupByField(entityType, bucket[1]) : undefined;
	if (!bucket || !base) {
		throw new ConvexError(
			`Unknown report field "${segment}" on "${entityType}" (path "${path}")`
		);
	}
	if (base.def.type !== "timestamp") {
		throw new ConvexError(
			`Time granularity "${bucket[2]}" requires a timestamp field, but "${bucket[1]}" on "${entityType}" is ${base.def.type} (path "${path}")`
		);
	}
	return {
		kind: "field",
		entityType,
		sourceField: base.sourceField,
		def: base.def,
		granularity: bucket[2] as TimeGranularity,
	};
}

/**
 * Resolve a dotted FK path (or a bare field) against the registry. Intermediate
 * segments must be drillable FK edges; the last segment may be an FK edge
 * (fk terminal) or a field, optionally with a `_day|_week|_month` suffix.
 */
export function resolveReportPath(
	entityType: ReportEntityType,
	path: string
): ResolvedPath {
	const segments = path.split(".");
	if (segments.some((segment) => segment.length === 0)) {
		throw new ConvexError(`Report path "${path}" has an empty segment`);
	}

	const hops: PathHop[] = [];
	let current = entityType;
	for (const segment of segments.slice(0, -1)) {
		const edge = getRelationEdge(current, segment);
		if (!edge) {
			throw new ConvexError(
				`Unknown relation "${segment}" on "${current}" (path "${path}")`
			);
		}
		if (!isDrillableTarget(edge.refType)) {
			throw new ConvexError(
				`Cannot traverse through "${segment}": "${edge.refType}" records are not drillable (path "${path}")`
			);
		}
		hops.push({ field: segment, refType: edge.refType });
		current = edge.refType;
	}

	return {
		hops,
		terminal: resolveTerminal(current, segments[segments.length - 1], path),
	};
}

export function isRelatedPath(path: string): boolean {
	return path.includes(".");
}

/**
 * The drillable tables a path reaches into, in traversal order — the extra
 * tables a caller must permission-check. Excludes the scanned entity itself
 * and the users/skus terminals.
 */
export function pathTables(resolved: ResolvedPath): ReportEntityType[] {
	const tables = resolved.hops
		.map((hop) => hop.refType)
		.filter(isDrillableTarget);
	if (
		resolved.terminal.kind === "fk" &&
		isDrillableTarget(resolved.terminal.refType)
	) {
		tables.push(resolved.terminal.refType);
	}
	return tables;
}

export type PathResolution =
	| { value: unknown }
	| { brokenAt: { field: string; refType: string } };

export interface PathHydrator {
	resolve(
		row: Record<string, unknown>,
		resolvedPath: ResolvedPath
	): PathResolution;
	truncated: boolean;
	truncatedTables: string[];
}

type Doc = Record<string, unknown>;
type WalkResult = { doc: Doc } | { brokenAt: { field: string; refType: string } };

function docKey(refType: string, id: string): string {
	return `${refType}:${id}`;
}

/**
 * Batch-hydrate the FK hops of `paths` over `rows`, level by level, fetching
 * each referenced doc at most once and stopping at `budget` total reads.
 * `getDoc` is injected so the resolver stays unit-testable — production passes
 * `(id) => ctx.db.get(id)`.
 */
export async function buildPathHydrator(
	getDoc: (id: string) => Promise<Doc | null>,
	rows: ReadonlyArray<Doc>,
	paths: ReadonlyArray<ResolvedPath>,
	budget: number
): Promise<PathHydrator> {
	const docs = new Map<string, Doc | null>();
	const truncatedTables = new Set<string>();
	let reads = 0;

	// undefined = never fetched (budget), null = dangling id; both are broken hops.
	const walk = (row: Doc, hops: PathHop[], upTo: number): WalkResult => {
		let current = row;
		for (let depth = 0; depth < upTo; depth++) {
			const hop = hops[depth];
			const id = current[hop.field];
			if (typeof id !== "string") {
				return { brokenAt: { field: hop.field, refType: hop.refType } };
			}
			const doc = docs.get(docKey(hop.refType, id));
			if (!doc) return { brokenAt: { field: hop.field, refType: hop.refType } };
			current = doc;
		}
		return { doc: current };
	};

	const maxDepth = paths.reduce((max, path) => Math.max(max, path.hops.length), 0);
	for (let depth = 0; depth < maxDepth; depth++) {
		const pending = new Map<string, { id: string; refType: string }>();
		for (const path of paths) {
			if (path.hops.length <= depth) continue;
			const hop = path.hops[depth];
			for (const row of rows) {
				const reached = walk(row, path.hops, depth);
				if ("brokenAt" in reached) continue;
				const id = reached.doc[hop.field];
				if (typeof id !== "string") continue;
				const key = docKey(hop.refType, id);
				if (docs.has(key) || pending.has(key)) continue;
				pending.set(key, { id, refType: hop.refType });
			}
		}

		const entries = [...pending.entries()];
		const affordable = entries.slice(0, Math.max(0, budget - reads));
		for (const [, { refType }] of entries.slice(affordable.length)) {
			truncatedTables.add(refType);
		}
		reads += affordable.length;
		const fetched = await Promise.all(
			affordable.map(([, { id }]) => getDoc(id))
		);
		affordable.forEach(([key], index) => docs.set(key, fetched[index]));
	}

	return {
		truncated: truncatedTables.size > 0,
		truncatedTables: [...truncatedTables],
		resolve(row, resolvedPath) {
			const reached = walk(row, resolvedPath.hops, resolvedPath.hops.length);
			if ("brokenAt" in reached) return reached;
			const { terminal } = resolvedPath;
			if (terminal.kind === "fk") {
				const id = reached.doc[terminal.field];
				return typeof id === "string"
					? { value: id }
					: { brokenAt: { field: terminal.field, refType: terminal.refType } };
			}
			return { value: reached.doc[terminal.sourceField] };
		},
	};
}
