"use client";

import React from "react";
import { Check, AlertTriangle, Loader2 } from "lucide-react";

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
		<section className="space-y-4" aria-label="Stripe requirements">
			{!loaded ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" aria-hidden="true" />
					Checking requirements…
				</div>
			) : hasItems ? (
				<div className="grid gap-1.5 sm:grid-cols-2">
					{currentlyDue.map((item) => (
						<div
							key={item}
							title={item}
							className="truncate rounded-md border border-border bg-muted/50 px-2.5 py-1.5 font-mono text-[11.5px] text-foreground"
						>
							{item}
						</div>
					))}
				</div>
			) : (
				<div className="flex items-center gap-3">
					<span className="grid size-9 shrink-0 place-content-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
						<Check className="size-[18px]" aria-hidden="true" />
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
					className="mt-px size-4 shrink-0 text-amber-600 dark:text-amber-400"
					aria-hidden="true"
				/>
				Status is fetched directly from Stripe. Reload this tab if you make
				changes in the Stripe dashboard.
			</p>
		</section>
	);
}
