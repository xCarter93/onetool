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
	results?: { linked: number; imported: number; sites: number; skipped: number };
}) {
	const customersLabel = `${totalFetched} customer${totalFetched !== 1 ? "s" : ""}`;

	if (results) {
		const hasSites = results.sites > 0;
		return (
			<div
				className={cn(
					"grid grid-cols-2 gap-3",
					hasSites ? "sm:grid-cols-5" : "sm:grid-cols-4"
				)}
			>
				<StatCard dotClass="bg-muted-foreground/50" muted label={customersLabel} />
				<StatCard dotClass="bg-success" label={`${results.linked} linked`} />
				<StatCard dotClass="bg-primary" label={`${results.imported} imported`} />
				{hasSites && (
					<StatCard
						dotClass="bg-primary"
						label={`${results.sites} job site${results.sites !== 1 ? "s" : ""}`}
					/>
				)}
				<StatCard
					dotClass="bg-muted-foreground/50"
					muted
					label={`${results.skipped} skipped`}
				/>
			</div>
		);
	}

	if (!counts) return null;

	const hasSites = counts.sites > 0;
	return (
		<div
			className={cn(
				"grid grid-cols-2 gap-3",
				hasSites ? "sm:grid-cols-6" : "sm:grid-cols-5"
			)}
		>
			<StatCard dotClass="bg-muted-foreground/50" muted label={customersLabel} />
			<StatCard dotClass="bg-success" label={`${counts.link} will link`} />
			<StatCard
				dotClass="bg-primary"
				label={`${counts.import} new client${counts.import !== 1 ? "s" : ""}`}
			/>
			<StatCard
				dotClass="bg-warning"
				label={`${counts.review} need${counts.review === 1 ? "s" : ""} review`}
			/>
			{hasSites && (
				<StatCard
					dotClass="bg-primary"
					label={`${counts.sites} job site${counts.sites !== 1 ? "s" : ""}`}
				/>
			)}
			<StatCard
				dotClass="bg-muted-foreground/50"
				muted
				label={`${counts.skip} skipped`}
			/>
		</div>
	);
}
