"use client";

import { CircleHelp } from "lucide-react";

import { cn } from "@/lib/utils";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

// Shades are inverted vs the sparkline stroke: the tooltip surface is
// `bg-foreground`, so the lighter shade contrasts in light mode and the
// darker one in dark mode.
const LEGEND = [
	{
		swatch: "bg-emerald-400 dark:bg-emerald-600",
		label: "Trending up — more active recently",
	},
	{
		swatch: "bg-red-400 dark:bg-red-600",
		label: "Trending down — quieter recently",
	},
	{ swatch: "bg-muted-foreground", label: "Steady — no change" },
] as const;

/**
 * Centered "Activity" column header with a help tooltip explaining what the
 * sparkline stroke colors mean. Shared across the clients/projects/quotes/
 * invoices grids so the legend stays in one place.
 */
export function ActivityColumnHeader() {
	return (
		<div className="flex items-center justify-center gap-1">
			<span>Activity</span>
			<Tooltip>
				<TooltipTrigger
					render={
						<button
							type="button"
							aria-label="What do the activity colors mean?"
							className="text-muted-foreground/70 hover:text-foreground focus-visible:text-foreground inline-flex cursor-help outline-none transition-colors"
						/>
					}
				>
					<CircleHelp className="size-3.5" />
				</TooltipTrigger>
				<TooltipContent side="top" className="max-w-xs">
					<div className="space-y-1.5">
						<p className="font-semibold">Last 30 days of activity</p>
						<ul className="space-y-1">
							{LEGEND.map((item) => (
								<li key={item.label} className="flex items-center gap-2">
									<span
										className={cn(
											"h-0.5 w-4 shrink-0 rounded-full",
											item.swatch
										)}
									/>
									<span>{item.label}</span>
								</li>
							))}
						</ul>
						<p className="text-background/70">
							A dash (—) means no activity in this period.
						</p>
					</div>
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
