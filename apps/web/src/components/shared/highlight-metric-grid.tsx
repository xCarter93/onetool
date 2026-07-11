import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Frame, FramePanel } from "@/components/reui/frame";
import { cn } from "@/lib/utils";

/**
 * A single highlight metric. `description` and `trend` are optional — omit the
 * trend when there's no period-over-period delta to show.
 */
export interface HighlightMetric {
	icon: LucideIcon;
	label: string;
	value: React.ReactNode;
	description?: string;
	trend?: { value: string; direction: "up" | "down" };
}

// Diagonal clip-path levels + frosted-blue fills for the decorative area shape.
// Adapted from ReUI card-29, recolored from indigo to translucent primary.
const AREA_LEVELS = [
	{ back: [34, 2], fill: [48, 16] },
	{ back: [2, 36], fill: [16, 50] },
	{ back: [36, 0], fill: [50, 10] },
	{ back: [0, 22], fill: [10, 32] },
] as const;

const AREA_FILLS = [
	"from-primary/45 via-primary/30 to-primary/15",
	"from-primary/50 via-primary/35 to-primary/20",
	"from-primary/40 via-primary/25 to-primary/10",
	"from-primary/55 via-primary/40 to-primary/25",
] as const;

function MetricAreaShape({ index }: { index: number }) {
	const levels = AREA_LEVELS[index % AREA_LEVELS.length];
	const fill = AREA_FILLS[index % AREA_FILLS.length];
	const backClip = `polygon(0 ${levels.back[0]}%, 100% ${levels.back[1]}%, 100% 100%, 0 100%)`;
	const fillClip = `polygon(0 ${levels.fill[0]}%, 100% ${levels.fill[1]}%, 100% 100%, 0 100%)`;

	return (
		<div
			aria-hidden="true"
			className="relative -mx-4 -mb-4 mt-3 h-14 overflow-hidden"
		>
			<div
				className="absolute inset-x-0 bottom-0 h-full bg-primary/10"
				style={{ clipPath: backClip }}
			/>
			<div
				className={cn(
					"absolute inset-x-0 bottom-0 h-full bg-linear-to-br",
					fill
				)}
				style={{ clipPath: fillClip }}
			/>
		</div>
	);
}

const GRID_COLS: Record<number, string> = {
	1: "",
	2: "sm:grid-cols-2",
	3: "sm:grid-cols-3",
	4: "sm:grid-cols-4",
};

function cellBorders(index: number, total: number, cols: number) {
	const isLast = index === total - 1;
	const inLastCol = index % cols === cols - 1;
	const lastRowStart = total - (total % cols || cols);
	const inLastRow = index >= lastRowStart;

	return cn(
		"border-border/60",
		// Stacked (mobile): divider under every card except the last.
		!isLast && "max-sm:border-b",
		// Grid (sm+): right divider except the last column…
		!inLastCol && "sm:border-r",
		// …and bottom divider except the last row.
		inLastRow ? "sm:border-b-0" : "sm:border-b"
	);
}

/**
 * Frosted-blue panel of highlight metrics — the record-page "Highlights" row.
 * Wrapped in a ReUI Frame so the panel edge stays visible in light mode.
 * card-29-style layout: icon → label → value → description → frosted-blue area
 * shape. Compact by design.
 */
export function HighlightMetricGrid({
	metrics,
	columns,
	className,
}: {
	metrics: HighlightMetric[];
	columns?: 2 | 3 | 4;
	className?: string;
}) {
	const cols = columns ?? Math.min(Math.max(metrics.length, 1), 4);

	return (
		<Frame className={className}>
			<FramePanel className="overflow-hidden p-0!">
				{/* Subtle glass sheen over the solid card panel */}
				<div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent" />

				<div
					className={cn("relative z-10 grid grid-cols-1", GRID_COLS[cols])}
				>
					{metrics.map((metric, index) => {
						const Icon = metric.icon;
						return (
							<div
								key={metric.label}
								className={cn(
									"flex min-h-[150px] flex-col overflow-hidden p-4",
									cellBorders(index, metrics.length, cols)
								)}
							>
								<div className="flex flex-1 flex-col justify-between gap-3">
									<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
										<Icon className="h-4 w-4 text-primary" />
									</div>

									<div className="flex flex-col gap-1">
										<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
											{metric.label}
										</p>
										<div className="flex items-center gap-1.5">
											<p className="text-2xl font-bold leading-tight text-foreground">
												{metric.value}
											</p>
											{metric.trend && (
												<span
													className={cn(
														"rounded-md px-1.5 py-0.5 text-xs font-medium",
														metric.trend.direction === "up"
															? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
															: "bg-amber-500/10 text-amber-600 dark:text-amber-400"
													)}
												>
													{metric.trend.value}
												</span>
											)}
										</div>
										{metric.description && (
											<p className="text-xs leading-relaxed text-muted-foreground">
												{metric.description}
											</p>
										)}
									</div>
								</div>

								<MetricAreaShape index={index} />
							</div>
						);
					})}
				</div>
			</FramePanel>
		</Frame>
	);
}
