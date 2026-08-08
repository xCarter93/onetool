import type { FunctionReturnType } from "convex/server";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";

export type ImportRun = Doc<"quickbooksImportRuns">;

/** One hydrated review row, taken straight off the query's return type. */
export type ImportRowView = FunctionReturnType<
	typeof api.quickbooksImport.listImportRows
>["page"][number];

/** What a row will do when the import is committed. */
export type EffectiveDecision = "link" | "import" | "site" | "skip" | "undecided";

export type FilterTab = "all" | "link" | "import" | "review" | "sites" | "skip";

export interface PlanCounts {
	link: number;
	import: number;
	review: number;
	sites: number;
	skip: number;
}

/** True when the reviewer can still change what happens to this row. */
export function isDecidable(row: ImportRowView): boolean {
	return (
		row.outcome === "proposed_link" ||
		row.outcome === "proposed_import" ||
		row.outcome === "proposed_property" ||
		row.outcome === "ambiguous"
	);
}

/** A sub-customer job site, headed for clientProperties on the parent. */
export function isJobSite(row: ImportRowView): boolean {
	return row.outcome === "proposed_property";
}

/** An addressless sub-customer in QuickBooks. Never imported, never overridable. */
export function isSubCustomer(row: ImportRowView): boolean {
	return row.outcome === "proposed_skip" && row.skipReason === "sub_customer";
}

/** The row's proposal before any reviewer override. */
export function proposedDecision(row: ImportRowView): EffectiveDecision {
	switch (row.outcome) {
		case "proposed_link":
		case "auto_linked":
		case "resolved":
			return "link";
		case "proposed_import":
		case "imported":
			return "import";
		case "proposed_property":
		case "property_created":
			return "site";
		case "proposed_skip":
		case "skipped":
			return "skip";
		case "ambiguous":
			return "undecided";
		default:
			return "undecided";
	}
}

/** The reviewer's override when set, otherwise the proposal. */
export function effectiveDecision(row: ImportRowView): EffectiveDecision {
	if (row.outcome === "proposed_skip") return "skip";
	// A job site's only real decision is skip; "import" restores the proposal.
	if (isJobSite(row)) {
		return row.decision === "skip" ? "skip" : "site";
	}
	if (isDecidable(row) && row.decision) return row.decision;
	return proposedDecision(row);
}

function tabForDecision(decision: EffectiveDecision): Exclude<FilterTab, "all"> {
	if (decision === "undecided") return "review";
	if (decision === "site") return "sites";
	return decision;
}

/** Which filter tab a row belongs to under its effective decision. */
export function tabForRow(row: ImportRowView): Exclude<FilterTab, "all"> {
	return tabForDecision(effectiveDecision(row));
}

/**
 * The plan as it stands: the run's own counters, adjusted by the overrides on
 * the rows loaded so far. Overrides on rows that have not been paged in yet are
 * invisible here, so a reload mid-review can under-count them until the rows
 * load. The commit itself is always authoritative.
 */
export function planCounts(run: ImportRun, loadedRows: ImportRowView[]): PlanCounts {
	const counts: PlanCounts = {
		// autoLinked covers customers already mapped by an earlier run: they are
		// read-only, but they still land in QuickBooks-linked territory.
		link: run.autoLinked + (run.proposedLink ?? 0),
		import: run.proposedImport ?? 0,
		review: run.ambiguous,
		sites: run.proposedProperty ?? 0,
		skip: run.proposedSkip ?? 0,
	};

	for (const row of loadedRows) {
		if (!isDecidable(row) || !row.decision) continue;
		const fromKey = tabForDecision(proposedDecision(row));
		const toKey = tabForDecision(effectiveDecision(row));
		if (fromKey === toKey) continue;
		counts[fromKey] = Math.max(0, counts[fromKey] - 1);
		counts[toKey] += 1;
	}

	return counts;
}
