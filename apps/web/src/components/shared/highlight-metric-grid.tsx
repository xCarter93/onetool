import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Frame, FramePanel } from "@/components/reui/frame";
import { cn } from "@/lib/utils";

export interface HighlightMetric {
	icon: LucideIcon;
	label: string;
	value: React.ReactNode;
	description?: string;
	trend?: { value: string; direction: "up" | "down" };
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
		!isLast && "max-sm:border-b",
		!inLastCol && "sm:border-r",
		inLastRow ? "sm:border-b-0" : "sm:border-b"
	);
}

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
		<Frame className={cn("workspace-highlight-metrics", className)}>
			<FramePanel className="overflow-hidden p-0!">
				<div className={cn("grid grid-cols-1", GRID_COLS[cols])}>
					{metrics.map((metric, index) => {
						const Icon = metric.icon;
						return (
							<div
								key={metric.label}
								className={cn(
									"flex flex-col overflow-hidden p-4",
									cellBorders(index, metrics.length, cols)
								)}
							>
								<div className="flex flex-1 flex-col gap-2">
									<div className="flex items-center">
										<Icon className="h-4 w-4 text-primary" />
									</div>

									<div className="flex flex-col gap-1">
										<p className="text-xs font-medium text-muted-foreground">
											{metric.label}
										</p>
										<div className="flex items-center gap-1.5">
											<p className="text-2xl font-semibold leading-tight text-foreground tabular-nums">
												{metric.value}
											</p>
											{metric.trend && (
												<span
													className={cn(
														"rounded-md px-1.5 py-0.5 text-xs font-medium",
														metric.trend.direction === "up"
															? "bg-success/10 text-success-foreground"
															: "bg-warning/10 text-warning-foreground"
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

							</div>
						);
					})}
				</div>
			</FramePanel>
		</Frame>
	);
}
