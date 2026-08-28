/**
 * Authorable dotted paths for the report builder (§8 d15 F1+F5) — the web-side
 * enumeration of what `REPORT_RELATIONS` makes reachable, as breadcrumb options
 * the shared field picker renders. Filters accept field terminals only; group by
 * also accepts an FK terminal (bucket = the parent record).
 */
import {
	REPORT_FIELDS,
	type ReportEntityType,
} from "@onetool/backend/convex/lib/reportFields";
import {
	isDrillableTarget,
	REPORT_RELATIONS,
	resolveReportPath,
	type ReportRelationTarget,
} from "@onetool/backend/convex/lib/reportRelations";

export type PathOption = {
	/** Dotted path the backend resolves, e.g. `quoteId.projectId.startDate`. */
	value: string;
	/** Breadcrumb, e.g. "Quote › Project › Start Date". */
	label: string;
	/** Lowercase flat text so search matches across every level at once. */
	searchText: string;
	/** Breadcrumb prefix of the traversed records ("Quote › Project"), "Fields" for direct. */
	group: string;
	/** Group-by consumers append the day/week/month granularity themselves. */
	isTimestamp?: boolean;
};

/** Singular display names for path breadcrumbs; users/skus are label-only terminals. */
const PATH_ENTITY_LABELS: Record<ReportRelationTarget, string> = {
	clients: "Client",
	projects: "Project",
	tasks: "Task",
	quotes: "Quote",
	invoices: "Invoice",
	payments: "Payment",
	quoteLineItems: "Quote Line Item",
	invoiceLineItems: "Invoice Line Item",
	activities: "Activity",
	users: "Assignee",
	skus: "SKU",
};

/** Singular display name for an entity, e.g. a table header over one row per record. Unknown names pass through. */
export function entityLabel(entityType: string): string {
	return PATH_ENTITY_LABELS[entityType as ReportRelationTarget] ?? entityType;
}

const SEPARATOR = " › ";

const DIRECT_GROUP = "Fields";

function searchTextFor(label: string): string {
	return label.toLowerCase().split(SEPARATOR).join(" ");
}

type RelationPath = {
	segments: string[];
	entityType: ReportEntityType;
	crumb: string;
};

/**
 * Every FK path out of `entityType` through drillable edges, breadth-first so
 * callers get depth-then-registry order for free. The edge graph is a DAG
 * (child → parent only), so the walk terminates without a depth cap.
 */
function drillablePaths(entityType: ReportEntityType): RelationPath[] {
	const paths: RelationPath[] = [];
	let level: RelationPath[] = [{ segments: [], entityType, crumb: "" }];
	while (level.length > 0) {
		const next: RelationPath[] = [];
		for (const path of level) {
			for (const [field, edge] of Object.entries(
				REPORT_RELATIONS[path.entityType]
			)) {
				if (!isDrillableTarget(edge.refType)) continue;
				next.push({
					segments: [...path.segments, field],
					entityType: edge.refType,
					crumb: appendCrumb(path.crumb, PATH_ENTITY_LABELS[edge.refType]),
				});
			}
		}
		paths.push(...next);
		level = next;
	}
	return paths;
}

function appendCrumb(crumb: string, label: string): string {
	return crumb ? `${crumb}${SEPARATOR}${label}` : label;
}

function fieldOptions(path: RelationPath, group: string): PathOption[] {
	return Object.entries(REPORT_FIELDS[path.entityType].fields).map(
		([field, def]) => {
			const label = appendCrumb(path.crumb, def.label);
			const option: PathOption = {
				value: [...path.segments, field].join("."),
				label,
				searchText: searchTextFor(label),
				group,
			};
			if (def.type === "timestamp") option.isTimestamp = true;
			return option;
		}
	);
}

/** Every filterable target: the entity's own fields plus each reachable parent's. */
export function filterFieldOptions(entityType: ReportEntityType): PathOption[] {
	const options = fieldOptions(
		{ segments: [], entityType, crumb: "" },
		DIRECT_GROUP
	);
	for (const path of drillablePaths(entityType)) {
		options.push(...fieldOptions(path, path.crumb));
	}
	return options;
}

/**
 * Related group-by targets, dotted only — direct fields and FKs stay with the
 * builder's curated list. Each reachable parent contributes its own FK edges
 * (group by that record) and its fields.
 */
export function groupByPathOptions(entityType: ReportEntityType): PathOption[] {
	const options: PathOption[] = [];
	for (const path of drillablePaths(entityType)) {
		for (const [field, edge] of Object.entries(
			REPORT_RELATIONS[path.entityType]
		)) {
			const label = appendCrumb(path.crumb, PATH_ENTITY_LABELS[edge.refType]);
			options.push({
				value: [...path.segments, field].join("."),
				label,
				searchText: searchTextFor(label),
				group: path.crumb,
			});
		}
		options.push(...fieldOptions(path, path.crumb));
	}
	return options;
}

/**
 * Breadcrumb for any stored path. A saved config can outlive a registry change,
 * so an unresolvable path renders as its raw string instead of throwing.
 */
export function pathLabel(entityType: ReportEntityType, path: string): string {
	try {
		const { hops, terminal } = resolveReportPath(entityType, path);
		const crumbs = hops.map((hop) => PATH_ENTITY_LABELS[hop.refType]);
		crumbs.push(
			terminal.kind === "fk"
				? PATH_ENTITY_LABELS[terminal.refType]
				: terminal.def.label
		);
		return crumbs.join(SEPARATOR);
	} catch {
		return path;
	}
}
