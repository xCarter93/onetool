"use client";

/**
 * Shared empty-plot hint for report charts. Used whenever a chart receives
 * an empty data array OR every value is 0 — regression: an all-zero pie
 * used to render a blank canvas instead of an explanatory state.
 */
export function isChartDataEmpty(data: { value: number }[]): boolean {
	return data.length === 0 || data.every((d) => d.value === 0);
}

interface ChartNoDataProps {
	/** Overrides the default copy — used by the radar "needs 3+ groups" case. */
	message?: string;
	detail?: string;
}

export function ChartNoData({
	message = "No data for this date range.",
	detail = "Try a wider date range or different filters.",
}: ChartNoDataProps) {
	return (
		<div
			data-slot="chart-no-data"
			className="flex min-h-[300px] w-full flex-col items-center justify-center gap-1 text-center"
		>
			<p className="text-sm font-medium text-muted-foreground">{message}</p>
			<p className="text-xs text-muted-foreground/70">{detail}</p>
		</div>
	);
}
