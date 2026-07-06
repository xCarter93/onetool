"use client";

import { Frame } from "@/components/reui/frame";
import DatePickerRange from "@/components/shared/date-picker-range";
import { DateRange } from "react-day-picker";
import type { MetricDataMap, MetricDefinition } from "@/components/line-chart-6";
import { MetricCards } from "./metric-cards";
import { MetricChartBody } from "./metric-chart";

/**
 * The Overview module: one Frame titled "Business Overview" holding the six
 * selectable KPI cards on top and the big chart for the selected metric below.
 * A single date-range control in the header governs the whole module.
 */
export function OverviewPanel({
	metrics,
	dataByMetric,
	activeMetric,
	activeMetricDef,
	onSelect,
	dateRange,
	onDateRangeChange,
	title = "Business Overview",
}: {
	metrics: MetricDefinition[];
	dataByMetric: MetricDataMap;
	activeMetric: string;
	activeMetricDef: MetricDefinition;
	onSelect: (key: string) => void;
	dateRange?: DateRange;
	onDateRangeChange?: (range?: DateRange) => void;
	title?: string;
}) {
	return (
		<Frame className="w-full">
			<div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1 pb-0.5">
				<div className="min-w-0">
					<h2 className="text-sm font-semibold text-foreground">{title}</h2>
					<p className="text-xs text-muted-foreground">
						Select a metric to chart its trend
					</p>
				</div>
				<div className="w-full sm:w-auto">
					<DatePickerRange
						value={dateRange}
						onChange={(range) => onDateRangeChange?.(range)}
						align="end"
						showArrow={false}
					/>
				</div>
			</div>

			<MetricCards
				metrics={metrics}
				dataByMetric={dataByMetric}
				activeMetric={activeMetric}
				onSelect={onSelect}
			/>

			<MetricChartBody
				metric={activeMetricDef}
				data={dataByMetric[activeMetric] ?? []}
			/>
		</Frame>
	);
}
