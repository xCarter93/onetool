"use client";

import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	effectiveDecision,
	isDecidable,
	isJobSite,
	isSubCustomer,
	proposedDecision,
	type EffectiveDecision,
	type ImportRowView,
} from "../utils/review-model";
import { ImportClientPicker, type ClientOption } from "./import-client-picker";

const BADGE: Record<
	EffectiveDecision,
	{ label: string; variant: "success-light" | "primary-light" | "warning-light" | "secondary" }
> = {
	link: { label: "Will link", variant: "success-light" },
	import: { label: "New client", variant: "primary-light" },
	site: { label: "Job site", variant: "primary-light" },
	undecided: { label: "Needs review", variant: "warning-light" },
	skip: { label: "Skipped", variant: "secondary" },
};

export interface RowDecision {
	rowId: Id<"quickbooksImportRows">;
	decision: "link" | "import" | "skip";
	clientId?: Id<"clients">;
}

interface QboRowListProps {
	rows: ImportRowView[];
	clients: ClientOption[];
	pendingRowIds: Set<string>;
	readOnly: boolean;
	onDecide: (decision: RowDecision) => void;
}

export function QboRowList({
	rows,
	clients,
	pendingRowIds,
	readOnly,
	onDecide,
}: QboRowListProps) {
	return (
		<ul className="divide-y divide-border">
			{rows.map((row) => (
				<QboRow
					key={row._id}
					row={row}
					clients={clients}
					pending={pendingRowIds.has(row._id)}
					readOnly={readOnly}
					onDecide={onDecide}
				/>
			))}
		</ul>
	);
}

function QboRow({
	row,
	clients,
	pending,
	readOnly,
	onDecide,
}: {
	row: ImportRowView;
	clients: ClientOption[];
	pending: boolean;
	readOnly: boolean;
	onDecide: (decision: RowDecision) => void;
}) {
	const decision = effectiveDecision(row);
	const decidable = isDecidable(row);
	const jobSite = isJobSite(row);
	const badge = BADGE[decision];
	const linkedName = row.proposedClient?.companyName;
	const muted = !decidable || decision === "skip";

	// Read-only rows still explain themselves: an addressless sub-customer is
	// QuickBooks' own project construct, and an already-linked customer has
	// nothing to decide.
	const note = jobSite
		? row.parentName
			? `Job site of ${row.parentName}`
			: "Job site"
		: isSubCustomer(row)
			? "Sub-customer in QuickBooks"
			: !decidable && linkedName
				? `Already linked to ${linkedName}`
				: decision === "link" && linkedName
					? `Links to ${linkedName}`
					: undefined;

	const controls = decidable && !readOnly;
	const canRestore =
		decision === "skip" &&
		(row.outcome === "proposed_link" ||
			row.outcome === "proposed_import" ||
			jobSite);

	const restore = () => {
		if (row.outcome === "proposed_link" && row.linkedClientId) {
			onDecide({
				rowId: row._id,
				decision: "link",
				clientId: row.linkedClientId,
			});
			return;
		}
		// "import" restores a job site to its proposal too.
		onDecide({ rowId: row._id, decision: "import" });
	};

	return (
		<li
			className={cn(
				"flex flex-col gap-2.5 py-3.5 sm:flex-row sm:items-center sm:gap-4",
				jobSite && "sm:pl-8"
			)}
		>
			<div className="min-w-0 flex-1">
				<p
					className={cn(
						"truncate text-sm font-medium",
						muted ? "text-muted-foreground" : "text-foreground"
					)}
				>
					{row.qboDisplayName}
				</p>
				{row.qboEmail && (
					<p className="truncate text-xs text-muted-foreground">{row.qboEmail}</p>
				)}
				{note && <p className="truncate text-xs text-muted-foreground">{note}</p>}
			</div>

			<div className="shrink-0">
				<Badge variant={badge.variant} size="default" radius="full">
					{badge.label}
				</Badge>
			</div>

			{controls && (
				<div className="flex shrink-0 flex-wrap items-center gap-1.5">
					{!jobSite && (
						<ImportClientPicker
						clients={clients}
						value={
							decision === "link"
								? (row.decisionClientId ?? row.linkedClientId ?? null)
								: null
						}
						valueLabel={decision === "link" ? linkedName : undefined}
						disabled={pending}
						ariaLabel={`Client for ${row.qboDisplayName}`}
						onSelect={(clientId) =>
							onDecide({ rowId: row._id, decision: "link", clientId })
						}
						/>
					)}
					{row.outcome === "ambiguous" && decision !== "import" && (
						<Button
							variant="ghost"
							size="sm"
							disabled={pending}
							onClick={() => onDecide({ rowId: row._id, decision: "import" })}
						>
							Import as new
						</Button>
					)}
					{canRestore ? (
						<Button
							variant="ghost"
							size="sm"
							disabled={pending}
							onClick={restore}
						>
							{proposedDecision(row) === "link"
								? "Link"
								: proposedDecision(row) === "site"
									? "Restore"
									: "Import"}
						</Button>
					) : (
						decision !== "skip" && (
							<Button
								variant="ghost"
								size="sm"
								disabled={pending}
								onClick={() => onDecide({ rowId: row._id, decision: "skip" })}
							>
								Don&rsquo;t import
							</Button>
						)
					)}
				</div>
			)}
		</li>
	);
}
