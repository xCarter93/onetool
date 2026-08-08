"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { PlanCounts } from "../utils/review-model";

function StatCard({
	dotClass,
	label,
	muted,
}: {
	dotClass: string;
	label: ReactNode;
	muted?: boolean;
}) {
	return (
		<div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm">
			<span className={cn("size-2 shrink-0 rounded-full", dotClass)} />
			<span className={cn("truncate", muted && "text-muted-foreground")}>
				{label}
			</span>
		</div>
	);
}

/** The plan while reviewing, or the outcome once the import has been applied. */
export function QboSummaryBar({
	totalFetched,
	counts,
	results,
}: {
	totalFetched: number;
	counts?: PlanCounts;
	results?: { linked: number; imported: number; skipped: number };
}) {
	const customersLabel = `${totalFetched} customer${totalFetched !== 1 ? "s" : ""}`;

	if (results) {
		return (
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatCard dotClass="bg-muted-foreground/50" muted label={customersLabel} />
				<StatCard dotClass="bg-success" label={`${results.linked} linked`} />
				<StatCard dotClass="bg-primary" label={`${results.imported} imported`} />
				<StatCard
					dotClass="bg-muted-foreground/50"
					muted
					label={`${results.skipped} skipped`}
				/>
			</div>
		);
	}

	if (!counts) return null;

	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
			<StatCard dotClass="bg-muted-foreground/50" muted label={customersLabel} />
			<StatCard dotClass="bg-success" label={`${counts.link} will link`} />
			<StatCard
				dotClass="bg-primary"
				label={`${counts.import} new client${counts.import !== 1 ? "s" : ""}`}
			/>
			<StatCard dotClass="bg-warning" label={`${counts.review} need review`} />
			<StatCard
				dotClass="bg-muted-foreground/50"
				muted
				label={`${counts.skip} skipped`}
			/>
		</div>
	);
}
