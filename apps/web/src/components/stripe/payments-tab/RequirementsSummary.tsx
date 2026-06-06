"use client";

import React from "react";
import { Check, ListChecks, AlertTriangle, Loader2 } from "lucide-react";

interface RequirementsSummaryProps {
	currentlyDue?: string[];
	// When false, status hasn't been fetched yet — don't claim "all set".
	loaded?: boolean;
}

export function RequirementsSummary({
	currentlyDue = [],
	loaded = true,
}: RequirementsSummaryProps) {
	const hasItems = currentlyDue.length > 0;

	return (
		<section className="space-y-3" aria-label="Stripe requirements">
			<div className="flex items-center gap-2.5">
				<span className="grid h-8 w-8 place-content-center rounded-lg border border-border bg-muted text-muted-foreground">
					<ListChecks className="h-4 w-4" aria-hidden="true" />
				</span>
				<h3 className="text-lg font-semibold text-foreground">Requirements</h3>
			</div>

			{!loaded ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
					Checking requirements…
				</div>
			) : hasItems ? (
				<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
					{currentlyDue.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			) : (
				<div className="flex items-center gap-3">
					<span className="grid h-9 w-9 shrink-0 place-content-center rounded-full border border-success/25 bg-success/10 text-success">
						<Check className="h-[18px] w-[18px]" aria-hidden="true" />
					</span>
					<div>
						<div className="text-sm font-semibold text-foreground">
							You&apos;re all set
						</div>
						<div className="text-[12.5px] text-muted-foreground">
							No outstanding requirements reported.
						</div>
					</div>
				</div>
			)}

			<p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
				<AlertTriangle
					className="mt-px h-4 w-4 shrink-0 text-warning"
					aria-hidden="true"
				/>
				Status is fetched directly from Stripe. Reload this tab if you make changes
				in the Stripe dashboard.
			</p>
		</section>
	);
}
