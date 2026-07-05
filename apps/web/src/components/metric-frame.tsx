"use client";

import * as React from "react";

import { Frame, FrameFooter, FramePanel } from "@/components/reui/frame";
import { DotField } from "@/components/ui/dot-field";
import { cn } from "@/lib/utils";

export type MetricFrameItem = {
	/** Short metric name, e.g. "Total Projects". */
	label: string;
	/** Formatted value (number, currency string, or node). Ignored while loading. */
	value: React.ReactNode;
	/** Optional line under the value, e.g. "All projects in your workspace". */
	hint?: string;
	/** Lucide icon element; sized by the chip. */
	icon: React.ReactNode;
	/** CSS color for the icon + its tinted chip. Defaults to the primary token. */
	accent?: string;
};

export interface MetricFrameProps {
	metrics: MetricFrameItem[];
	/** Optional one-line rollup rendered in the frame footer. */
	summary?: React.ReactNode;
	/** Show value skeletons while data loads. */
	loading?: boolean;
	className?: string;
}

const DEFAULT_ACCENT = "var(--color-primary)";

// Explicit column classes so Tailwind's JIT keeps them (dynamic strings get purged).
const GRID_COLS: Record<number, string> = {
	1: "sm:grid-cols-1",
	2: "sm:grid-cols-2",
	3: "sm:grid-cols-3",
	4: "sm:grid-cols-4",
};

/**
 * A framed row of KPI cards over a masked dot field. Fuses ReUI's Frame shell +
 * dot-field backdrop with large single-number metric cells and an optional
 * footer summary. Used at the top of the workspace list pages.
 */
export function MetricFrame({
	metrics,
	summary,
	loading = false,
	className,
}: MetricFrameProps) {
	return (
		<Frame className={cn("w-full", className)}>
			<FramePanel className="isolate [&::before]:z-0">
				{/* Dot field in brand blue, anchored at the top and fading out toward the middle. */}
				<DotField className="text-primary [mask-image:linear-gradient(to_bottom,black,transparent_65%)]" />

				<div
					className={cn(
						"relative z-10 grid grid-cols-1 divide-y divide-border/60 sm:divide-x sm:divide-y-0",
						GRID_COLS[metrics.length] ?? "sm:grid-cols-3"
					)}
				>
					{metrics.map((metric) => (
						<div
							key={metric.label}
							className="flex flex-col gap-3.5 px-2 py-3 first:pt-0 sm:px-5 sm:py-1 sm:first:pl-1"
						>
							<div className="flex items-center gap-2.5">
								<span
									className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-current/10 [&_svg]:size-[18px]"
									style={{ color: metric.accent ?? DEFAULT_ACCENT }}
									aria-hidden="true"
								>
									{metric.icon}
								</span>
								<span className="text-muted-foreground text-sm font-medium">
									{metric.label}
								</span>
							</div>

							<div className="flex flex-col gap-1">
								{loading ? (
									<span className="my-0.5 inline-block h-8 w-20 animate-pulse rounded-md bg-muted" />
								) : (
									<span className="text-foreground text-3xl font-semibold tracking-tight tabular-nums">
										{metric.value}
									</span>
								)}
								{metric.hint ? (
									<span className="text-muted-foreground text-xs">
										{metric.hint}
									</span>
								) : null}
							</div>
						</div>
					))}
				</div>
			</FramePanel>

			{summary ? (
				<FrameFooter className="text-muted-foreground px-4 py-2! text-xs">
					{summary}
				</FrameFooter>
			) : null}
		</Frame>
	);
}
